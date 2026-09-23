import { Prisma } from "@prisma/client";

import { normalizeSearch, normalizeSku } from "@/lib/search";
import type { ListedProduct } from "@/server/catalog/list";
import { prisma } from "@/server/db";

/**
 * Catalog search.
 *
 * The only place in this codebase that writes raw SQL. Everything here is
 * parameterised through Prisma's tagged template, which produces real
 * placeholders — `Prisma.raw()` is a textual splice with no parameterisation
 * and is never given user input.
 *
 * Ranking, in order:
 *   1. the article number, matched exactly — a buyer typing a SKU wants that row
 *   2. a substring hit in the ranked haystack (brand, fragrance, aliases, title)
 *   3. trigram word similarity, which is what tolerates a typo
 *   4. a hit in notes and description, recall only, never allowed to outrank 1-3
 *
 * Rows come back in the same shape as a category listing, so the storefront
 * renders a found product with the card it already has. Matching and display
 * are two separate steps in the query: the trigram scan touches products alone
 * and produces one page of ids, and only those rows are joined out to their
 * brand, fragrances and cover image. Hydrating before the LIMIT would join the
 * whole match set to fetch twenty-four of it.
 */

/** Below this, a trigram match is noise rather than a near-miss. */
const WORD_SIMILARITY_THRESHOLD = 0.6;

export type SearchRow = ListedProduct & { score: number };

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  categorySlug?: string | undefined;
}

/**
 * The display columns, shared by both paths through this file.
 *
 * `position = 0` restricts to the primary fragrance, which is what decides the
 * brand a card shows; without it a twin comes back twice. The second fragrance
 * is still listed, by the correlated subquery — a twin that showed one of its
 * two fragrances would be a lie about what is in the bottle.
 */
const CARD_COLUMNS = Prisma.sql`
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
`;

const CARD_JOINS = Prisma.sql`
  JOIN product_fragrances pf ON pf."productId" = p.id AND pf.position = 0
  JOIN fragrances fr ON fr.id = pf."fragranceId"
  JOIN brands b ON b.id = fr."brandId"
  LEFT JOIN LATERAL (
    SELECT pi.key, pi.width, pi.height, pi."blurDataUrl"
      FROM product_images pi
     WHERE pi."productId" = p.id
     ORDER BY pi."sortOrder" ASC
     LIMIT 1
  ) img ON true
`;

export async function searchProducts({
  query,
  limit = 24,
  offset = 0,
  categorySlug,
}: SearchOptions): Promise<{ rows: SearchRow[]; total: number }> {
  // The stored column was normalised by this same function when the product was
  // written, so the query must go through it too or nothing will ever match.
  const q = normalizeSearch(query);
  if (q === "") return { rows: [], total: 0 };

  // An article number is an identifier, not a phrase: someone who types one
  // wants that row, not the 1 359 others whose article merely looks similar.
  // Checked first and short-circuited.
  const sku = normalizeSku(query);
  if (sku.length >= 4) {
    const exact = await prisma.$queryRaw<SearchRow[]>`
      SELECT ${CARD_COLUMNS}, 1000 AS score
      FROM products p
      ${CARD_JOINS}
      WHERE p.status = 'PUBLISHED'
        AND regexp_replace(lower(p.sku), '[^a-z0-9]', '', 'g') = ${sku}
      LIMIT 1
    `;
    if (exact.length > 0) return { rows: exact, total: exact.length };
  }

  const categoryFilter = categorySlug
    ? Prisma.sql`AND c.slug = ${categorySlug}`
    : Prisma.empty;

  // pg_trgm's thresholds are per-session GUCs. A bare SET would leak to
  // whichever request next borrows this pooled connection, so it is set
  // transaction-locally (the `true` third argument) inside a transaction, which
  // pins one connection for the duration.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(
      WORD_SIMILARITY_THRESHOLD,
    )}, true)`;

    // count(*) is cast to int because Postgres returns bigint, which arrives as
    // a JS BigInt and throws the moment anything serialises it.
    const [counted] = await tx.$queryRaw<Array<{ total: number }>>`
      SELECT count(*)::int AS total
      FROM products p
      JOIN categories c ON c.id = p."categoryId"
      WHERE p.status = 'PUBLISHED'
        ${categoryFilter}
        AND (
          (${sku.length >= 3} AND regexp_replace(lower(p.sku), '[^a-z0-9]', '', 'g') LIKE ${"%" + sku + "%"})
          OR p."searchText" LIKE ${"%" + q + "%"}
          OR ${q} <% p."searchText"
          OR p."searchNotes" LIKE ${"%" + q + "%"}
        )
    `;

    // $queryRaw<T> returns T, not T[] — the array has to be in the type
    // argument or this type-checks and hands back the wrong shape at runtime.
    const rows = await tx.$queryRaw<SearchRow[]>`
      WITH page AS (
        SELECT
          p.id,
          CASE
            -- A partial article, e.g. "1005" typed without the prefix.
            WHEN regexp_replace(lower(p.sku), '[^a-z0-9]', '', 'g') LIKE ${"%" + sku + "%"} AND ${sku.length >= 3} THEN 900
            WHEN p."searchText" LIKE ${"%" + q + "%"}  THEN 500 + (word_similarity(${q}, p."searchText") * 100)::int
            WHEN ${q} <% p."searchText"                THEN 200 + (word_similarity(${q}, p."searchText") * 100)::int
            ELSE 50
          END AS score,
          p.popularity
        FROM products p
        JOIN categories c ON c.id = p."categoryId"
        WHERE p.status = 'PUBLISHED'
          ${categoryFilter}
          AND (
            (${sku.length >= 3} AND regexp_replace(lower(p.sku), '[^a-z0-9]', '', 'g') LIKE ${"%" + sku + "%"})
            OR p."searchText" LIKE ${"%" + q + "%"}
            -- The operator form, not similarity(...) > x: a function call in a
            -- filter is not indexable and silently degrades to a seq scan.
            OR ${q} <% p."searchText"
            OR p."searchNotes" LIKE ${"%" + q + "%"}
          )
        ORDER BY score DESC, p.popularity DESC, p.id
        LIMIT ${limit} OFFSET ${offset}
      )
      SELECT ${CARD_COLUMNS}, page.score
      FROM page
      JOIN products p ON p.id = page.id
      ${CARD_JOINS}
      ORDER BY page.score DESC, p.popularity DESC, p.id
    `;

    return { rows, total: counted?.total ?? rows.length };
  });
}

/**
 * Fallback for an empty result: the most popular products in the same
 * category, so the screen offers something to do rather than a dead end.
 *
 * Same shape as a search hit, minus the score, so the suggestions render with
 * the same card as everything else.
 */
export async function similarWhenEmpty(
  categorySlug?: string,
  limit = 8,
): Promise<ListedProduct[]> {
  const scope = categorySlug ? Prisma.sql`AND c.slug = ${categorySlug}` : Prisma.empty;
  return prisma.$queryRaw<ListedProduct[]>`
    SELECT ${CARD_COLUMNS}
    FROM products p
    JOIN categories c ON c.id = p."categoryId"
    ${CARD_JOINS}
    WHERE p.status = 'PUBLISHED' ${scope}
    ORDER BY p.popularity DESC, p.id ASC
    LIMIT ${limit}
  `;
}
