import Link from "next/link";
import { Suspense } from "react";

import { FAMILY_LABELS, GENDER_LABELS } from "@/lib/list-url";
import { listBrands, listFragrances } from "@/server/admin/dictionaries";

export const metadata = { title: "Ароматы" };

type SearchParams = Record<string, string | string[] | undefined>;

export default function FragrancesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-ink text-h2 leading-tight font-semibold">
          Ароматы
        </h1>
        <Link
          href="/admin/fragrances/new"
          className="bg-olive text-surface hover:bg-olive-hover inline-flex min-h-11 items-center rounded-md px-5 text-base font-medium transition-colors"
        >
          Новый аромат
        </Link>
      </div>
      <p className="text-muted mt-2 text-sm">
        Аромат — это запах, а не флакон. Один продаётся в нескольких форматах, и правка
        здесь меняет их все сразу.
      </p>

      <Suspense fallback={<ListSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const one = (key: string) => {
    const value = sp[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const q = (one("q") ?? "").slice(0, 100);
  const brandSlug = /^[a-z0-9-]{1,64}$/.test(one("brand") ?? "")
    ? (one("brand") as string)
    : null;
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);

  const [result, brands] = await Promise.all([
    listFragrances({ q, brandSlug, page }),
    listBrands(),
  ]);

  const href = (next: { page?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (brandSlug) params.set("brand", brandSlug);
    const p = next.page ?? result.page;
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/admin/fragrances?${s}` : "/admin/fragrances";
  };

  return (
    <>
      <form action="/admin/fragrances" className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <label htmlFor="q" className="caps text-muted mb-1 block">
            Поиск
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Название, бренд или алиас"
            className="bg-surface text-ink border-control placeholder:text-muted focus-visible:border-olive w-full rounded-md border px-3 py-2 text-base"
          />
        </div>
        <div className="min-w-0 max-w-full">
          <label htmlFor="brand" className="caps text-muted mb-1 block">
            Бренд
          </label>
          <select
            id="brand"
            name="brand"
            defaultValue={brandSlug ?? ""}
            className="bg-surface text-ink border-control w-full max-w-full rounded-md border px-3 py-2 text-base"
          >
            <option value="">Все</option>
            {brands.map((b) => (
              <option key={b.slug} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="bg-olive text-surface hover:bg-olive-hover inline-flex min-h-11 items-center rounded-md px-5 text-base font-medium transition-colors"
        >
          Найти
        </button>
      </form>

      {result.total > 0 ? (
        <p className="text-muted mt-4 text-sm tabular-nums" aria-live="polite">
          Найдено: {result.total} · страница {result.page} из {result.pageCount}
        </p>
      ) : (
        <p className="text-muted mt-8 text-sm">Ничего не нашлось.</p>
      )}

      <ul className="mt-4 flex flex-col">
        {result.rows.map((fragrance) => (
          <li key={fragrance.id} className="border-rule border-b py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <Link
                href={`/admin/fragrances/${fragrance.id}`}
                className="text-ink text-base font-medium underline-offset-4 hover:underline"
              >
                <span className="text-muted">{fragrance.brandName}</span>{" "}
                {fragrance.name}
              </Link>
              <span className="text-muted text-sm">
                {fragrance.formats.length > 0
                  ? fragrance.formats.join(" · ")
                  : "нет ни одного товара"}
              </span>
            </div>
            <p className="text-muted mt-0.5 text-xs">
              {GENDER_LABELS[fragrance.gender] ?? fragrance.gender}
              {fragrance.families.length > 0
                ? ` · ${fragrance.families.map((f) => FAMILY_LABELS[f] ?? f).join(", ")}`
                : ""}
              {" · "}
              {/* What is missing, rather than what is there: this list is worked
                  through to find the gaps. */}
              {fragrance.noteCount === 0 ? "без нот" : `${fragrance.noteCount} нот`}
              {fragrance.hasDescription ? "" : " · без описания"}
              {fragrance.aliasCount === 0 ? " · без алиасов" : ""}
            </p>
          </li>
        ))}
      </ul>

      {result.pageCount > 1 ? (
        <nav
          aria-label="Страницы"
          className="mt-8 flex items-center justify-between gap-4"
        >
          {result.page > 1 ? (
            <Link
              href={href({ page: result.page - 1 })}
              className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors"
            >
              ← Назад
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted text-sm tabular-nums">
            {result.page} / {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link
              href={href({ page: result.page + 1 })}
              className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors"
            >
              Вперёд →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="mt-4 flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="bg-surface h-14 w-full rounded-md" />
      ))}
    </div>
  );
}
