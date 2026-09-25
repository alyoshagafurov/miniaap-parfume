import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CategoryList } from "@/components/shop/CategoryList";
import { ProductGridSkeleton } from "@/components/shop/ProductGrid";
import { GoldRule } from "@/components/ui/GoldRule";
import { parseListFilters, parseSort } from "@/lib/list-url";
import { getFacets, listProducts } from "@/server/catalog/list";
import { getCategoryBySlug } from "@/server/catalog/queries";
import { getSettings } from "@/server/settings.cached";

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Категория не найдена" };
  // The root layout appends " · ÁRUMI"; repeating the name here would print it
  // twice in the tab and in every shared link.
  return {
    title: category.name,
    ...(category.subtitle ? { description: category.subtitle } : {}),
  };
}

/**
 * A category.
 *
 * The page function itself reads nothing: under cacheComponents, touching
 * `params` or `searchParams` outside a Suspense boundary makes the whole route
 * unprerenderable, and Next says so rather than guessing. So the frame is
 * static and the two things that do depend on the request hang off their own
 * boundaries.
 *
 * Two boundaries and not one, because they resolve at different speeds. The
 * heading comes from a cached lookup by slug and lands almost at once; the
 * listing depends on the filters in the URL, which are never prefetched and
 * never cached. Sharing a boundary would hold the heading back to the speed of
 * the query, and the buyer would look at a blank screen after tapping a
 * category with a perfectly good title.
 */
export default function CategoryPage({ params, searchParams }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      <Suspense fallback={<HeaderSkeleton />}>
        <CategoryHeader params={params} />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
        <CategorySection params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CategoryHeader({ params }: { params: PageProps["params"] }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  // Also the route's 404: an unpublished or unknown slug has no heading, and
  // notFound() from here replaces the page rather than leaving a listing under
  // a missing title.
  if (!category) notFound();

  return (
    <header className="pt-6 pb-6">
      <h1 className="font-display text-ink text-h1 leading-tight font-semibold">
        {category.name}
      </h1>
      {/* The subtitle is deliberately not here. It said the same thing as the
          row the buyer just tapped, one screen earlier, and on a listing the
          first screen belongs to the goods. It is still on the row, and still
          editable in the panel. */}
      <GoldRule className="mt-4 w-24" />
    </header>
  );
}

async function CategorySection({ params, searchParams }: PageProps) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const filters = parseListFilters(sp);
  const sort = parseSort(sp);

  const [settings, initial, facets] = await Promise.all([
    getSettings(),
    listProducts({
      categorySlug: slug,
      brandSlugs: filters.brands,
      gender: filters.gender ?? undefined,
      families: filters.families,
      inStockOnly: filters.inStockOnly,
      sort,
    }),
    getFacets(slug),
  ]);

  return (
    <CategoryList
      initial={initial}
      filters={filters}
      sort={sort}
      facets={facets}
      categorySlug={slug}
      basePath={`/c/${slug}`}
      showPrices={settings.showPrices}
    />
  );
}

/**
 * The placeholders.
 *
 * Both hold exactly the height their content will occupy — the heading block,
 * the control bar, the grid — so the page assembles downward without anything
 * already on screen moving. A skeleton that is the wrong height is worse than
 * none: it makes the buyer tap a card that is no longer under their thumb.
 */
function HeaderSkeleton() {
  return (
    <div className="pt-6 pb-6" aria-hidden>
      <div className="bg-surface h-8 w-3/5 rounded-md" />
      <div className="bg-surface mt-2 h-5 w-4/5 rounded-md" />
      <div className="mt-4 h-px w-24" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3" aria-hidden>
        <div className="bg-surface h-5 w-28 rounded-md" />
        <div className="flex items-center gap-2">
          <div className="bg-surface border-control h-11 w-36 rounded-md border" />
          <div className="bg-surface border-control h-11 w-28 rounded-md border" />
        </div>
      </div>
      <div className="mt-6">
        <ProductGridSkeleton />
      </div>
    </div>
  );
}
