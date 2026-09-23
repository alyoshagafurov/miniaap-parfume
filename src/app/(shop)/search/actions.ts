"use server";

import { z } from "zod";

import { clientIp } from "@/server/client-ip";
import { rateLimit } from "@/server/rate-limit";

import { SEARCH_MAX_OFFSET, SEARCH_PAGE_SIZE } from "@/lib/search";
import { searchProducts, type SearchRow } from "@/server/catalog/search";

/**
 * The next page of search results.
 *
 * Offset paging here, not the keyset the category uses. The ordering is a
 * relevance score computed per query, not a column — there is nothing stable to
 * anchor a cursor to, and a score is not unique enough to resume from. The
 * depth is bounded instead — see SEARCH_MAX_OFFSET in src/lib/search.ts.
 */
const Params = z.object({
  query: z.string().max(100),
  offset: z.number().int().min(0).max(SEARCH_MAX_OFFSET),
});

/**
 * Same budget as the listing, and for a heavier query.
 *
 * Each call opens a transaction, sets a per-session GUC, counts the whole
 * match set and then runs a trigram scan with an OFFSET up to 240. Cheap to
 * ask for, expensive to serve.
 */
const SEARCH_LIMIT = { limit: 60, windowSeconds: 60 } as const;

export async function loadMoreResults(
  input: unknown,
): Promise<{ rows: SearchRow[]; total: number }> {
  const ip = await clientIp();
  if (ip) {
    const allowed = await rateLimit(`browse:${ip}`, SEARCH_LIMIT);
    if (!allowed.allowed) return { rows: [], total: 0 };
  }

  const parsed = Params.safeParse(input);
  // Nothing is logged: a search query is the buyer's, and so is the session.
  if (!parsed.success) return { rows: [], total: 0 };

  return searchProducts({
    query: parsed.data.query,
    offset: parsed.data.offset,
    limit: SEARCH_PAGE_SIZE,
  });
}
