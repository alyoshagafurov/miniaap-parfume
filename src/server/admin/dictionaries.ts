import { requireAdminPage } from "@/server/auth/roles";
import { prisma } from "@/server/db";

/**
 * The three things a product is assembled from.
 *
 * Brands and categories are counted in dozens and are read whole; fragrances
 * are searched and paged, because the real range is several hundred.
 *
 * Every row carries how many things depend on it. That number is the difference
 * between "delete" being a button and being a decision — a brand with twelve
 * fragrances cannot be removed, and saying so before the click is better than
 * refusing after it.
 */

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  sortOrder: number;
  isPublished: boolean;
  fragranceCount: number;
}

export async function listBrands(): Promise<BrandRow[]> {
  await requireAdminPage();
  const rows = await prisma.brand.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      aliases: true,
      sortOrder: true,
      isPublished: true,
      _count: { select: { fragrances: true } },
    },
  });
  return rows.map(({ _count, ...rest }) => ({
    ...rest,
    fragranceCount: _count.fragrances,
  }));
}

export interface CategoryRow {
  id: string;
  name: string;
  subtitle: string | null;
  slug: string;
  coverKey: string | null;
  sortOrder: number;
  isPublished: boolean;
  productCount: number;
}

export async function listCategories(): Promise<CategoryRow[]> {
  await requireAdminPage();
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      subtitle: true,
      slug: true,
      coverKey: true,
      sortOrder: true,
      isPublished: true,
      _count: { select: { products: true } },
    },
  });
  return rows.map(({ _count, ...rest }) => ({
    ...rest,
    productCount: _count.products,
  }));
}

export interface FragranceRow {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  gender: string;
  families: string[];
  aliasCount: number;
  noteCount: number;
  hasDescription: boolean;
  productCount: number;
  /** The formats it is sold in — the thing this catalog is organised around. */
  formats: string[];
}

const FRAGRANCE_PAGE = 50;

export interface FragrancePage {
  rows: FragranceRow[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listFragrances(params: {
  q: string;
  brandSlug: string | null;
  page: number;
}): Promise<FragrancePage> {
  await requireAdminPage();

  const q = params.q.trim();
  const where = {
    ...(params.brandSlug ? { brand: { slug: params.brandSlug } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { aliases: { has: q.toLowerCase() } },
            { brand: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const total = await prisma.fragrance.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / FRAGRANCE_PAGE));
  const page = Math.min(Math.max(1, params.page), pageCount);

  const rows = await prisma.fragrance.findMany({
    where,
    orderBy: [{ brand: { name: "asc" } }, { name: "asc" }],
    skip: (page - 1) * FRAGRANCE_PAGE,
    take: FRAGRANCE_PAGE,
    select: {
      id: true,
      name: true,
      slug: true,
      gender: true,
      families: true,
      aliases: true,
      notesTop: true,
      notesHeart: true,
      notesBase: true,
      description: true,
      brand: { select: { name: true } },
      products: {
        select: {
          product: { select: { volumeMl: true, category: { select: { name: true } } } },
        },
        orderBy: { product: { volumeMl: "asc" } },
      },
    },
  });

  return {
    total,
    page,
    pageCount,
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      brandName: r.brand.name,
      gender: r.gender,
      families: r.families,
      aliasCount: r.aliases.length,
      noteCount: r.notesTop.length + r.notesHeart.length + r.notesBase.length,
      hasDescription: Boolean(r.description),
      productCount: r.products.length,
      formats: [...new Set(r.products.map((p) => `${p.product.volumeMl} мл`))],
    })),
  };
}

export interface FragranceDetail {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  aliases: string[];
  gender: string;
  families: string[];
  notesTop: string[];
  notesHeart: string[];
  notesBase: string[];
  description: string | null;
  products: Array<{ id: string; sku: string; volumeMl: number; categoryName: string }>;
}

export async function getFragrance(id: string): Promise<FragranceDetail | null> {
  await requireAdminPage();
  const row = await prisma.fragrance.findUnique({
    where: { id },
    select: {
      id: true,
      brandId: true,
      name: true,
      slug: true,
      aliases: true,
      gender: true,
      families: true,
      notesTop: true,
      notesHeart: true,
      notesBase: true,
      description: true,
      products: {
        orderBy: { product: { volumeMl: "asc" } },
        select: {
          product: {
            select: {
              id: true,
              sku: true,
              volumeMl: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  return {
    ...row,
    products: row.products.map((p) => ({
      id: p.product.id,
      sku: p.product.sku,
      volumeMl: p.product.volumeMl,
      categoryName: p.product.category.name,
    })),
  };
}
