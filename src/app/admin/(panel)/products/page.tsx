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
        <h1 className="font-display text-ink text-h2 leading-tight font-semibold">Товары</h1>
        <Link
          href="/admin/products/new"
          className="bg-olive text-surface hover:bg-olive-hover inline-flex min-h-11 items-center rounded-md px-5 text-base font-medium transition-colors"
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
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <FilterBar query={query} facets={facets} />

      {/* Silent at zero: the table below says "ничего не нашлось" and what to
          do about it, and two sentences saying the same thing read as a bug. */}
      {page.total > 0 ? (
        <p className="text-muted mt-4 text-sm tabular-nums" aria-live="polite">
          Найдено: {page.total} · страница {page.page} из {page.pageCount}
        </p>
      ) : null}

      <ProductTable rows={page.rows} categories={categories} />

      <Pager query={query} page={page.page} pageCount={page.pageCount} />
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

  return (
    <div className="mt-4 flex flex-col gap-3">
      {/*
        A GET form, not a client component. The filter is a place in the panel:
        it has to be bookmarkable, survive a reload, and work before any
        JavaScript arrives. Every control is a named field, and the browser
        assembles the URL that parseProductQuery reads back.

        `page` is deliberately absent: changing a filter must land on page one,
        not on page four of a different result set.
      */}
      <form action="/admin/products" className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="caps text-muted mb-1 block">
            Поиск
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q}
            placeholder="Артикул, бренд, аромат"
            className="bg-surface text-ink border-control placeholder:text-muted focus-visible:border-olive w-full rounded-md border px-3 py-2 text-base"
          />
        </div>

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

        <label className="border-control bg-surface flex min-h-11 items-center gap-2 rounded-md border px-3">
          <input
            type="checkbox"
            name="photo"
            value="none"
            defaultChecked={query.noPhoto}
            className="accent-olive h-5 w-5"
          />
          <span className="text-ink text-sm">Без фото</span>
        </label>

        <button
          type="submit"
          className="bg-olive text-surface hover:bg-olive-hover inline-flex min-h-11 items-center rounded-md px-5 text-base font-medium transition-colors"
        >
          Применить
        </button>

        {active > 0 ? (
          <Link
            href="/admin/products"
            className="text-olive inline-flex min-h-11 items-center underline underline-offset-4"
          >
            Сбросить
          </Link>
        ) : null}
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
        className="bg-surface text-ink border-control w-full max-w-full rounded-md border px-3 py-2 text-base"
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
          className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors"
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
          className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors"
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
    <div aria-hidden className="mt-4 flex flex-col gap-3">
      <div className="bg-surface h-20 w-full rounded-md" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="border-rule bg-surface h-16 rounded-md border" />
      ))}
    </div>
  );
}
