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
}

export async function getDashboardCounts(): Promise<DashboardCounts> {
  await requireAdminPage();

  const [published, drafts, withoutPhoto, categories] = await Promise.all([
    prisma.product.count({ where: { status: "PUBLISHED" } }),
    prisma.product.count({ where: { status: "DRAFT" } }),
    // Archived rows are out of the catalog by definition; counting their
    // missing photographs would make the number look like work that is due.
    prisma.product.count({
      where: { status: { not: "ARCHIVED" }, images: { none: {} } },
    }),
    prisma.category.count(),
  ]);

  return { published, drafts, withoutPhoto, categories };
}
