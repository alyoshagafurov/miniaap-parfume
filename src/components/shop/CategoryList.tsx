"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { loadMoreProducts } from "@/app/(shop)/c/[slug]/actions";
import { FilterSheet } from "@/components/shop/FilterSheet";
import { ProductGrid } from "@/components/shop/ProductGrid";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import {
  buildListHref,
  FAMILY_LABELS,
  filterCount,
  GENDER_LABELS,
  NO_FILTERS,
  SORT_KEYS,
  SORT_LABELS,
  type ActiveFilters,
  type SortKey,
} from "@/lib/list-url";
import type { Facets, ListResult } from "@/server/catalog/list";

/**
 * A category listing.
 *
 * The first page comes from the server; further pages arrive from a Server
 * Action and accumulate here. Pagination is deliberately not a navigation — a
 * new URL per page would discard everything already loaded and everything
 * already scrolled past, which on a 1300-product catalog is the difference
 * between browsing and starting over.
 *
 * Filters and sort ARE navigation, because they are what a buyer sends to a
 * colleague. Those go through the URL, and a new first page arriving from the
 * server is the signal to start the accumulation again.
 */
export function CategoryList({
  initial,
  filters,
  sort,
  facets,
  categorySlug,
  basePath,
  showPrices,
}: {
  initial: ListResult;
  filters: ActiveFilters;
  sort: SortKey;
  facets: Facets;
  categorySlug: string;
  basePath: string;
  showPrices: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const sentinel = useRef<HTMLDivElement>(null);

  // A different first page means the filters or the sort changed. Adjusting
  // during render rather than in an effect: an effect would paint the previous
  // filter's products once before replacing them.
  const [shown, setShown] = useState(initial);
  if (shown !== initial) {
    setShown(initial);
    setItems(initial.items);
    setCursor(initial.nextCursor);
    setFailed(false);
  }

  const loadMore = useCallback(async () => {
    // Server Actions are serialised per client, so a second call would queue
    // rather than race — but it would still fetch a page already on screen.
    if (loading || !cursor) return;
    setLoading(true);
    setFailed(false);
    try {
      const next = await loadMoreProducts({
        categorySlug,
        brandSlugs: filters.brands,
        gender: filters.gender ?? undefined,
        families: filters.families,
        inStockOnly: filters.inStockOnly,
        sort,
        cursor,
      });
      setItems((current) => [...current, ...next.items]);
      setCursor(next.nextCursor);
    } catch {
      // A dropped connection on a market floor is ordinary. Offer the retry
      // rather than letting the list appear to end.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loading, cursor, categorySlug, filters, sort]);

  useEffect(() => {
    const node = sentinel.current;
    // After a failure the observer stays off until the buyer asks again;
    // otherwise it would retry against a dead connection on every scroll.
    if (!node || !cursor || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      // Start fetching before the buyer reaches the end, so the list rarely
      // appears to stop.
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, failed, loadMore]);

  const go = (nextFilters: ActiveFilters, nextSort: SortKey) => {
    startTransition(() => {
      // replace, not push: a buyer who narrows a category four times should
      // reach the home screen on one back press, not five.
      router.replace(buildListHref(basePath, nextFilters, nextSort), { scroll: false });
    });
  };

  const active = filterCount(filters);
  const brandName = (slug: string) => facets.brands.find((b) => b.slug === slug)?.name ?? slug;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm tabular-nums" aria-live="polite">
          {initial.total === 0 ? "Ничего не найдено" : `Найдено: ${initial.total}`}
        </p>
        <div className="flex items-center gap-2">
          <label htmlFor="sort" className="sr-only">
            Сортировка
          </label>
          <select
            id="sort"
            value={sort}
            onChange={(e) => go(filters, e.target.value as SortKey)}
            className="bg-surface text-ink border-control rounded-md border px-3 text-sm"
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
            Фильтры{active > 0 ? ` · ${active}` : ""}
          </Button>
        </div>
      </div>

      {active > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Выбранные фильтры">
          {filters.brands.map((slug) => (
            <li key={slug}>
              <RemoveChip
                label={brandName(slug)}
                onRemove={() =>
                  go({ ...filters, brands: filters.brands.filter((b) => b !== slug) }, sort)
                }
              />
            </li>
          ))}
          {filters.gender ? (
            <li>
              <RemoveChip
                label={GENDER_LABELS[filters.gender] ?? filters.gender}
                onRemove={() => go({ ...filters, gender: null }, sort)}
              />
            </li>
          ) : null}
          {filters.families.map((value) => (
            <li key={value}>
              <RemoveChip
                label={FAMILY_LABELS[value] ?? value}
                onRemove={() =>
                  go({ ...filters, families: filters.families.filter((f) => f !== value) }, sort)
                }
              />
            </li>
          ))}
          {filters.inStockOnly ? (
            <li>
              <RemoveChip
                label="Только в наличии"
                onRemove={() => go({ ...filters, inStockOnly: false }, sort)}
              />
            </li>
          ) : null}
        </ul>
      ) : null}

      {/* The cards are h3; without this the outline jumps straight from the
          category's h1 to them. Hidden because the visible heading above the
          grid is the category name, and a second one would only repeat it. */}
      <h2 className="sr-only">Товары</h2>

      <div className="mt-6" aria-busy={pending || undefined}>
        {items.length > 0 ? (
          <ProductGrid products={items} showPrices={showPrices} />
        ) : (
          <div className="border-rule rounded-md border px-4 py-12 text-center">
            <p className="text-ink text-lg">
              {active > 0 ? "По этим фильтрам ничего нет" : "В категории пока пусто"}
            </p>
            {active > 0 ? (
              <>
                <p className="text-muted mt-2 text-sm">Попробуйте убрать часть условий.</p>
                <div className="mt-6 flex justify-center">
                  <Button variant="secondary" onClick={() => go(NO_FILTERS, sort)}>
                    Сбросить фильтры
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted mt-2 text-sm">Скоро здесь появятся товары.</p>
            )}
          </div>
        )}
      </div>

      {/* The observer starts 600px above this. */}
      <div ref={sentinel} aria-hidden className="h-px" />

      {cursor ? (
        <div className="mt-8 flex flex-col items-center gap-3">
          {failed ? (
            <p className="text-danger text-sm" role="status">
              Не удалось загрузить. Проверьте связь.
            </p>
          ) : null}
          {/*
            Kept even though the observer normally fires first: the observer
            does nothing under a screen reader that never scrolls the sentinel
            into view, and nothing at all if IntersectionObserver is missing.
          */}
          <Button variant="secondary" onClick={() => void loadMore()} loading={loading}>
            {failed ? "Попробовать снова" : "Показать ещё"}
          </Button>
        </div>
      ) : null}

      <FilterSheet
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        facets={facets}
        filters={filters}
        sort={sort}
        basePath={basePath}
        resultCount={initial.total}
      />
    </>
  );
}

function RemoveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <Chip selected onClick={onRemove} aria-label={`Убрать фильтр: ${label}`}>
      {label}
      <span aria-hidden>×</span>
    </Chip>
  );
}
