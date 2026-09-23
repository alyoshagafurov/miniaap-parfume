"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { loadMoreResults } from "@/app/(shop)/search/actions";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { Button } from "@/components/ui/Button";
import { SEARCH_MAX_OFFSET, SEARCH_PAGE_SIZE } from "@/lib/search";
import type { SearchRow } from "@/server/catalog/search";

/**
 * Search results, with the rest fetched as the buyer reaches them.
 *
 * The same accumulate-in-place shape as the category listing, and for the same
 * reason — paging by navigation would throw away everything already scrolled
 * past. What differs is the cursor: results are ordered by a relevance score
 * computed for this query, which is not a column and not unique, so there is
 * nothing to anchor a keyset to. Offset, bounded.
 */
export function SearchResults({
  query,
  initial,
  total,
  showPrices,
}: {
  query: string;
  initial: SearchRow[];
  total: number;
  showPrices: boolean;
}) {
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // A new first page means a new query. Adjusting during render rather than in
  // an effect: an effect would paint the previous query's results once first.
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setItems(initial);
    setFailed(false);
  }

  const exhausted = items.length >= SEARCH_MAX_OFFSET + SEARCH_PAGE_SIZE;
  const hasMore = items.length < total && !exhausted;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    setFailed(false);
    try {
      const next = await loadMoreResults({ query, offset: items.length });
      // Refuse to append nothing: a page that came back empty while `total`
      // still says there is more would otherwise leave the observer firing
      // against the same offset for as long as the buyer stays on the screen.
      if (next.rows.length === 0) {
        setFailed(true);
        return;
      }
      setItems((current) => [...current, ...next.rows]);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, query, items.length]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, failed, loadMore]);

  return (
    <>
      <ProductGrid products={items} showPrices={showPrices} query={query} />

      <div ref={sentinel} aria-hidden className="h-px" />

      {hasMore ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          {failed ? (
            <p className="text-danger text-sm" role="status">
              Не удалось загрузить. Проверьте связь.
            </p>
          ) : null}
          <Button variant="secondary" onClick={() => void loadMore()} loading={loading}>
            {failed ? "Попробовать снова" : "Показать ещё"}
          </Button>
        </div>
      ) : null}

      {exhausted ? (
        <p className="text-muted mt-8 text-center text-sm">
          Показаны первые {items.length} из {total}. Уточните запрос, чтобы найти нужное.
        </p>
      ) : null}
    </>
  );
}
