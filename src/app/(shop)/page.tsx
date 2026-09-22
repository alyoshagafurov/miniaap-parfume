import Link from "next/link";

import { ProductCard } from "@/components/shop/ProductCard";
import { GoldRule, RuledHeading } from "@/components/ui/GoldRule";
import { formatRub } from "@/lib/money";
import { getCategories, getHits, getNewArrivals } from "@/server/catalog/queries";
import { getSettings } from "@/server/settings";

/**
 * The home screen.
 *
 * Ordered by what a wholesale buyer needs, not by what looks impressive: who
 * this is and how to reach them, then the way in (categories), then two short
 * lanes of merchandising. Everything above the fold is answerable in one
 * glance on a phone held in one hand on a market floor.
 */
export default async function HomePage() {
  const [settings, categories, newArrivals, hits] = await Promise.all([
    getSettings(),
    getCategories(),
    getNewArrivals(8),
    getHits(8),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16">
      <header className="pt-8 pb-6 text-center">
        <h1 className="font-display text-olive text-h1 leading-tight font-semibold">
          {settings.companyName.replace(" Parfum & Care", "")}
        </h1>
        <p className="caps text-muted mt-2">Parfum &amp; Care</p>
        <GoldRule className="mx-auto mt-4 w-40" />
        <p className="text-muted mt-4 text-sm">
          Известные бренды · Выгодные условия · Надёжные поставки
        </p>
      </header>

      <section
        aria-label="Условия работы"
        className="bg-surface border-rule rounded-md border p-4"
      >
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {settings.address ? (
            <div>
              <dt className="caps text-muted">Адрес</dt>
              <dd className="text-ink mt-1">{settings.address}</dd>
            </div>
          ) : null}
          <div>
            <dt className="caps text-muted">Минимальный заказ</dt>
            <dd className="text-ink mt-1 tabular-nums">{formatRub(settings.minOrderKop)}</dd>
          </div>
          {settings.phone ? (
            <div>
              <dt className="caps text-muted">Телефон</dt>
              <dd className="mt-1">
                <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`} className="text-olive underline underline-offset-4">
                  {settings.phone}
                </a>
              </dd>
            </div>
          ) : null}
          {settings.whatsappPhone ? (
            <div>
              <dt className="caps text-muted">WhatsApp</dt>
              <dd className="mt-1">
                <a
                  href={`https://wa.me/${settings.whatsappPhone.replace(/\D/g, "")}`}
                  className="text-olive underline underline-offset-4"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Написать
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="categories" className="mt-10">
        <RuledHeading>
          <span id="categories">Категории</span>
        </RuledHeading>

        <ul className="mt-4 flex flex-col">
          {categories.map((c) => (
            <li key={c.id} className="border-rule border-b last:border-b-0">
              <Link
                href={`/c/${c.slug}`}
                className="hover:bg-surface flex items-center justify-between gap-4 rounded-md px-2 py-4 transition-colors"
              >
                <span className="min-w-0">
                  <span className="text-ink block text-lg leading-snug font-medium">{c.name}</span>
                  {c.subtitle ? (
                    <span className="text-muted mt-0.5 block text-sm">{c.subtitle}</span>
                  ) : null}
                </span>
                <span className="text-muted shrink-0 text-sm tabular-nums">
                  {c._count.products}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ProductLane title="Новинки" products={newArrivals} showPrices={settings.showPrices} />
      <ProductLane title="Хиты" products={hits} showPrices={settings.showPrices} />
    </main>
  );
}

function ProductLane({
  title,
  products,
  showPrices,
}: {
  title: string;
  products: Awaited<ReturnType<typeof getNewArrivals>>;
  showPrices: boolean;
}) {
  if (products.length === 0) return null;
  return (
    <section className="mt-12">
      <RuledHeading>{title}</RuledHeading>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
        {products.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} showPrices={showPrices} />
          </li>
        ))}
      </ul>
    </section>
  );
}
