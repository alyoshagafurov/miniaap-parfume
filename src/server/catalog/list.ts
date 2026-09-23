import { Prisma } from "@prisma/client";

import type { SortKey } from "@/lib/list-url";
import { prisma } from "@/server/db";

/**
 * The category listing.
 *
 * Keyset pagination, not OFFSET. A buyer scrolls a long list while an
 * administrator may be publishing into it; with OFFSET, a product inserted
 * above the current position shifts everything down and page two repeats an
 * item page one already showed. A keyset cursor is anchored to a row, so it
 * cannot drift.
 *
 * Every ordering ends in `id` for the same reason: without a unique tiebreak
 * the cursor is ambiguous the moment two products share a popularity.
 *
 * Raw SQL rather than Prisma's orderBy, because the А–Я sort has to say
 * COLLATE "ru-RU-x-icu" — the database is deliberately datcollate=C so ordering
 * cannot drift between machines, which puts "ёлка" after "яблоко" unless the
 * collation is named, and Prisma's typed orderBy cannot emit it.
 */

/**
 * The sort keys and the labels beside them live in src/lib/list-url.ts, with
 * the rest of the URL contract. This file imports Prisma and the database
 * client, so a client component reading a label from here would carry both into
 * the browser bundle.
 */
export type { SortKey } from "@/lib/list-url";

export const PAGE_SIZE = 24;

export interface ListFilters {
  categorySlug?: string | undefined;
  brandSlugs?: readonly string[] | undefined;
  gender?: "FEMALE" | "MALE" | "UNISEX" | undefined;
  families?: readonly string[] | undefined;
  inStockOnly?: boolean | undefined;
}

export interface ListParams extends ListFilters {
  sort: SortKey;
  /** Opaque; produced by a previous page. */
  cursor?: string | null | undefined;
  limit?: number | undefined;
}

export interface ListedProduct {
  id: string;
  slug: string;
  sku: string;
  title: string;
  priceKop: number;
  oldPriceKop: number | null;
  packSize: number;
  stock: "IN_STOCK" | "LOW" | "OUT" | "PREORDER";
  volumeMl: number;
  isNew: boolean;
  isHit: boolean;
  popularity: number;
  publishedAt: Date | null;
  brandName: string;
  brandSlug: string;
  fragranceNames: string[];
  imageKey: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageBlur: string | null;
}

export interface ListResult {
  items: ListedProduct[];
  nextCursor: string | null;
  total: number;
}

// ── Cursor ───────────────────────────────────────────────────────────────────

interface Cursor {
  /** The sort column's value on the last row of the previous page. */
  value: string;
  id: string;
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.value}\u0000${c.id}`).toString("base64url");
}

/** Returns null for anything this code did not produce. */
export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const [value, id] = Buffer.from(raw, "base64url").toString("utf8").split("\u0000");
    if (typeof value !== "string" || !id) return null;
    return { value, id };
  } catch {
    return null;
  }
}

/**
 * The ORDER BY and the matching keyset predicate.
 *
 * Written together rather than in two places, because they must agree exactly:
 * a predicate that disagrees with the ordering skips or repeats rows, and it
 * does so only on page two, where it is least likely to be noticed.
 */
function ordering(sort: SortKey, cursor: Cursor | null) {
  switch (sort) {
    case "new": {
      const at = cursor ? new Date(cursor.value) : null;
      return {
        orderBy: Prisma.sql`p."publishedAt" DESC NULLS LAST, p.id ASC`,
        keyset:
          cursor && at && !Number.isNaN(at.getTime())
            ? Prisma.sql`AND (p."publishedAt" < ${at}
                OR (p."publishedAt" = ${at} AND p.id > ${cursor.id}))`
            : Prisma.empty,
        valueOf: (r: ListedProduct) =>
          r.publishedAt ? r.publishedAt.toISOString() : "",
      };
    }
    case "price_asc":
      return {
        orderBy: Prisma.sql`p."priceKop" ASC, p.id ASC`,
        keyset: cursor
          ? Prisma.sql`AND (p."priceKop" > ${Number(cursor.value)}
              OR (p."priceKop" = ${Number(cursor.value)} AND p.id > ${cursor.id}))`
          : Prisma.empty,
        valueOf: (r: ListedProduct) => String(r.priceKop),
      };
    case "price_desc":
      return {
        orderBy: Prisma.sql`p."priceKop" DESC, p.id ASC`,
        keyset: cursor
          ? Prisma.sql`AND (p."priceKop" < ${Number(cursor.value)}
              OR (p."priceKop" = ${Number(cursor.value)} AND p.id > ${cursor.id}))`
          : Prisma.empty,
        valueOf: (r: ListedProduct) => String(r.priceKop),
      };
    case "alpha":
      return {
        // The collation is named on BOTH sides. Comparing with byte order while
        // ordering in Russian lands the cursor in the wrong place.
        orderBy: Prisma.sql`p.title COLLATE "ru-RU-x-icu" ASC, p.id ASC`,
        keyset: cursor
          ? Prisma.sql`AND ((p.title COLLATE "ru-RU-x-icu") > (${cursor.value} COLLATE "ru-RU-x-icu")
              OR (p.title = ${cursor.value} AND p.id > ${cursor.id}))`
          : Prisma.empty,
        valueOf: (r: ListedProduct) => r.title,
      };
    case "popular":
    default:
      return {
        orderBy: Prisma.sql`p.popularity DESC, p.id ASC`,
        keyset: cursor
          ? Prisma.sql`AND (p.popularity < ${Number(cursor.value)}
              OR (p.popularity = ${Number(cursor.value)} AND p.id > ${cursor.id}))`
          : Prisma.empty,
        valueOf: (r: ListedProduct) => String(r.popularity),
      };
  }
}

function filterSql(f: ListFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [];

  if (f.categorySlug) parts.push(Prisma.sql`AND c.slug = ${f.categorySlug}`);
  if (f.brandSlugs?.length) {
    parts.push(Prisma.sql`AND b.slug IN (${Prisma.join(f.brandSlugs.map((s) => s))})`);
  }
  if (f.gender) parts.push(Prisma.sql`AND fr.gender = ${f.gender}::"Gender"`);
  if (f.families?.length) {
    // Overlap, not containment: choosing two families means either, not both.
    parts.push(
      Prisma.sql`AND fr.families && ARRAY[${Prisma.join(f.families.map((x) => x))}]::"Family"[]`,
    );
  }
  if (f.inStockOnly) parts.push(Prisma.sql`AND p.stock IN ('IN_STOCK', 'LOW')`);

  return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
}

/**
 * The joins every listing query shares.
 *
 * position = 0 restricts to the primary fragrance, which is what decides the
 * brand a card shows — without it a twin appears twice.
 */
const JOINS = Prisma.sql`
  FROM products p
  JOIN categories c ON c.id = p."categoryId"
  JOIN product_fragrances pf ON pf."productId" = p.id AND pf.position = 0
  JOIN fragrances fr ON fr.id = pf."fragranceId"
  JOIN brands b ON b.id = fr."brandId"
`;

/**
 * One page of a listing.
 *
 * Not cached. The arguments carry the full filter permutation, and a
 * `'use cache'` key derived from them would multiply entries across every
 * combination of brand, family and cursor, thrashing an in-memory LRU on a
 * small VPS for no benefit. The cached reads are the coarse ones on the home
 * screen.
 */
export async function listProducts(params: ListParams): Promise<ListResult> {
  const limit = Math.min(Math.max(params.limit ?? PAGE_SIZE, 1), 60);
  const cursor = decodeCursor(params.cursor);
  const { orderBy, keyset, valueOf } = ordering(params.sort, cursor);
  const filters = filterSql(params);

  const rows = await prisma.$queryRaw<ListedProduct[]>`
    SELECT
      p.id, p.slug, p.sku, p.title, p."priceKop", p."oldPriceKop", p."packSize",
      p.stock::text AS stock, p."volumeMl", p."isNew", p."isHit", p.popularity,
      p."publishedAt",
      b.name AS "brandName", b.slug AS "brandSlug",
      COALESCE((
        SELECT array_agg(f2.name ORDER BY pf2.position)
          FROM product_fragrances pf2
          JOIN fragrances f2 ON f2.id = pf2."fragranceId"
         WHERE pf2."productId" = p.id
      ), ARRAY[]::text[]) AS "fragranceNames",
      img.key AS "imageKey", img.width AS "imageWidth",
      img.height AS "imageHeight", img."blurDataUrl" AS "imageBlur"
    ${JOINS}
    LEFT JOIN LATERAL (
      SELECT pi.key, pi.width, pi.height, pi."blurDataUrl"
        FROM product_images pi
       WHERE pi."productId" = p.id
       ORDER BY pi."sortOrder" ASC
       LIMIT 1
    ) img ON true
    WHERE p.status = 'PUBLISHED'
      ${filters}
      ${keyset}
    ORDER BY ${orderBy}
    LIMIT ${limit + 1}
  `;

  // One extra row, purely to learn whether another page exists without a
  // second round trip.
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  const [counted] = await prisma.$queryRaw<Array<{ total: number }>>`
    SELECT count(*)::int AS total
    ${JOINS}
    WHERE p.status = 'PUBLISHED'
      ${filters}
  `;

  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ value: valueOf(last), id: last.id }) : null,
    total: counted?.total ?? items.length,
  };
}

// ── Facets ───────────────────────────────────────────────────────────────────

export interface Facets {
  brands: Array<{ slug: string; name: string; count: number }>;
  genders: Array<{ value: string; count: number }>;
  families: Array<{ value: string; count: number }>;
}

/**
 * What the filter sheet offers.
 *
 * Counted within the category, so a brand with nothing in it is never offered.
 * A filter that can only return zero is worse than no filter: it looks like the
 * catalog is broken.
 */
export async function getFacets(categorySlug?: string): Promise<Facets> {
  const scope = categorySlug ? Prisma.sql`AND c.slug = ${categorySlug}` : Prisma.empty;

  const brands = await prisma.$queryRaw<Facets["brands"]>`
    SELECT b.slug, b.name, count(*)::int AS count
    ${JOINS}
    WHERE p.status = 'PUBLISHED' ${scope}
    GROUP BY b.slug, b.name
    ORDER BY count(*) DESC, b.name COLLATE "ru-RU-x-icu" ASC
  `;

  const genders = await prisma.$queryRaw<Facets["genders"]>`
    SELECT fr.gender::text AS value, count(*)::int AS count
    ${JOINS}
    WHERE p.status = 'PUBLISHED' ${scope}
    GROUP BY fr.gender
  `;

  const families = await prisma.$queryRaw<Facets["families"]>`
    SELECT fam::text AS value, count(*)::int AS count
    ${JOINS}
    CROSS JOIN LATERAL unnest(fr.families) AS fam
    WHERE p.status = 'PUBLISHED' ${scope}
    GROUP BY fam
    ORDER BY count(*) DESC
  `;

  return { brands, genders, families };
}
