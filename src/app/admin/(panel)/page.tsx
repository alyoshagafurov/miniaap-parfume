import Link from "next/link";
import { Suspense } from "react";

import { getDashboardCounts } from "@/server/admin/dashboard";

export const metadata = { title: "Админка" };

/**
 * The admin home.
 *
 * Four numbers and the way to act on each of them. The counters are the ones
 * the brief names, and every one of them is a question the owner actually asks:
 * what is live, what is half-done, what cannot be sold well without a photo,
 * and what is waiting for a reply.
 */
export default function AdminHomePage() {
  return (
    <>
      <h1 className="font-display text-ink text-h2 leading-tight font-semibold">
        Главная
      </h1>
      <Suspense fallback={<CountersSkeleton />}>
        <Counters />
      </Suspense>
    </>
  );
}

async function Counters() {
  const counts = await getDashboardCounts();

  const cards = [
    {
      label: "Опубликовано",
      value: counts.published,
      href: "/admin/products?status=PUBLISHED",
    },
    { label: "Черновики", value: counts.drafts, href: "/admin/products?status=DRAFT" },
    {
      label: "Без фото",
      value: counts.withoutPhoto,
      href: "/admin/products?photo=none",
    },
    {
      label: "Новые заявки",
      value: counts.newOrders,
      href: "/admin/orders?status=NEW",
    },
  ];

  return (
    <>
      <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <li key={card.label}>
            <Link
              href={card.href}
              className="border-rule bg-surface hover:border-olive flex flex-col gap-1 rounded-md border p-4 transition-colors"
            >
              <span className="caps text-muted">{card.label}</span>
              {/*
                Not the display face. Cormorant's figures are old-style and the
                subset carries no lining set, so "139" drops its 1 and 3 below
                the baseline — lovely in a sentence, wrong for a number someone
                is scanning. Numbers are set in the body face everywhere.
              */}
              <span className="text-ink text-h1 leading-none font-semibold tabular-nums">
                {card.value}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="mt-10">
        <h2 className="caps text-muted">Быстрые действия</h2>
        <ul className="mt-3 flex flex-wrap gap-3">
          {[
            { href: "/admin/products/new", label: "Новый товар" },
            { href: "/admin/fragrances/new", label: "Новый аромат" },
            { href: "/admin/import", label: "Импорт из Excel" },
            { href: "/", label: "Открыть витрину" },
          ].map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors"
              >
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function CountersSkeleton() {
  return (
    <ul aria-hidden className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="border-rule bg-surface h-24 rounded-md border" />
      ))}
    </ul>
  );
}
