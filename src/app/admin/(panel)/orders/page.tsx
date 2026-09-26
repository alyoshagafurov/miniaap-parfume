import Link from "next/link";
import { Suspense } from "react";

import { OrderStatusControl } from "@/components/admin/OrderStatusControl";
import { formatDateTimeRu } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { isOrderStatus, ORDER_STATUSES, ORDER_STATUS_LABELS } from "@/lib/orders";
import { listOrders } from "@/server/admin/orders";

export const metadata = { title: "Заявки" };

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The requests.
 *
 * Not in the menu — the client asked for five sections and this is not one of
 * them. A manager arrives here from the Telegram notice or from «Новые заявки»
 * on the home screen, and with no row of sections above the page any more, the
 * way back is the first line of it.
 */
export default function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return (
    <>
      <Link
        href="/admin"
        className="text-muted hover:text-ink inline-flex min-h-11 items-center text-sm font-semibold"
      >
        ← Главная
      </Link>
      <h1 className="display-caps text-ink text-h1">Заявки</h1>
      <Suspense fallback={<ListSkeleton />}>
        <List searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function List({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const rawStatus = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = isOrderStatus(rawStatus) ? rawStatus : undefined;
  const rawQuery = Array.isArray(sp.q) ? sp.q[0] : sp.q;
  const query = (rawQuery ?? "").slice(0, 100).trim() || undefined;

  const { orders, total, counts } = await listOrders({ status, query });

  const href = (next: string | undefined) => {
    const params = new URLSearchParams();
    if (next) params.set("status", next);
    if (query) params.set("q", query);
    const s = params.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };

  return (
    <>
      <nav aria-label="Фильтр по статусу" className="mt-4 flex flex-wrap gap-2">
        <FilterTab href={href(undefined)} active={!status}>
          Все
        </FilterTab>
        {ORDER_STATUSES.map((value) => (
          <FilterTab key={value} href={href(value)} active={status === value}>
            {ORDER_STATUS_LABELS[value]}
            <span className="tabular-nums opacity-70">{counts[value]}</span>
          </FilterTab>
        ))}
      </nav>

      {/*
        A GET form, not a client component: search here is a bookmarkable place
        in the panel, and one that keeps working before any JavaScript arrives.
      */}
      <form action="/admin/orders" className="mt-4 flex max-w-xl gap-2">
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <label htmlFor="q" className="sr-only">
          Поиск по номеру, имени, телефону, городу
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query ?? ""}
          placeholder="Номер, имя, телефон, город"
          className="bg-surface text-ink border-control placeholder:text-muted focus-visible:border-primary min-w-0 flex-1 rounded-full border px-5 py-3 text-base transition-colors duration-150 ease-out"
        />
        <button
          type="submit"
          className="bg-night text-on-night inline-flex min-h-11 shrink-0 items-center rounded-full px-5 text-sm font-bold transition-opacity hover:opacity-90"
        >
          Найти
        </button>
      </form>

      <p className="text-muted mt-4 text-sm tabular-nums" aria-live="polite">
        {total > 0
          ? `Показано: ${orders.length} из ${total}`
          : status || query
            ? "Ничего не найдено"
            : "Заявок пока нет"}
      </p>

      {orders.length === 0 ? null : (
        <ul className="mt-4 flex flex-col gap-4">
          {orders.map((order) => (
            <li key={order.id} className="stage p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/admin/orders/${order.id}`}
                  className="text-ink text-base font-semibold tabular-nums underline-offset-4 hover:underline"
                >
                  № {order.number}
                </Link>
                <span className="text-ink text-base font-semibold tabular-nums">
                  {formatRub(order.totalKop)}
                </span>
              </div>

              <p className="text-muted mt-1 text-sm">
                {formatDateTimeRu(order.createdAt)} · {order.itemCount} поз. ·{" "}
                {order.source === "TELEGRAM" ? "Telegram" : "сайт"}
              </p>
              <p className="text-ink mt-2 text-sm">
                {order.name} · {order.phone} · {order.city}
              </p>

              <div className="mt-3">
                <OrderStatusControl
                  id={order.id}
                  status={order.status}
                  variant="select"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${
        active
          ? "bg-primary text-surface border-primary"
          : "bg-surface text-ink border-control hover:bg-primary-wash"
      }`}
    >
      {children}
    </Link>
  );
}

function ListSkeleton() {
  return (
    <div aria-hidden className="mt-4 flex flex-col gap-4">
      <div className="bg-primary-wash h-11 w-full rounded-full" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="stage h-36" />
      ))}
    </div>
  );
}
