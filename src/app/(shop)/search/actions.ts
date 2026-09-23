"use server";

import { z } from "zod";

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

export async function loadMoreResults(
  input: unknown,
): Promise<{ rows: SearchRow[]; total: number }> {
  const parsed = Params.safeParse(input);
  // Nothing is logged: a search query is the buyer's, and so is the session.
  if (!parsed.success) return { rows: [], total: 0 };

  return searchProducts({
    query: parsed.data.query, offset: parsed.data.offset,
    limit: SEARCH_PAGE_SIZE,
  });
}
