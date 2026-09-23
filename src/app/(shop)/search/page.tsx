import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ProductGrid, ProductGridSkeleton } from "@/components/shop/ProductGrid";
import { SearchResults } from "@/components/shop/SearchResults";
import { GoldRule, RuledHeading } from "@/components/ui/GoldRule";
import { SEARCH_PAGE_SIZE } from "@/lib/search";
import { searchProducts, similarWhenEmpty } from "@/server/catalog/search";
import { getCategories } from "@/server/catalog/queries";
import { getSettings } from "@/server/settings.cached";

type SearchParams = Record<string, string | string[] | undefined>;

export const metadata: Metadata = { title: "Поиск" };

/** Longer than this is not a search, and the column it matches against is finite. */
const MAX_QUERY = 100;

/**
 * Search.
 *
 * Same shape as the category: the frame is static and everything that depends
 * on the request hangs off a Suspense boundary, because under cacheComponents a
 * page that reads searchParams outside one cannot be prerendered at all.
 *
 * The query itself is not echoed into a heading. It is already in the sticky
 * field at the top of every screen, which is where the buyer typed it and where
 * they will correct it; repeating it below costs a line of a 390px screen and
 * tells them nothing new.
 */
export default function SearchPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16">
      <Suspense fallback={<ResultsSkeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const query = (raw ?? "").slice(0, MAX_QUERY).trim();

  if (query === "") return <Prompt />;

  const [settings, found] = await Promise.all([
    getSettings(),
    searchProducts({ query, limit: SEARCH_PAGE_SIZE }),
  ]);

  if (found.total === 0) return <Empty query={query} showPrices={settings.showPrices} />;

  return (
    <>
      <p className="text-muted text-sm tabular-nums" aria-live="polite">
        Найдено: {found.total}
      </p>
      <div className="mt-6">
        <SearchResults
          query={query}
          initial={found.rows}
          total={found.total}
          showPrices={settings.showPrices}
        />
      </div>
    </>
  );
}

/** Before anything is typed: the categories, so the screen is not a dead end. */
async function Prompt() {
  const categories = await getCategories();
  return (
    <section>
      <p className="text-ink text-lg">Что ищем?</p>
      <p className="text-muted mt-2 text-sm">
        Бренд, аромат или артикул. Опечатка не помешает.
      </p>
      <GoldRule className="mt-4 w-24" />

      <ul className="mt-6 flex flex-col">
        {categories.map((c) => (
          <li key={c.id} className="border-rule border-b last:border-b-0">
            <Link
              href={`/c/${c.slug}`}
              className="hover:bg-surface flex items-center justify-between gap-4 rounded-md px-2 py-4 transition-colors"
            >
              <span className="text-ink text-base leading-snug">{c.name}</span>
              <span className="text-muted shrink-0 text-sm tabular-nums">{c.productCount}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Nothing found.
 *
 * The brief asks for similar positions rather than a dead end, and that is the
 * right instinct for a wholesale buyer on a market floor: they came to order
 * something, and an empty screen sends them to a competitor's catalog. The
 * suggestions are the most popular products, which is an honest offer — they
 * are not claimed to be related to what was typed.
 */
async function Empty({ query, showPrices }: { query: string; showPrices: boolean }) {
  const similar = await similarWhenEmpty(undefined, 8);

  return (
    <section>
      {/* break-words: the query is echoed verbatim, and an unbroken
          hundred-character token would otherwise push the page sideways. */}
      <p className="text-ink text-lg break-words">По запросу «{query}» ничего не нашлось</p>
      <p className="text-muted mt-2 text-sm">
        Попробуйте короче — только бренд или только аромат. Или наберите артикул.
      </p>

      {similar.length > 0 ? (
        <div className="mt-10">
          <RuledHeading>Часто заказывают</RuledHeading>
          <div className="mt-4">
            <ProductGrid products={similar} showPrices={showPrices} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ResultsSkeleton() {
  return (
    <div>
      <div className="bg-surface h-5 w-28 rounded-md" aria-hidden />
      <div className="mt-6">
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
