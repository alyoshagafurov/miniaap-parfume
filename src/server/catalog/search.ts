import { Prisma } from "@prisma/client";

import { normalizeSearch, normalizeSku } from "@/lib/search";
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
 */

/** Below this, a trigram match is noise rather than a near-miss. */
const WORD_SIMILARITY_THRESHOLD = 0.6;

export interface SearchRow {
  id: string;
  slug: string;
  sku: string;
  title: string;
  priceKop: number;
  oldPriceKop: number | null;
  packSize: number;
  stock: string;
  volumeMl: number;
  score: number;
  total: number;
}

export interface SearchOptions {
  query: string;
  limit?: number;
  offset?: number;
  categorySlug?: string | undefined;
}

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
      SELECT
        p.id, p.slug, p.sku, p.title, p."priceKop", p."oldPriceKop",
        p."packSize", p.stock::text AS stock, p."volumeMl",
        1000 AS score, 1 AS total
      FROM products p
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
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(
      WORD_SIMILARITY_THRESHOLD,
    )}, true)`;

    // $queryRaw<T> returns T, not T[] — the array has to be in the type
    // argument or this type-checks and hands back the wrong shape at runtime.
    // count(*) is cast to int because Postgres returns bigint, which arrives as
    // a JS BigInt and throws the moment anything serialises it.
    return tx.$queryRaw<SearchRow[]>`
      WITH matched AS (
        SELECT
          p.id, p.slug, p.sku, p.title, p."priceKop", p."oldPriceKop",
          p."packSize", p.stock::text AS stock, p."volumeMl", p.popularity,
          CASE
            -- A partial article, e.g. "1005" typed without the prefix.
            WHEN regexp_replace(lower(p.sku), '[^a-z0-9]', '', 'g') LIKE ${"%" + sku + "%"} AND ${sku.length >= 3} THEN 900
            WHEN p."searchText" LIKE ${"%" + q + "%"}  THEN 500 + (word_similarity(${q}, p."searchText") * 100)::int
            WHEN ${q} <% p."searchText"                THEN 200 + (word_similarity(${q}, p."searchText") * 100)::int
            ELSE 50
          END AS score
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
      )
      SELECT
        id, slug, sku, title, "priceKop", "oldPriceKop", "packSize", stock,
        "volumeMl", score,
        (SELECT count(*)::int FROM matched) AS total
      FROM matched
      ORDER BY score DESC, popularity DESC, id
      LIMIT ${limit} OFFSET ${offset}
    `;
  });

  return { rows, total: rows[0]?.total ?? 0 };
}

/**
 * Fallback for an empty result: the most popular products in the same
 * category, so the screen offers something to do rather than a dead end.
 */
export async function similarWhenEmpty(categorySlug?: string, limit = 8) {
  return prisma.product.findMany({
    where: {
      status: "PUBLISHED",
      ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    },
    orderBy: [{ popularity: "desc" }, { id: "asc" }],
    take: limit,
    select: {
      id: true, slug: true, sku: true, title: true,
      priceKop: true, oldPriceKop: true, packSize: true,
      stock: true, volumeMl: true,
    },
  });
}
