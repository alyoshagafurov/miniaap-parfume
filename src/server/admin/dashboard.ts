import { requireAdminPage } from "@/server/auth/roles";
import { prisma } from "@/server/db";

/**
 * The numbers on the admin home screen.
 *
 * Guarded here rather than only in the page. A page is one caller; this is the
 * thing that reads the data, and the guard belongs where the data is rather
 * than wherever someone remembered to put it.
 *
 * Never cached. A dashboard whose counters are an hour old is worse than no
 * dashboard, because the owner would act on it.
 */
export interface DashboardCounts {
  published: number;
  drafts: number;
  withoutPhoto: number;
  categories: number;
  newOrders: number;
}

export async function getDashboardCounts(): Promise<DashboardCounts> {
  await requireAdminPage();

  const [published, drafts, withoutPhoto, categories, newOrders] = await Promise.all([
    prisma.product.count({ where: { status: "PUBLISHED" } }),
    prisma.product.count({ where: { status: "DRAFT" } }),
    // Archived rows are out of the catalog by definition; counting their
    // missing photographs would make the number look like work that is due.
    prisma.product.count({
      where: { status: { not: "ARCHIVED" }, images: { none: {} } },
    }),
    prisma.category.count(),
    prisma.order.count({ where: { status: "NEW" } }),
  ]);

  return { published, drafts, withoutPhoto, categories, newOrders };
}

export interface AttentionRow {
  href: string;
  label: string;
  count: number;
}

/**
 * «Доделать»: what is waiting on the owner, most urgent first.
 *
 * New requests lead, because a buyer is waiting on those and on nothing else
 * in the list. The Telegram notice is the main way a request reaches the
 * client, but it is best-effort by design — create.ts lets no failure of it
 * reach the buyer and calls the panel the record — and with orders out of the
 * menu this row is the panel's only way to one that was missed. A row, not a
 * sixth section: the client asked for five.
 *
 * Rows at zero are dropped. A row saying «0» is a row asking to be read for
 * nothing.
 */
export function attentionRows(counts: DashboardCounts): AttentionRow[] {
  return [
    {
      href: "/admin/orders?status=NEW",
      label: "Новые заявки",
      count: counts.newOrders,
    },
    { href: "/admin/products?status=DRAFT", label: "Черновики", count: counts.drafts },
    {
      href: "/admin/products?photo=none",
      label: "Без фото",
      count: counts.withoutPhoto,
    },
  ].filter((row) => row.count > 0);
}
