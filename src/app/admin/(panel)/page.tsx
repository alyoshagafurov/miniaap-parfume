import Link from "next/link";
import { Suspense } from "react";

import { SectionHeading } from "@/components/ui/GoldRule";
import { GOODS, plural } from "@/lib/format";
import { attentionRows, getDashboardCounts } from "@/server/admin/dashboard";
import { currentSession } from "@/server/auth/roles";

export const metadata = { title: "Админка" };

/**
 * The admin home.
 *
 * Built like the storefront's first screen, because the client asked for the
 * panel to look like it: heavy capitals, one dark block carrying the state of
 * things and the one action that matters most, then white stages to press.
 *
 * What it answers is what the owner opens the panel to ask. How much of the
 * catalog is live, what is waiting — new requests, drafts, products with no
 * photograph, shown only when there are any, because a row saying «0» is a row
 * asking to be read for nothing — and where everything else is.
 *
 * Requests are not among the sections below, and that is the client's choice:
 * five sections, orders not one of them. The Telegram notice is how a request
 * normally arrives; «Новые заявки» under «Доделать» is how one that was missed
 * is still found.
 */
export default function AdminHomePage() {
  return (
    <>
      <h1 className="display-caps text-ink text-h1">Главная</h1>
      <Suspense fallback={<Skeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

async function Overview() {
  const [counts, session] = await Promise.all([getDashboardCounts(), currentSession()]);
  const isOwner = session?.role === "OWNER";

  const attention = attentionRows(counts);

  // On an empty catalog the first step is a category, not a product: a product
  // cannot be saved without one, so the main button leads where the work starts.
  const firstStep =
    counts.categories === 0
      ? { href: "/admin/categories", label: "Создать категорию" }
      : { href: "/admin/products/new", label: "Новый товар" };

  return (
    <>
      <div className="bg-night text-on-night mt-6 rounded-lg p-5">
        <p className="display-caps text-2xl">
          На витрине <span className="tabular-nums">{counts.published}</span>{" "}
          {plural(counts.published, GOODS)}
        </p>
        <p className="text-on-night-muted mt-2 text-sm leading-snug">
          Цена, наличие и фото меняются в разделе «Товары» — витрина обновляется сразу.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Link
            href={firstStep.href}
            className="bg-on-night text-night focus-visible:outline-on-night inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold transition-opacity hover:opacity-90"
          >
            {firstStep.label}
          </Link>
          <Link
            href="/"
            prefetch={false}
            className="border-on-night-muted text-on-night focus-visible:outline-on-night inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold transition-opacity hover:opacity-80"
          >
            Открыть витрину
          </Link>
        </div>
      </div>

      {attention.length > 0 ? (
        <section className="mt-12">
          <SectionHeading>Доделать</SectionHeading>
          <ul className="mt-5 flex flex-col gap-3">
            {attention.map((row) => (
              <Row key={row.href} href={row.href} label={row.label} count={row.count} />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12">
        <SectionHeading>Разделы</SectionHeading>
        <ul className="mt-5 flex flex-col gap-3">
          <Row
            href="/admin/products"
            label="Товары"
            note={`${counts.published} на витрине`}
          />
          <Row href="/admin/categories" label="Категории" count={counts.categories} />
          {isOwner ? (
            <>
              <Row
                href="/admin/settings"
                label="Настройки"
                note="Минимальный заказ, контакты, тексты"
              />
              <Row
                href="/admin/admins"
                label="Админы"
                note="Кто может входить в панель"
              />
            </>
          ) : null}
        </ul>
      </section>
    </>
  );
}

/** A stage you press — the storefront's category row, with a count or a line. */
function Row({
  href,
  label,
  count,
  note,
}: {
  href: string;
  label: string;
  count?: number;
  note?: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="stage group flex min-h-16 items-center gap-4 px-5 py-4"
      >
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-base leading-snug font-bold sm:text-lg">
            {label}
          </span>
          {note ? (
            <span className="text-muted mt-1 block text-sm leading-snug">{note}</span>
          ) : null}
        </span>
        {count !== undefined ? (
          <span className="text-ink shrink-0 text-lg font-bold tabular-nums">
            {count}
          </span>
        ) : null}
        <svg
          aria-hidden
          viewBox="0 0 8 14"
          className="text-ink h-3.5 w-2 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
        >
          <path
            d="M1 1l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </li>
  );
}

function Skeleton() {
  return (
    <div aria-hidden>
      <div className="bg-primary-wash mt-6 h-44 rounded-lg" />
      <div className="bg-primary-wash mt-12 h-7 w-40 rounded-md" />
      <div className="mt-5 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="stage h-16" />
        ))}
      </div>
    </div>
  );
}
