import { z } from "zod";

import { prisma } from "@/server/db";
import { rateLimit } from "@/server/rate-limit";
import { readSettings } from "@/server/settings";
import { telegramApi } from "@/server/telegram/client";
import { verifyInitData } from "@/server/telegram/init-data";
import { notifyNewOrder } from "@/server/telegram/notify";

import { quoteCart, type CatalogEntry, type Quote } from "./quote";
import { reconcileCart, type LineChange, type CartSnapshotLine } from "./reconcile";

/**
 * Submitting a request.
 *
 * The client's basket is a suggestion. Everything that decides what the request
 * costs — the price, the pack multiple, whether the product is even available —
 * is read from the catalog here. The form carries no price field at all, and if
 * one arrives it is stripped by the schema rather than trusted.
 */

/** 5 per 10 minutes, per the brief. Applied to the buyer and to the IP. */
const RATE_LIMIT = { limit: 5, windowSeconds: 600 } as const;

/**
 * Normalises a Russian phone number to +7XXXXXXXXXX, or null.
 *
 * Buyers type 8, +7, spaces, brackets and dashes interchangeably. Storing one
 * shape means the manager can dial it and a repeat customer is recognisable.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  // 8XXXXXXXXXX and 7XXXXXXXXXX are the same number written two ways.
  const national =
    digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))
      ? digits.slice(1)
      : digits.length === 10
        ? digits
        : null;
  if (!national || !/^9\d{9}$/.test(national)) return null;
  return `+7${national}`;
}

/**
 * A basket line carries what the storefront displayed alongside the quantity.
 *
 * Required, not optional. The storefront is cached for an hour, so its price
 * can lag the catalog; these fields are how the server detects that and refuses
 * to submit on a total the buyer never saw. Making them optional would make the
 * check skippable, which is the same as not having it.
 *
 * They are never used for pricing — only for comparison.
 */
const itemSchema = z.object({
  productId: z.string().min(1).max(64),
  qty: z.number().int().positive().max(9999),
  seenPriceKop: z.number().int().min(0).max(2_147_483_647),
  seenPackSize: z.number().int().min(1).max(9999),
  seenStock: z.enum(["IN_STOCK", "LOW", "OUT", "PREORDER"]),
});

export const createOrderSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя").max(120),
  phone: z.string().trim().min(1, "Укажите телефон").max(30),
  city: z.string().trim().min(2, "Укажите город").max(120),
  delivery: z.enum(["CDEK", "RUSSIAN_POST", "TRANSPORT_COMPANY", "PICKUP"]),
  comment: z.string().trim().max(1000, "Комментарий слишком длинный").default(""),
  consent: z.literal(true, { message: "Нужно согласие на обработку данных" }),
  /**
   * Honeypot. A field positioned off-screen and hidden from assistive
   * technology, so a person never fills it and a naive bot fills everything.
   */
  website: z.string().max(0).optional(),
  items: z.array(itemSchema).min(1, "Заявка пуста").max(200),
});

export type OrderInput = z.infer<typeof createOrderSchema>;

export type ParseResult =
  | { ok: true; data: Omit<OrderInput, "website"> }
  | { ok: false; fieldErrors: Record<string, string>; honeypot: boolean };

export function parseOrderInput(raw: unknown): ParseResult {
  const parsed = createOrderSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key])
        fieldErrors[key] = issue.message;
    }
    // A filled honeypot is the only failure not worth a message.
    return { ok: false, fieldErrors, honeypot: "website" in fieldErrors };
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!phone) {
    return {
      ok: false,
      fieldErrors: { phone: "Неверный номер телефона" },
      honeypot: false,
    };
  }

  const { website: _honeypot, ...data } = parsed.data;
  return { ok: true, data: { ...data, phone } };
}

export interface CreateOrderContext {
  /** Present when the request comes from inside the Mini App. */
  initDataRaw?: string | null;
  botToken?: string | null;
  /** For rate limiting. Behind a proxy this is the real client address. */
  ip: string;
}

export type CreateOrderResult =
  | { ok: true; orderId: string; number: string; totalKop: number; quote: Quote }
  | {
      ok: false;
      reason: "VALIDATION" | "RATE_LIMITED" | "BELOW_MINIMUM" | "UNAVAILABLE" | "CHANGED";
      message: string;
      fieldErrors?: Record<string, string>;
      quote?: Quote;
      /** Present on CHANGED: what moved, so the screen can show было → стало. */
      changes?: LineChange[];
      totalKop?: number;
      previousTotalKop?: number;
      /** The basket as it now is; the client stores this and resubmits. */
      correctedLines?: CartSnapshotLine[];
    };

export async function createOrder(
  raw: unknown,
  ctx: CreateOrderContext,
): Promise<CreateOrderResult> {
  const parsed = parseOrderInput(raw);
  if (!parsed.ok) {
    // A bot gets the same generic failure as a mistyped form, so filling the
    // honeypot teaches it nothing.
    return {
      ok: false,
      reason: "VALIDATION",
      message: parsed.honeypot
        ? "Не удалось отправить заявку"
        : "Проверьте заполнение формы",
      fieldErrors: parsed.honeypot ? {} : parsed.fieldErrors,
    };
  }
  const input = parsed.data;

  // Who is asking. A signed initData is proof; its absence is simply the web.
  const identity = ctx.initDataRaw
    ? verifyInitData(ctx.initDataRaw, ctx.botToken ?? process.env.BOT_TOKEN)
    : null;
  const telegramId = identity?.ok ? identity.user.telegramId : null;

  // Both limits, because either alone is trivially evaded: one Telegram account
  // can change networks, and one network can hold many accounts.
  const keys = [
    `order:ip:${ctx.ip}`,
    ...(telegramId ? [`order:tg:${telegramId}`] : []),
  ];
  for (const key of keys) {
    const limited = await rateLimit(key, RATE_LIMIT);
    if (!limited.allowed) {
      return {
        ok: false,
        reason: "RATE_LIMITED",
        message: limited.storeUnavailable
          ? "Сервис временно недоступен. Попробуйте через минуту."
          : "Слишком много заявок подряд. Попробуйте позже.",
      };
    }
  }

  const settings = await readSettings();

  // Priced from the catalog, never from the request.
  const products = await prisma.product.findMany({
    where: { id: { in: input.items.map((i) => i.productId) } },
    select: {
      id: true,
      sku: true,
      title: true,
      priceKop: true,
      packSize: true,
      stock: true,
      status: true,
      volumeMl: true,
      images: { select: { key: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      fragrances: {
        select: { fragrance: { select: { brand: { select: { name: true } } } } },
        orderBy: { position: "asc" },
        take: 1,
      },
    },
  });

  const catalog: Record<string, CatalogEntry> = {};
  for (const p of products) {
    catalog[p.id] = {
      id: p.id,
      sku: p.sku,
      title: p.title,
      brandName: p.fragrances[0]?.fragrance.brand.name ?? "ÁRUMI",
      format: `${p.volumeMl} мл`,
      priceKop: p.priceKop,
      packSize: p.packSize,
      stock: p.stock,
      status: p.status,
      imageKey: p.images[0]?.key ?? null,
    };
  }

  // quoteCart throws RangeError once the running total passes the Int column's
  // ceiling, which 200 lines of 9999 units reaches for any product priced above
  // about eleven roubles — that is every product here. Nothing is written by
  // then, so the only defect was the buyer getting an opaque server error
  // instead of something they could act on.
  let quote: Quote;
  try {
    quote = quoteCart(input.items, catalog, {
      minOrderKop: settings.minOrderKop,
      showPrices: settings.showPrices,
    });
  } catch {
    return {
      ok: false,
      reason: "VALIDATION",
      message: "Сумма заявки слишком велика. Разделите её на несколько заявок.",
    };
  }

  if (quote.lines.length === 0) {
    return {
      ok: false,
      reason: "UNAVAILABLE",
      message: "Ни одна позиция больше не доступна",
      quote,
    };
  }
  // Did the catalog move under the buyer between the storefront and here?
  // Checked before the minimum, because a buyer told "you are 300 ₽ short"
  // when the real news is "the price went up" has been told the wrong thing.
  const reconciliation = reconcileCart(input.items, quote);
  if (reconciliation.changed) {
    return {
      ok: false,
      reason: "CHANGED",
      message: "Каталог изменился с момента добавления в заявку",
      quote,
      changes: reconciliation.changes,
      totalKop: reconciliation.totalKop,
      previousTotalKop: reconciliation.previousTotalKop,
      correctedLines: reconciliation.correctedLines,
    };
  }

  if (!quote.meetsMinimum) {
    return {
      ok: false,
      reason: "BELOW_MINIMUM",
      message: "Сумма заявки меньше минимального заказа",
      quote,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    // The buyer is recorded only when Telegram vouched for them.
    const telegramUserId = telegramId
      ? (
          await tx.telegramUser.upsert({
            where: { telegramId },
            update: { lastSeenAt: new Date(), botBlocked: false },
            create: {
              telegramId,
              firstName: identity?.ok ? identity.user.firstName : null,
            },
            select: { id: true },
          })
        ).id
      : null;

    // A sequence, not max(number)+1: two buyers submitting at the same moment
    // must not be handed the same number.
    const [seq] = await tx.$queryRaw<Array<{ n: number }>>`
      SELECT nextval('order_number_seq')::int AS n
    `;
    const number = `ARM-${String(seq?.n ?? 0).padStart(6, "0")}`;

    const order = await tx.order.create({
      data: {
        number,
        telegramUserId,
        source: telegramId ? "TELEGRAM" : "WEB",
        name: input.name,
        phone: input.phone,
        city: input.city,
        delivery: input.delivery,
        comment: input.comment || null,
        // Placeholder: recomputed below from the rows actually written, so the
        // stored total can never disagree with its own items.
        totalKop: 0,
        items: {
          create: quote.lines.map((l) => ({
            productId: l.productId,
            sku: l.sku,
            title: l.title,
            brandName: l.brandName,
            format: l.format,
            priceKop: l.priceKop,
            qty: l.qty,
            imageKey: l.imageKey,
          })),
        },
      },
      select: {
        id: true,
        number: true,
        items: { select: { priceKop: true, qty: true } },
      },
    });

    // Finding 4 from the schema review: totalKop has no database-level tie to
    // the sum of its items, so it is derived from the persisted rows inside the
    // same transaction rather than from the in-memory quote.
    const totalKop = order.items.reduce((sum, i) => sum + i.priceKop * i.qty, 0);
    await tx.order.update({ where: { id: order.id }, data: { totalKop } });

    return { id: order.id, number: order.number, totalKop };
  });

  // Told about, not dependent on. The request is committed; a relay that is
  // briefly unreachable must not turn a recorded order into a lost one, so
  // every failure here is swallowed and the admin panel remains the record.
  try {
    await notifyNewOrder(
      telegramApi(),
      {
        adminChatId: process.env.ADMIN_CHAT_ID ?? null,
        adminOrderUrl: (id) =>
          `${(process.env.MINI_APP_URL ?? "").replace(/\/+$/, "")}/admin/orders/${id}`,
        markBlocked: async (id) => {
          await prisma.telegramUser.updateMany({
            where: { telegramId: id },
            data: { botBlocked: true },
          });
        },
      },
      {
        orderId: created.id,
        number: created.number,
        name: input.name,
        phone: input.phone,
        city: input.city,
        delivery: input.delivery,
        comment: input.comment || null,
        totalKop: created.totalKop,
        username: identity?.ok ? (identity.user.username ?? null) : null,
        telegramId,
        lines: quote.lines.map((l) => ({
          title: l.title,
          sku: l.sku,
          qty: l.qty,
          lineTotalKop: l.lineTotalKop,
        })),
      },
      { showPrices: settings.showPrices },
    );
  } catch {
    // Includes the case where BOT_TOKEN is not configured at all, which is
    // exactly the state this project is in until the client supplies one.
  }

  return {
    ok: true,
    orderId: created.id,
    number: created.number,
    totalKop: created.totalKop,
    quote,
  };
}
