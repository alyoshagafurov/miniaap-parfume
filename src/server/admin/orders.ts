import { ORDER_STATUSES, isOrderStatus, type OrderStatus } from "@/lib/orders";

// Re-exported so a server caller needs one import, not two.
export type { OrderStatus };
import { requireAdminPage, requirePermission } from "@/server/auth/roles";
import { prisma } from "@/server/db";

/**
 * Requests, for the manager.
 *
 * Every function guards for itself. A page is one caller and a Server Action is
 * a POST endpoint that can be invoked with no page ever rendered, so the check
 * lives with the data rather than wherever it was remembered.
 *
 * Nothing here returns a Prisma row directly. `TelegramUser.telegramId` is a
 * BigInt, and a BigInt does not cross the boundary into a client component or
 * through JSON.stringify — it throws. Handing a Prisma row to a screen would
 * work until the first screen that needs the buyer's Telegram account, and then
 * fail at runtime rather than at build. So the shape is stated, and the id is a
 * string in it.
 */

export interface OrderSummary {
  id: string;
  number: string;
  status: OrderStatus;
  source: string;
  name: string;
  phone: string;
  city: string;
  totalKop: number;
  itemCount: number;
  createdAt: Date;
}

export interface OrderDetail extends OrderSummary {
  delivery: string;
  comment: string | null;
  /** A string, never the BigInt: see the note at the top of this file. */
  telegramId: string | null;
  telegramUsername: string | null;
  botBlocked: boolean;
  items: Array<{
    id: string;
    productId: string | null;
    sku: string;
    title: string;
    brandName: string;
    format: string;
    priceKop: number;
    qty: number;
  }>;
}

const PAGE_SIZE = 30;

export interface OrderListResult {
  orders: OrderSummary[];
  total: number;
  counts: Record<OrderStatus, number>;
}

export async function listOrders(params: {
  status?: OrderStatus | undefined;
  query?: string | undefined;
  skip?: number | undefined;
}): Promise<OrderListResult> {
  await requireAdminPage();

  const query = params.query?.trim();
  const where = {
    ...(params.status ? { status: params.status } : {}),
    // Number, name, phone and city — the four things a manager has in front of
    // them when a buyer calls back about an order.
    ...(query
      ? {
          OR: [
            { number: { contains: query, mode: "insensitive" as const } },
            { name: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query } },
            { city: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: params.skip ?? 0,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        status: true,
        source: true,
        name: true,
        phone: true,
        city: true,
        totalKop: true,
        createdAt: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
    // Counted across every status, not within the current filter: the tabs have
    // to say how many are waiting even while looking at the finished ones.
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0])) as Record<
    OrderStatus,
    number
  >;
  for (const row of grouped) {
    if (isOrderStatus(row.status)) counts[row.status] = row._count._all;
  }

  return {
    orders: rows.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status as OrderStatus,
      source: row.source,
      name: row.name,
      phone: row.phone,
      city: row.city,
      totalKop: row.totalKop,
      itemCount: row._count.items,
      createdAt: row.createdAt,
    })),
    total,
    counts,
  };
}

export async function getOrder(id: string): Promise<OrderDetail | null> {
  await requireAdminPage();

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      source: true,
      name: true,
      phone: true,
      city: true,
      delivery: true,
      comment: true,
      totalKop: true,
      createdAt: true,
      telegramUser: {
        select: { telegramId: true, username: true, botBlocked: true },
      },
      items: {
        select: {
          id: true,
          productId: true,
          sku: true,
          title: true,
          brandName: true,
          format: true,
          priceKop: true,
          qty: true,
        },
      },
    },
  });
  if (!order) return null;

  return {
    id: order.id,
    number: order.number,
    status: order.status as OrderStatus,
    source: order.source,
    name: order.name,
    phone: order.phone,
    city: order.city,
    delivery: order.delivery,
    comment: order.comment,
    totalKop: order.totalKop,
    itemCount: order.items.length,
    createdAt: order.createdAt,
    telegramId: order.telegramUser ? String(order.telegramUser.telegramId) : null,
    telegramUsername: order.telegramUser?.username ?? null,
    botBlocked: order.telegramUser?.botBlocked ?? false,
    items: order.items,
  };
}

/**
 * Moves a request along.
 *
 * The only thing an administrator may change about a request. The lines, the
 * prices and the total are a record of what was agreed, and a back office that
 * can quietly edit them is a back office where "what did we actually promise"
 * has no answer. Editing an order, if it is ever wanted, has to arrive with a
 * decision about the audit trail — and with the rule that totalKop is
 * recomputed from the rows in the same transaction, which nothing at the
 * database level enforces.
 */
export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  await requirePermission("orders:write");
  await prisma.order.update({ where: { id }, data: { status } });
}
