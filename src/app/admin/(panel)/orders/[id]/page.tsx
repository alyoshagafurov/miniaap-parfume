import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { OrderStatusControl } from "@/components/admin/OrderStatusControl";
import { formatDateTimeRu } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { DELIVERY_LABELS } from "@/lib/orders";
import { getOrder } from "@/server/admin/orders";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = { title: "Заявка" };

/**
 * One request.
 *
 * Everything the manager needs to act: who to call, how to reach them in one
 * tap, what was ordered and for how much, and the one thing they may change.
 */
export default function AdminOrderPage({ params }: PageProps) {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <Card params={params} />
    </Suspense>
  );
}

async function Card({ params }: PageProps) {
  const { id } = await params;
  const order = await getOrder(id);
  if (!order) notFound();

  const digits = order.phone.replace(/\D/g, "");
  const lineTotal = (priceKop: number, qty: number) => priceKop * qty;
  // Recomputed from the rows rather than read from the column: the stored total
  // has no database-level tie to its items, so a screen that shows both is the
  // place a divergence would be noticed.
  const itemsTotal = order.items.reduce(
    (sum, i) => sum + lineTotal(i.priceKop, i.qty),
    0,
  );

  return (
    <>
      <Link
        href="/admin/orders"
        className="text-muted inline-flex min-h-11 items-center text-sm"
      >
        ← Все заявки
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
        {/* Body face: an order number is data, and Cormorant's subset has only
            old-style figures, which set «ARM-000144» with descenders. */}
        <h1 className="text-ink text-h2 leading-tight font-semibold tabular-nums">
          № {order.number}
        </h1>
        <span className="text-ink text-h2 font-semibold tabular-nums">
          {formatRub(order.totalKop)}
        </span>
      </div>

      <p className="text-muted mt-1 text-sm">
        {formatDateTimeRu(order.createdAt)} ·{" "}
        {order.source === "TELEGRAM" ? "из Telegram" : "с сайта"}
      </p>

      <div className="mt-6">
        <OrderStatusControl id={order.id} status={order.status} />
      </div>

      <section className="border-rule bg-surface mt-8 rounded-md border p-4">
        <h2 className="caps text-muted">Покупатель</h2>
        <dl className="mt-3 flex flex-col gap-2 text-sm">
          <Row label="Имя">{order.name}</Row>
          <Row label="Телефон">
            <a
              href={`tel:${order.phone}`}
              className="text-olive underline underline-offset-4"
            >
              {order.phone}
            </a>
          </Row>
          <Row label="Город">{order.city}</Row>
          <Row label="Доставка">
            {DELIVERY_LABELS[order.delivery] ?? order.delivery}
          </Row>
          {order.comment ? <Row label="Комментарий">{order.comment}</Row> : null}
          {order.botBlocked ? (
            <Row label="Бот">
              <span className="text-danger">заблокирован покупателем — не напишет</span>
            </Row>
          ) : null}
        </dl>

        {/*
          One tap to the buyer, in the two places this audience actually is.
          tg:// resolves to the Telegram app; wa.me needs the number without a
          plus. Both open outside this panel, hence the rel.
        */}
        <div className="mt-4 flex flex-wrap gap-3">
          {order.telegramUsername ? (
            <ContactLink href={`tg://resolve?domain=${order.telegramUsername}`}>
              Написать в Telegram
            </ContactLink>
          ) : order.telegramId ? (
            <ContactLink href={`tg://user?id=${order.telegramId}`}>
              Написать в Telegram
            </ContactLink>
          ) : null}
          {digits ? (
            <ContactLink href={`https://wa.me/${digits}`}>WhatsApp</ContactLink>
          ) : null}
          {digits ? (
            <ContactLink href={`tel:${order.phone}`}>Позвонить</ContactLink>
          ) : null}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="caps text-muted">Состав</h2>
        <ul className="mt-3 flex flex-col">
          {order.items.map((item) => (
            <li key={item.id} className="border-rule border-b py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                {/* title alone: the snapshot's title is the product's generated
                    name, which already begins with the brand. */}
                <span className="text-ink text-sm">{item.title}</span>
                <span className="text-ink text-sm font-semibold tabular-nums">
                  {formatRub(lineTotal(item.priceKop, item.qty))}
                </span>
              </div>
              <p className="text-muted mt-0.5 text-xs tabular-nums">
                {item.sku} · {item.format} · {formatRub(item.priceKop)} × {item.qty}
                {item.productId ? "" : " · товара больше нет в каталоге"}
              </p>
            </li>
          ))}
        </ul>

        <div className="border-rule mt-4 flex items-baseline justify-between gap-4 border-t pt-3">
          <span className="text-ink text-base">Итого</span>
          <span className="text-ink text-base font-semibold tabular-nums">
            {formatRub(order.totalKop)}
          </span>
        </div>

        {itemsTotal !== order.totalKop ? (
          <p
            role="alert"
            className="border-danger bg-danger-wash text-ink mt-4 rounded-md border p-3 text-sm"
          >
            Сумма позиций — {formatRub(itemsTotal)}, а записано{" "}
            {formatRub(order.totalKop)}. Это расхождение в данных: покажите заявку
            разработчику, прежде чем работать по ней.
          </p>
        ) : null}
      </section>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3">
      <dt className="text-muted w-28 shrink-0">{label}</dt>
      <dd className="text-ink min-w-0 break-words">{children}</dd>
    </div>
  );
}

function ContactLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm transition-colors"
    >
      {children}
    </a>
  );
}

function CardSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="bg-surface h-8 w-40 rounded-md" />
      <div className="bg-surface h-11 w-full rounded-md" />
      <div className="border-rule bg-surface h-48 rounded-md border" />
      <div className="border-rule bg-surface h-48 rounded-md border" />
    </div>
  );
}
