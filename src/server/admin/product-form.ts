import { requireAdminPage } from "@/server/auth/roles";
import { prisma } from "@/server/db";

/**
 * What the product form needs to render.
 *
 * Categories and brands in full — there are four and a dozen — but fragrances
 * are searched rather than listed: thirty today, hundreds once the real range
 * is entered, and a select with hundreds of options is a select nobody uses.
 */

export interface ProductFormData {
  product: {
    id: string;
    sku: string;
    title: string;
    slug: string;
    categoryId: string;
    volumeMl: number;
    priceKop: number;
    oldPriceKop: number | null;
    packSize: number;
    stock: string;
    status: string;
    isNew: boolean;
    isHit: boolean;
    popularity: number;
    fragrances: Array<{ id: string; name: string; brandName: string }>;
    images: Array<{ id: string; key: string; width: number; height: number }>;
  } | null;
  categories: Array<{ id: string; name: string }>;
}

export async function getProductForm(id: string | null): Promise<ProductFormData> {
  await requireAdminPage();

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  if (!id) return { product: null, categories };

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      sku: true,
      title: true,
      slug: true,
      categoryId: true,
      volumeMl: true,
      priceKop: true,
      oldPriceKop: true,
      packSize: true,
      stock: true,
      status: true,
      isNew: true,
      isHit: true,
      popularity: true,
      fragrances: {
        orderBy: { position: "asc" },
        select: {
          fragrance: { select: { id: true, name: true, brand: { select: { name: true } } } },
        },
      },
      images: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, key: true, width: true, height: true },
      },
    },
  });
  if (!product) return { product: null, categories };

  return {
    categories,
    product: {
      ...product,
      fragrances: product.fragrances.map((f) => ({
        id: f.fragrance.id,
        name: f.fragrance.name,
        brandName: f.fragrance.brand.name,
      })),
    },
  };
}

export interface FragranceOption {
  id: string;
  name: string;
  brandName: string;
  brandId: string;
}

/**
 * Fragrances matching what the administrator is typing.
 *
 * Matched on the brand as well as the name, because «шанель шанс» is how a
 * person looks for Chance and the fragrance row only holds "Chance".
 */
export async function searchFragrances(query: string): Promise<FragranceOption[]> {
  await requireAdminPage();

  const q = query.trim();
  const rows = await prisma.fragrance.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { aliases: { has: q.toLowerCase() } },
            { brand: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {},
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    take: 20,
    select: { id: true, name: true, brand: { select: { id: true, name: true } } },
  });

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brandName: r.brand.name,
    brandId: r.brand.id,
  }));
}

/** Brands, for creating a fragrance without leaving the product form. */
export async function listBrandOptions(): Promise<Array<{ id: string; name: string }>> {
  await requireAdminPage();
  return prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}
