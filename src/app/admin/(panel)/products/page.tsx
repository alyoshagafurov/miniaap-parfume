import Link from "next/link";
import { Suspense } from "react";

import { ProductTable } from "@/components/admin/ProductTable";
import {
  activeFilterCount,
  buildProductHref,
  parseProductQuery,
  PRODUCT_SORTS,
  PRODUCT_SORT_LABELS,
  PUBLISH_STATUSES,
  PUBLISH_STATUS_LABELS,
  STOCK_LABELS,
  STOCK_STATES,
  type ProductQuery,
} from "@/lib/admin-products";
import { getProductFacets, listAdminProducts } from "@/server/admin/products";
import { prisma } from "@/server/db";

export const metadata = { title: "Товары" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display-caps text-ink text-h1">Товары</h1>
        <Link
          href="/admin/products/new"
          className="bg-night text-on-night inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold transition-opacity hover:opacity-90"
        >
          Новый товар
        </Link>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <Table searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Table({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = parseProductQuery(await searchParams);
  const [page, facets, categories] = await Promise.all([
    listAdminProducts(query),
    getProductFacets(),
    // Ids, for the bulk "move to category" control; the facets carry slugs,
    // which is what a URL needs and not what a write needs.
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <>
      <FilterBar query={query} facets={facets} />

      {/* Silent at zero: the table below says what the emptiness is — nothing
          matching, or no products at all yet and how to add the first — and
          two sentences saying the same thing read as a bug. */}
      {page.total > 0 ? (
        <p className="text-muted mt-4 text-sm tabular-nums" aria-live="polite">
          Найдено: {page.total} · страница {page.page} из {page.pageCount}
        </p>
      ) : null}

      <ProductTable
        rows={page.rows}
        categories={categories}
        filtered={activeFilterCount(query) > 0 || page.total > 0}
      />

      <Pager query={query} page={page.page} pageCount={page.pageCount} />

      {/* Import left the menu with the other sections the client did not ask
          for, but a range of several hundred bottles is not entered one form
          at a time — so the way to it stays, here, where the products are. */}
      <p className="text-muted mt-10 text-sm">
        Много товаров сразу?{" "}
        <Link
          href="/admin/import"
          className="text-ink font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
        >
          Загрузить из Excel
        </Link>
      </p>
    </>
  );
}

function FilterBar({
  query,
  facets,
}: {
  query: ProductQuery;
  facets: Awaited<ReturnType<typeof getProductFacets>>;
}) {
  const active = activeFilterCount(query);
  // The search box is always in view, so it does not count towards opening
  // the panel of the rest; everything else that narrows the list does.
  const narrowed = active - (query.q ? 1 : 0);

  return (
    <div className="mt-6 flex flex-col gap-3">
      {/*
        A GET form, not a client component. The filter is a place in the panel:
        it has to be bookmarkable, survive a reload, and work before any
        JavaScript arrives. Every control is a named field, and the browser
        assembles the URL that parseProductQuery reads back.

        `page` is deliberately absent: changing a filter must land on page one,
        not on page four of a different result set.
      */}
      <form action="/admin/products" className="flex flex-col gap-3">
        <div className="flex gap-2">
          <label htmlFor="q" className="sr-only">
            Поиск
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Артикул, бренд, аромат"
            className="bg-surface text-ink border-control placeholder:text-muted focus-visible:border-primary min-w-0 flex-1 rounded-full border px-5 py-3 text-base transition-colors duration-150 ease-out"
          />
          <button
            type="submit"
            className="bg-night text-on-night inline-flex min-h-11 shrink-0 items-center rounded-full px-5 text-sm font-bold transition-opacity hover:opacity-90"
          >
            Найти
          </button>
        </div>

        {/*
          Five selects and a checkbox used to stand in a row above the table on
          every visit, and on a phone they were two screens of controls before
          the first product. Most visits are «find this one and change its
          price», which the search box above answers; the rest fold away and
          open by themselves when one of them is already in use.
        */}
        <details open={narrowed > 0} className="stage group">
          <summary className="text-ink flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 text-base font-bold [&::-webkit-details-marker]:hidden">
            <span>
              Фильтры
              {narrowed > 0 ? (
                <span className="text-muted ml-2 text-sm font-semibold tabular-nums">
                  {narrowed}
                </span>
              ) : null}
            </span>
            <svg
              aria-hidden
              viewBox="0 0 14 8"
              className="text-ink h-2 w-3.5 shrink-0 transition-transform duration-150 ease-out group-open:rotate-180"
            >
              <path
                d="M1 1l6 6 6-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </summary>

          <div className="grid grid-cols-1 gap-3 px-5 pb-5 sm:grid-cols-2">
            <Select name="category" label="Категория" value={query.categorySlug ?? ""}>
              <option value="">Все</option>
              {facets.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name} ({c.count})
                </option>
              ))}
            </Select>

            <Select name="brand" label="Бренд" value={query.brandSlug ?? ""}>
              <option value="">Все</option>
              {facets.brands.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.name}
                </option>
              ))}
            </Select>

            <Select name="status" label="Статус" value={query.status ?? ""}>
              <option value="">Любой</option>
              {PUBLISH_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PUBLISH_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>

            <Select name="stock" label="Наличие" value={query.stock ?? ""}>
              <option value="">Любое</option>
              {STOCK_STATES.map((s) => (
                <option key={s} value={s}>
                  {STOCK_LABELS[s]}
                </option>
              ))}
            </Select>

            <Select name="sort" label="Сортировка" value={query.sort}>
              {PRODUCT_SORTS.map((s) => (
                <option key={s} value={s}>
                  {PRODUCT_SORT_LABELS[s]}
                </option>
              ))}
            </Select>

            <label className="flex min-h-11 items-center gap-3 self-end">
              <input
                type="checkbox"
                name="photo"
                value="none"
                defaultChecked={query.noPhoto}
                className="accent-primary h-5 w-5"
              />
              <span className="text-ink text-sm font-semibold">Только без фото</span>
            </label>

            <div className="flex items-center gap-4 sm:col-span-2">
              <button
                type="submit"
                className="bg-night text-on-night inline-flex min-h-11 items-center rounded-full px-6 text-sm font-bold transition-opacity hover:opacity-90"
              >
                Применить
              </button>
              {active > 0 ? (
                <Link
                  href="/admin/products"
                  className="text-ink inline-flex min-h-11 items-center text-sm font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
                >
                  Сбросить всё
                </Link>
              ) : null}
            </div>
          </div>
        </details>
      </form>
    </div>
  );
}

function Select({
  name,
  label,
  value,
  children,
}: {
  name: string;
  label: string;
  value: string;
  children: React.ReactNode;
}) {
  return (
    // min-w-0: a flex item will not shrink below its content otherwise, and a
    // <select> sizes itself to its widest option — one long brand name and the
    // filter bar runs off a 390px screen.
    <div className="min-w-0 max-w-full">
      <label htmlFor={name} className="caps text-muted mb-1 block">
        {label}
      </label>
      {/*
        defaultValue, not value: this is an uncontrolled form the browser
        submits, and a controlled select with no onChange would be frozen.
      */}
      <select
        id={name}
        name={name}
        defaultValue={value}
        className="bg-surface text-ink border-control w-full max-w-full rounded-md border px-3 py-3 text-base"
      >
        {children}
      </select>
    </div>
  );
}

function Pager({
  query,
  page,
  pageCount,
}: {
  query: ProductQuery;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  return (
    <nav aria-label="Страницы" className="mt-8 flex items-center justify-between gap-4">
      {page > 1 ? (
        <Link
          href={buildProductHref({ ...query, page: page - 1 })}
          className="border-control text-ink hover:bg-primary-wash inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold transition-colors"
        >
          ← Назад
        </Link>
      ) : (
        <span />
      )}

      <span className="text-muted text-sm tabular-nums">
        {page} / {pageCount}
      </span>

      {page < pageCount ? (
        <Link
          href={buildProductHref({ ...query, page: page + 1 })}
          className="border-control text-ink hover:bg-primary-wash inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold transition-colors"
        >
          Вперёд →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function TableSkeleton() {
  return (
    <div aria-hidden className="mt-6 flex flex-col gap-3">
      <div className="bg-primary-wash h-12 w-full rounded-full" />
      <div className="stage h-12" />
      <div className="stage mt-3 h-80" />
    </div>
  );
}
