import { prisma } from "@/server/db";

/**
 * A buyer's own requests.
 *
 * Scoped by the Telegram id every time, in the query rather than after it. An
 * order history is the whole of someone's contact details and what they buy;
 * loading by id and checking ownership afterwards is one forgotten branch away
 * from handing it to the wrong person, and the check cannot be forgotten if it
 * is the WHERE clause.
 *
 * Not cached, and never will be. The identity is part of the answer.
 */

export interface HistoryLine {
  productId: string | null;
  sku: string;
  title: string;
  brandName: string;
  format: string;
  priceKop: number;
  qty: number;
  imageKey: string | null;
}

export interface HistoryOrder {
  id: string;
  number: string;
  status: string;
  totalKop: number;
  createdAt: Date;
  city: string;
  delivery: string;
  items: HistoryLine[];
}

/** Deep enough for a wholesale buyer to find last month's order. */
const HISTORY_LIMIT = 50;

export async function listOrdersFor(telegramId: bigint): Promise<HistoryOrder[]> {
  return prisma.order.findMany({
    where: { telegramUser: { telegramId } },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: {
      id: true,
      number: true,
      status: true,
      totalKop: true,
      createdAt: true,
      city: true,
      delivery: true,
      items: {
        select: {
          productId: true,
          sku: true,
          title: true,
          brandName: true,
          format: true,
          priceKop: true,
          qty: true,
          imageKey: true,
        },
      },
    },
  });
}

export interface RepeatLine {
  productId: string;
  qty: number;
  seenPriceKop: number;
  seenPackSize: number;
  seenStock: "IN_STOCK" | "LOW" | "OUT" | "PREORDER";
  slug: string;
  title: string;
  brandName: string;
  format: string;
  imageKey: string | null;
}

export interface RepeatResult {
  lines: RepeatLine[];
  /** What could not be repeated, and why, so the screen can say so by name. */
  unavailable: Array<{ title: string; reason: "GONE" | "OUT_OF_STOCK" }>;
}

/**
 * Rebuilding a past request at today's prices.
 *
 * The order's own lines are a snapshot — the price it was placed at, the title
 * as it read then. None of that is reused for the new basket: prices move, packs
 * change, products are withdrawn, and a repeat that quietly restored last
 * month's price would be a basket the server refuses on submission with a
 * "каталог изменился" the buyer cannot act on.
 *
 * So every line is looked up fresh, and anything that cannot be bought today is
 * reported by name rather than dropped in silence.
 */
export async function repeatOrderFor(
  orderId: string,
  telegramId: bigint,
): Promise<RepeatResult | null> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, telegramUser: { telegramId } },
    select: {
      items: {
        select: { productId: true, title: true, brandName: true, qty: true },
      },
    },
  });
  if (!order) return null;

  const ids = order.items.flatMap((i) => (i.productId ? [i.productId] : []));
  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids }, status: "PUBLISHED" },
        select: {
          id: true,
          slug: true,
          priceKop: true,
          packSize: true,
          stock: true,
          volumeMl: true,
          images: { select: { key: true }, orderBy: { sortOrder: "asc" }, take: 1 },
          fragrances: {
            select: { fragrance: { select: { name: true, brand: { select: { name: true } } } } },
            orderBy: { position: "asc" },
          },
        },
      })
    : [];

  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: RepeatLine[] = [];
  const unavailable: RepeatResult["unavailable"] = [];

  for (const item of order.items) {
    const product = item.productId ? byId.get(item.productId) : undefined;
    if (!product) {
      unavailable.push({ title: item.title, reason: "GONE" });
      continue;
    }
    if (product.stock === "OUT") {
      unavailable.push({ title: item.title, reason: "OUT_OF_STOCK" });
      continue;
    }

    const pack = Math.max(1, product.packSize);
    const names = product.fragrances.map((f) => f.fragrance.name);
    lines.push({
      productId: product.id,
      // The pack may have grown since; round up, the same way everything else
      // does, rather than send a quantity the server will silently correct.
      qty: Math.ceil(item.qty / pack) * pack,
      seenPriceKop: product.priceKop,
      seenPackSize: pack,
      seenStock: product.stock,
      slug: product.slug,
      title: names.join(" + ") || item.title,
      brandName: product.fragrances[0]?.fragrance.brand.name ?? item.brandName,
      format: `${product.volumeMl} мл`,
      imageKey: product.images[0]?.key ?? null,
    });
  }

  return { lines, unavailable };
}
