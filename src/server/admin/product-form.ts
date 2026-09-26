import { Prisma } from "@prisma/client";

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
          fragrance: {
            select: { id: true, name: true, brand: { select: { name: true } } },
          },
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
 * Word by word, and every word has to be found somewhere — in the fragrance's
 * name, the brand's name, or either one's aliases. «Chanel Chance» is how a
 * product title reads and how she will type it, and a match on the whole
 * string found nothing, which sent her to «Нет в списке — создать» and made a
 * second Chance.
 *
 * The aliases are why this is SQL and not a Prisma filter. They are stored as
 * typed — «Шанель», «Блю де Шанель» — and Prisma can only ask whether an array
 * holds an element equal to a value, exactly and with case. «шанель» is equal
 * to none of those; ILIKE over the unnested array finds both. The brand's
 * aliases are what make «шанель шанс» work at all: the fragrance row says
 * "Chance" and the brand row says "Chanel", in Latin.
 *
 * Unindexed, deliberately: this runs for one person typing in the panel, over
 * a few hundred fragrances.
 */
export async function searchFragrances(query: string): Promise<FragranceOption[]> {
  await requireAdminPage();
  return matchFragrances(query);
}

/** The query behind the guard, for the test; the app calls searchFragrances. */
export async function matchFragrances(query: string): Promise<FragranceOption[]> {
  const words = searchWords(query);
  const where =
    words.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(words.map(wordMatches), " AND ")}`
      : Prisma.empty;

  return prisma.$queryRaw<FragranceOption[]>`
    SELECT f.id, f.name, b.name AS "brandName", b.id AS "brandId"
    FROM fragrances f
    JOIN brands b ON b.id = f."brandId"
    ${where}
    ORDER BY b.name ASC, f.name ASC
    LIMIT 20
  `;
}

/**
 * The words of a query, as LIKE patterns.
 *
 * Capped, because each word adds four conditions, two of them subqueries, and
 * the action lets through a hundred characters. `%` and `_` are escaped: a SKU-like «AR_1» otherwise
 * matches «AR-1», «ARX1» and everything else with one character there.
 */
export function searchWords(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((word) => `%${word.replace(/[\\%_]/g, "\\$&")}%`);
}

function wordMatches(pattern: string): Prisma.Sql {
  return Prisma.sql`(
    f.name ILIKE ${pattern}
    OR b.name ILIKE ${pattern}
    OR EXISTS (SELECT 1 FROM unnest(f.aliases) AS alias WHERE alias ILIKE ${pattern})
    OR EXISTS (SELECT 1 FROM unnest(b.aliases) AS alias WHERE alias ILIKE ${pattern})
  )`;
}

/** Brands, for creating a fragrance without leaving the product form. */
export async function listBrandOptions(): Promise<Array<{ id: string; name: string }>> {
  await requireAdminPage();
  return prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
