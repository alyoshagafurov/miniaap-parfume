import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CategoryList } from "@/components/shop/CategoryList";
import { ProductGridSkeleton } from "@/components/shop/ProductGrid";
import { parseListFilters, parseSort } from "@/lib/list-url";
import { getFacets, listProducts } from "@/server/catalog/list";
import { getCategories, getCategoryBySlug } from "@/server/catalog/queries";
import { getSettings } from "@/server/settings.cached";
import { keepUnits } from "@/lib/format";

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
  const [category, all] = await Promise.all([getCategoryBySlug(slug), getCategories()]);
  // Also the route's 404: an unpublished or unknown slug has no heading, and
  // notFound() from here replaces the page rather than leaving a listing under
  // a missing title.
  if (!category) notFound();

  return (
    <header className="pt-4 pb-6">
      <h1 className="display-caps text-ink text-h1 text-balance">
        {keepUnits(category.name)}
      </h1>
      {/* The subtitle is deliberately not here. It said the same thing as the
          row the buyer just tapped, one screen earlier, and on a listing the
          first screen belongs to the goods. It is still on the row, and still
          editable in the panel. */}
      {/* Some other category to go to, rather than more than one in the list:
          the list holds only categories with something published, so a direct
          link to one not yet filled is not in it, and a single other category
          is then exactly the tab a buyer on an empty page needs. */}
      {all.some((c) => c.slug !== slug) ? (
        <CategoryTabs current={slug} categories={all} />
      ) : null}
    </header>
  );
}

/**
 * Every category, one tap away — the reference's «Underground · Casual ·
 * Formal» row.
 *
 * Categories here are formats, and comparing formats is most of what a
 * wholesaler does on this screen: without this row, going from 35 ml to 100 ml
 * meant back to the home page and down again. The current one is in ink with
 * the gold rule under it; the reference marks it in its accent, but amber here
 * means money, and a tab coloured like a price reads as one.
 *
 * It scrolls sideways rather than wrapping, because a category name in this
 * catalog runs to five words and four of them wrapped would be a paragraph.
 */
function CategoryTabs({
  current,
  categories,
}: {
  current: string;
  categories: ReadonlyArray<{ slug: string; name: string }>;
}) {
  return (
    <nav aria-label="Категории" className="-mx-4 mt-5 overflow-x-auto px-4">
      <ul className="flex gap-6">
        {categories.map((c) =>
          c.slug === current ? (
            <li key={c.slug} className="shrink-0">
              <span
                aria-current="page"
                className="text-ink block py-2 text-sm font-extrabold whitespace-nowrap"
              >
                {keepUnits(c.name)}
                <span aria-hidden className="bg-gold mt-1.5 block h-0.5 rounded-full" />
              </span>
            </li>
          ) : (
            <li key={c.slug} className="shrink-0">
              <Link
                href={`/c/${c.slug}`}
                className="text-muted hover:text-ink block py-2 text-sm font-semibold whitespace-nowrap transition-colors"
              >
                {keepUnits(c.name)}
                <span aria-hidden className="mt-1.5 block h-0.5" />
              </Link>
            </li>
          ),
        )}
      </ul>
    </nav>
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
      contacts={{ phone: settings.phone, whatsappPhone: settings.whatsappPhone }}
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
    <div className="pt-4 pb-6" aria-hidden>
      <div className="bg-primary-wash h-8 w-3/5 rounded-md" />
      <div className="mt-5 flex gap-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-primary-wash h-5 w-24 rounded-md" />
        ))}
      </div>
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
