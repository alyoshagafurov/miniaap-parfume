import { cacheLife, cacheTag } from "next/cache";

import { prisma } from "@/server/db";
import { CATALOG_TAG, categoryTag, productTag } from "@/server/catalog/tags";

/**
 * Storefront reads.
 *
 * Everything here selects explicit columns rather than whole rows. Two reasons:
 * a product row carries searchText and searchNotes, which are large and of no
 * use to a card, and a buyer-facing query should never be one schema change
 * away from serialising something it should not.
 */

const CARD_SELECT = {
  id: true,
  slug: true,
  sku: true,
  title: true,
  priceKop: true,
  oldPriceKop: true,
  packSize: true,
  stock: true,
  volumeMl: true,
  isNew: true,
  isHit: true,
  images: {
    select: { key: true, width: true, height: true, blurDataUrl: true },
    orderBy: { sortOrder: "asc" },
    take: 1,
  },
  fragrances: {
    select: {
      position: true,
      fragrance: {
        select: { name: true, slug: true, brand: { select: { name: true, slug: true } } },
      },
    },
    orderBy: { position: "asc" },
  },
} as const;

export type ProductCard = Awaited<ReturnType<typeof getNewArrivals>>[number];

export async function getCategories() {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("hours");
  return prisma.category.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      subtitle: true,
      slug: true,
      coverKey: true,
      _count: { select: { products: { where: { status: "PUBLISHED" } } } },
    },
  });
}

export async function getNewArrivals(limit = 12) {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("hours");
  return prisma.product.findMany({
    where: { status: "PUBLISHED", isNew: true },
    orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: CARD_SELECT,
  });
}

export async function getHits(limit = 12) {
  "use cache";
  cacheTag(CATALOG_TAG);
  cacheLife("hours");
  return prisma.product.findMany({
    where: { status: "PUBLISHED", isHit: true },
    orderBy: [{ popularity: "desc" }, { id: "asc" }],
    take: limit,
    select: CARD_SELECT,
  });
}

/**
 * A page of a category.
 *
 * Cursor pagination rather than offset: the buyer scrolls a long list while an
 * administrator may be publishing into it, and an offset would silently skip or
 * repeat a product when the set shifts underneath. The cursor is the last id at
 * the current sort position, and every ordering ends in `id` so it is total —
 * two products with the same popularity must still have a defined order or the
 * cursor cannot be resumed.
 */
export type SortKey = "popular" | "new" | "price_asc" | "price_desc" | "alpha";

export function orderFor(sort: SortKey) {
  switch (sort) {
    case "new":
      return [{ publishedAt: "desc" as const }, { id: "asc" as const }];
    case "price_asc":
      return [{ priceKop: "asc" as const }, { id: "asc" as const }];
    case "price_desc":
      return [{ priceKop: "desc" as const }, { id: "asc" as const }];
    case "alpha":
      return [{ title: "asc" as const }, { id: "asc" as const }];
    case "popular":
    default:
      return [{ popularity: "desc" as const }, { id: "asc" as const }];
  }
}

export async function getCategoryBySlug(slug: string) {
  "use cache";
  cacheTag(CATALOG_TAG, categoryTag(slug));
  cacheLife("hours");
  return prisma.category.findFirst({
    where: { slug, isPublished: true },
    select: { id: true, name: true, subtitle: true, slug: true, coverKey: true },
  });
}

export async function getProductBySlug(slug: string) {
  "use cache";
  cacheTag(CATALOG_TAG, productTag(slug));
  cacheLife("hours");
  return prisma.product.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      ...CARD_SELECT,
      popularity: true,
      categoryId: true,
      category: { select: { name: true, slug: true } },
      images: {
        select: { key: true, width: true, height: true, blurDataUrl: true },
        orderBy: { sortOrder: "asc" },
      },
      fragrances: {
        select: {
          position: true,
          fragrance: {
            select: {
              id: true, name: true, slug: true, gender: true, families: true,
              notesTop: true, notesHeart: true, notesBase: true, description: true,
              brand: { select: { id: true, name: true, slug: true } },
            },
          },
        },
        orderBy: { position: "asc" },
      },
    },
  });
}

/**
 * The same fragrance in other formats — the pivot the whole catalog is
 * organised around. Excludes the product being viewed.
 */
export async function getOtherFormats(fragranceId: string, exceptProductId: string) {
  return prisma.product.findMany({
    where: {
      status: "PUBLISHED",
      id: { not: exceptProductId },
      fragrances: { some: { fragranceId } },
    },
    orderBy: [{ volumeMl: "asc" }, { id: "asc" }],
    select: {
      id: true, slug: true, title: true, volumeMl: true,
      priceKop: true, packSize: true, stock: true,
      category: { select: { name: true, slug: true } },
    },
  });
}

export async function getMoreFromBrand(brandId: string, exceptProductId: string, limit = 8) {
  return prisma.product.findMany({
    where: {
      status: "PUBLISHED",
      id: { not: exceptProductId },
      fragrances: { some: { fragrance: { brandId } } },
    },
    orderBy: [{ popularity: "desc" }, { id: "asc" }],
    take: limit,
    select: CARD_SELECT,
  });
}
