"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  bulkProducts,
  editPrice,
  editStock,
} from "@/app/admin/(panel)/products/actions";
import { Button } from "@/components/ui/Button";
import {
  PUBLISH_STATUSES,
  PUBLISH_STATUS_LABELS,
  STOCK_LABELS,
  STOCK_STATES,
  type PublishStatusName,
  type StockStateName,
} from "@/lib/admin-products";
import { formatRub, kopToRub, parsePriceToKop } from "@/lib/money";
import type { AdminProductRow } from "@/server/admin/products";

/**
 * What a bulk control can ask for.
 *
 * Mirrors the server's discriminated union rather than being inferred from it:
 * the action takes `unknown` by design — it is a public endpoint — so there is
 * no type to infer, and a shape stated here is checked at the call site instead
 * of at the far end of a round trip.
 */
type BulkChoice =
  | { kind: "status"; status: PublishStatusName }
  | { kind: "stock"; stock: StockStateName }
  | { kind: "category"; categoryId: string };

/**
 * The products table.
 *
 * A real table on a wide screen and stacked rows on a narrow one, because the
 * owner works from a 390 phone as often as from a desk and a nine-column grid
 * at that width is not a table, it is a horizontal scroll nobody uses.
 *
 * Deliberately not TanStack Table. Its job is a client-side row model —
 * sorting, filtering and paging over data the browser already holds — and this
 * table does none of that in the browser: the server returns fifty rows and the
 * address bar carries the question. What would be left for it is rendering
 * `<tr>`, at the cost of a bundle.
 *
 * Only the two fields that change weekly are editable in place. Everything else
 * is behind the form, where it can be validated against the rest of the row.
 */
export function ProductTable({
  rows,
  categories,
}: {
  rows: readonly AdminProductRow[];
  categories: ReadonlyArray<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  // A new page of rows is a new selection. Keeping it would leave an invisible
  // tick on a row that scrolled out of the filter, and a bulk action would then
  // touch something the administrator cannot see.
  const [shown, setShown] = useState(rows);
  if (shown !== rows) {
    setShown(rows);
    setSelected(new Set());
  }

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const applyBulk = (action: BulkChoice) => {
    startTransition(async () => {
      const result = await bulkProducts({ ids: [...selected], action });
      setNotice(result.ok ? null : result.message);
      if (result.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  };

  return (
    <div>
      {notice ? (
        <p
          role="alert"
          className="border-danger bg-danger-wash text-ink mb-4 rounded-md border p-3 text-sm"
        >
          {notice}
        </p>
      ) : null}

      {selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          categories={categories}
          pending={pending}
          onApply={applyBulk}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      {/*
        One markup, two layouts. Below md every part switches to `block`, so the
        row stacks: the tick and the article on one line with the status, the
        name under it, and the two editable fields side by side. A nine-column
        grid at 390 is not a table, it is a horizontal scroll nobody uses — and
        this owner works from a phone as often as from a desk.
      */}
      <div className="mt-4 md:overflow-x-auto">
        <table className="block w-full border-collapse text-sm md:table">
          <caption className="sr-only">Товары каталога</caption>
          <thead className="hidden md:table-header-group">
            <tr className="border-rule border-b text-left">
              <th scope="col" className="w-10 py-2">
                <label className="flex min-h-11 items-center">
                  <input
                    type="checkbox"
                    className="accent-primary h-5 w-5"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Выбрать все на странице"
                  />
                </label>
              </th>
              <th scope="col" className="caps text-muted py-2">
                Товар
              </th>
              <th scope="col" className="caps text-muted py-2">
                Артикул
              </th>
              <th scope="col" className="caps text-muted py-2">
                Категория
              </th>
              <th scope="col" className="caps text-muted py-2">
                Цена
              </th>
              <th scope="col" className="caps text-muted py-2">
                Наличие
              </th>
              <th scope="col" className="caps text-muted py-2">
                Статус
              </th>
            </tr>
          </thead>

          <tbody className="block md:table-row-group">
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-rule block border-b py-3 md:table-row md:py-0"
              >
                <td className="block md:table-cell md:w-10 md:py-3 md:align-top">
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex min-h-11 items-center gap-3 md:min-h-0">
                      <input
                        type="checkbox"
                        className="accent-primary h-5 w-5 shrink-0"
                        checked={selected.has(row.id)}
                        onChange={() => toggle(row.id)}
                        aria-label={`Выбрать ${row.sku}`}
                      />
                      <span className="text-muted font-mono text-xs md:hidden">
                        {row.sku}
                      </span>
                    </label>
                    <span className="md:hidden">
                      <StatusBadge status={row.status} />
                    </span>
                  </div>
                </td>

                <td className="block md:table-cell md:py-3 md:align-top">
                  {/* A 44px target on a phone, an ordinary inline link at the
                      desk. This is the row's primary action — opening the
                      product — and on the card layout it was a 16px line of
                      text with nothing around it to catch a thumb. */}
                  <Link
                    href={`/admin/products/${row.id}`}
                    className="text-ink inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline md:min-h-0"
                  >
                    {row.title}
                  </Link>
                  <p className="text-muted mt-0.5 text-xs">
                    {row.brandName} · {row.volumeMl} мл
                    {row.packSize > 1 ? ` · кратно ${row.packSize}` : ""}
                    {row.imageCount === 0 ? " · без фото" : ` · ${row.imageCount} фото`}
                  </p>
                </td>

                <td className="text-muted hidden font-mono text-xs md:table-cell md:py-3 md:align-top">
                  {row.sku}
                </td>
                <td className="text-muted hidden md:table-cell md:py-3 md:align-top">
                  {row.categoryName}
                </td>

                <td className="mt-2 mr-4 inline-block align-middle md:mt-0 md:mr-0 md:table-cell md:py-3 md:align-top">
                  <PriceCell id={row.id} priceKop={row.priceKop} />
                </td>

                <td className="mt-2 inline-block align-middle md:mt-0 md:table-cell md:py-3 md:align-top">
                  <StockCell id={row.id} stock={row.stock} />
                </td>

                <td className="hidden md:table-cell md:py-3 md:align-top">
                  <StatusBadge status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted mt-8 text-center text-sm">
          Ничего не нашлось. Попробуйте снять часть фильтров.
        </p>
      ) : null}
    </div>
  );
}

function BulkBar({
  count,
  categories,
  pending,
  onApply,
  onClear,
}: {
  count: number;
  categories: ReadonlyArray<{ id: string; name: string }>;
  pending: boolean;
  onApply: (action: BulkChoice) => void;
  onClear: () => void;
}) {
  return (
    <div className="border-primary bg-primary-wash sticky top-28 z-10 flex flex-wrap items-center gap-3 rounded-md border p-3">
      <span className="text-ink text-sm font-medium tabular-nums">
        Выбрано: {count}
      </span>

      <label className="sr-only" htmlFor="bulk-status">
        Статус
      </label>
      <select
        id="bulk-status"
        defaultValue=""
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value as PublishStatusName | "";
          if (value) onApply({ kind: "status", status: value });
          e.target.value = "";
        }}
        className="bg-surface text-ink border-control max-w-full rounded-md border px-3 text-sm"
      >
        <option value="">Статус…</option>
        {PUBLISH_STATUSES.map((s) => (
          <option key={s} value={s}>
            {PUBLISH_STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="bulk-stock">
        Наличие
      </label>
      <select
        id="bulk-stock"
        defaultValue=""
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value as StockStateName | "";
          if (value) onApply({ kind: "stock", stock: value });
          e.target.value = "";
        }}
        className="bg-surface text-ink border-control max-w-full rounded-md border px-3 text-sm"
      >
        <option value="">Наличие…</option>
        {STOCK_STATES.map((s) => (
          <option key={s} value={s}>
            {STOCK_LABELS[s]}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="bulk-category">
        Категория
      </label>
      <select
        id="bulk-category"
        defaultValue=""
        disabled={pending}
        onChange={(e) => {
          if (e.target.value) onApply({ kind: "category", categoryId: e.target.value });
          e.target.value = "";
        }}
        className="bg-surface text-ink border-control max-w-full rounded-md border px-3 text-sm"
      >
        <option value="">Категория…</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <Button variant="quiet" onClick={onClear} disabled={pending}>
        Снять выбор
      </Button>
    </div>
  );
}

/**
 * The price, edited where it is shown.
 *
 * Typed in roubles and stored in kopecks, through the same parser the Excel
 * import uses — so «1 250,50», «1250.5» and «1250,50 ₽» are all the same price
 * here and there. A value it refuses is refused with the field still holding
 * what was typed.
 */
function PriceCell({ id, priceKop }: { id: string; priceKop: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() =>
    String(kopToRub(priceKop)).replace(".", ","),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-ink hover:bg-primary-wash -mx-2 inline-flex min-h-11 items-center rounded-md px-2 font-semibold tabular-nums transition-colors"
        aria-label={`Изменить цену: ${formatRub(priceKop)}`}
      >
        {formatRub(priceKop)}
      </button>
    );
  }

  const save = () => {
    let kop: number;
    try {
      kop = parsePriceToKop(value);
    } catch {
      setError("Не похоже на цену");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await editPrice({ id, priceKop: kop });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          // Selected on focus: clicking a price to edit it means replacing it,
          // not appending to it. Without this, clicking 910 and typing 999
          // saves 910 999 ₽ — which is what happened the first time this was
          // driven by hand.
          onFocus={(e) => e.currentTarget.select()}
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          inputMode="decimal"
          aria-label="Цена в рублях"
          className="bg-surface text-ink border-control w-24 rounded-md border px-2 text-sm tabular-nums"
        />
        <Button variant="quiet" onClick={save} loading={pending}>
          ОК
        </Button>
      </span>
      {error ? (
        <span role="alert" className="text-danger text-xs">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function StockCell({ id, stock }: { id: string; stock: StockStateName }) {
  const router = useRouter();
  const [shown, setShown] = useState(stock);
  const [pending, startTransition] = useTransition();

  const [seen, setSeen] = useState(stock);
  if (seen !== stock) {
    setSeen(stock);
    setShown(stock);
  }

  return (
    <>
      <label htmlFor={`stock-${id}`} className="sr-only">
        Наличие
      </label>
      <select
        id={`stock-${id}`}
        value={shown}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as StockStateName;
          const previous = shown;
          setShown(next);
          startTransition(async () => {
            const result = await editStock({ id, stock: next });
            if (!result.ok) setShown(previous);
            else router.refresh();
          });
        }}
        className="bg-surface text-ink border-control rounded-md border px-2 text-sm"
      >
        {STOCK_STATES.map((s) => (
          <option key={s} value={s}>
            {STOCK_LABELS[s]}
          </option>
        ))}
      </select>
    </>
  );
}

function StatusBadge({ status }: { status: PublishStatusName }) {
  const tone =
    status === "PUBLISHED"
      ? "bg-primary text-surface border-primary"
      : status === "DRAFT"
        ? "bg-surface text-muted border-control"
        : "bg-surface text-muted border-rule";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${tone}`}
    >
      {PUBLISH_STATUS_LABELS[status]}
    </span>
  );
}
