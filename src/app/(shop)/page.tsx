import Link from "next/link";

import { ProductCard } from "@/components/shop/ProductCard";
import { GoldRule, RuledHeading } from "@/components/ui/GoldRule";
import { objectUrl } from "@/lib/media";
import { GOODS, plural } from "@/lib/format";
import { formatRub } from "@/lib/money";
import {
  getCategories,
  getHits,
  getNewArrivals,
  type CategoryRow as CategoryRowData,
} from "@/server/catalog/queries";
import { getSettings } from "@/server/settings.cached";

/**
 * The home screen.
 *
 * Ordered by what a wholesale buyer needs, not by what looks impressive: what
 * this place is and on what terms, then the way in, then two short lanes of
 * merchandising. Everything that decides whether to keep scrolling is
 * answerable in one glance on a phone held in one hand on a market floor.
 */
export default async function HomePage() {
  const [settings, categories, newArrivals, hits] = await Promise.all([
    getSettings(),
    getCategories(),
    getNewArrivals(8),
    getHits(8),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20">
      <Hero
        minOrderKop={settings.minOrderKop}
        address={settings.address}
        phone={settings.phone}
        whatsappPhone={settings.whatsappPhone}
      />

      <section aria-labelledby="categories" className="mt-12">
        <RuledHeading>
          <span id="categories">Категории</span>
        </RuledHeading>

        <ul className="border-rule mt-5 flex flex-col border-t">
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </ul>
      </section>

      <Lane title="Новинки" products={newArrivals} showPrices={settings.showPrices} />
      <Lane title="Хиты" products={hits} showPrices={settings.showPrices} />
    </main>
  );
}

/**
 * The first screen.
 *
 * Four things, because those are the four a wholesaler decides on: that this is
 * a warehouse rather than a shop, that the brands are ones they can resell,
 * what it takes to place an order, and whether it reaches them. The minimum is
 * read from Settings — the owner raises it from the panel and this line has to
 * follow — and the address and both numbers likewise.
 *
 * «Доставка по России» is the one phrase here written into the page. The terms
 * behind it live in Settings and are what the bot and the request screen quote;
 * this is the headline over them, and the direction's confirmed triad sits
 * above it untouched.
 */
function Hero({
  minOrderKop,
  address,
  phone,
  whatsappPhone,
}: {
  minOrderKop: number;
  address: string | null;
  phone: string | null;
  whatsappPhone: string | null;
}) {
  const tel = phone?.replace(/[^\d+]/g, "") ?? "";
  const wa = whatsappPhone?.replace(/\D/g, "") ?? "";

  return (
    <section className="pt-10 pb-2 text-center">
      <h1 className="font-display text-ink text-h1 leading-tight font-semibold text-balance">
        Оптовый склад парфюмерии
      </h1>

      <GoldRule className="mx-auto mt-5 w-40" />

      <p className="text-muted mt-5 text-sm">
        Известные бренды · Выгодные условия · Надёжные поставки
      </p>

      {/* The concrete offer, in ink rather than muted: this is the line that
          answers "can I order from here", and it is not a caption. */}
      <p className="text-ink mt-2 text-base">
        Оптом от{" "}
        <span className="font-semibold tabular-nums">{formatRub(minOrderKop)}</span> ·
        Доставка по России
      </p>

      {address || phone || whatsappPhone ? (
        <div className="bg-surface border-rule mt-8 rounded-md border px-4 py-4 text-left sm:flex sm:items-center sm:justify-between sm:gap-6">
          {address ? (
            <p className="text-ink text-sm leading-snug">
              <span className="caps text-muted mb-1 block">Склад</span>
              {address}
            </p>
          ) : null}

          {phone || whatsappPhone ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-0 sm:shrink-0">
              {phone ? (
                <a
                  href={`tel:${tel}`}
                  className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium tabular-nums transition-colors"
                >
                  {phone}
                </a>
              ) : null}
              {whatsappPhone ? (
                <a
                  href={`https://wa.me/${wa}`}
                  rel="noopener noreferrer"
                  target="_blank"
                  className="border-control text-ink hover:bg-olive-wash inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-medium transition-colors"
                >
                  WhatsApp
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A category as a row: picture, name, what is in it, and where it goes.
 *
 * The client's own example is a list of rows rather than a grid of tiles, and
 * it is the right shape for four categories whose names are long and whose
 * difference is a format rather than a look — «Парфюм 2 в 1 «двойняшки» 100 мл»
 * does not fit under a tile and is the whole distinction.
 *
 * The picture is optional and mostly absent: the client enters the catalog
 * themselves and a category cover is the last thing they will get to. So the
 * empty state is designed rather than left over — the monogram on the surface
 * colour, quiet enough that four of them in a column read as paper and not as
 * four errors.
 */
function CategoryRow({ category }: { category: CategoryRowData }) {
  return (
    <li className="border-rule border-b">
      <Link
        href={`/c/${category.slug}`}
        className="group hover:bg-surface flex items-center gap-4 rounded-md px-2 py-3 transition-colors"
      >
        {category.coverKey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={objectUrl(category.coverKey)}
            alt=""
            width={64}
            height={80}
            loading="lazy"
            decoding="async"
            className="bg-surface h-20 w-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="bg-surface border-rule flex h-20 w-16 shrink-0 items-center justify-center rounded-md border"
          >
            <span className="font-display text-olive/45 text-2xl leading-none">Á</span>
          </span>
        )}

        <span className="min-w-0 flex-1">
          {/* 16px on a phone, 20 from `sm`. «Парфюм 2 в 1 «двойняшки» 100 мл»
              is the longest name the client has, and at 20px it wrapped to two
              lines on a 375 screen, which pushed the subtitle to four and made
              four rows as tall as the whole viewport. */}
          <span className="text-ink block text-base leading-snug font-medium sm:text-lg">
            {category.name}
          </span>
          {/* Count first, then the description, clamped to one line: how deep a
              category is decides whether a wholesaler opens it, and the
              description is the same sentence for everyone who already knows.
              The count lived on the right until it turned out to be eating the
              forty pixels the longest name needed. */}
          <span className="text-muted mt-0.5 block text-sm leading-snug">
            {category.productCount} {plural(category.productCount, GOODS)}
            {category.subtitle ? ` · ${category.subtitle}` : ""}
          </span>
        </span>

        {/* The affordance, not an icon set: one stroke, and it leans in on
            hover so the row answers the pointer without moving anything that
            costs a layout. */}
        <svg
          aria-hidden
          viewBox="0 0 8 14"
          className="text-muted group-hover:text-olive h-3.5 w-2 shrink-0 transition-[color,transform] duration-150 ease-out group-hover:translate-x-0.5"
        >
          <path
            d="M1 1l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </li>
  );
}

/**
 * A lane — «Новинки», «Хиты».
 *
 * A rail rather than a grid, and that is the difference between a home screen
 * and a wall. Eight cards in a two-column grid is four screens of scrolling on
 * a phone before the second lane even begins; the same eight in a rail take one
 * screen and say, by the card cut off at the edge, that there are more.
 *
 * Built from scroll-snap and overflow, so it costs no JavaScript and keeps
 * working with a keyboard, a trackpad and a screen reader — which a carousel
 * with dots and a timer would not.
 */
function Lane({
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
    <section className="mt-14">
      <RuledHeading>{title}</RuledHeading>

      {/*
        Negative margin and matching padding: the rail bleeds to both edges of
        the phone, so the last card is clipped by the screen rather than by a
        gutter — which is what tells a thumb there is more to the right.

        `scroll-px-4` is not decoration. A snap container snaps to its
        scrollport, which is the padding box — so with padding alone the browser
        scrolls the gutter away to align the first card with the screen edge,
        and the rail opens sixteen pixels in with its first card already
        clipped. The scroll padding moves the snap edge to match the visual one.
      */}
      <ul className="-mx-4 mt-5 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2">
        {products.map((product, i) => (
          // 5/12 rather than a half: two cards fit and a third shows its edge,
          // which is what says the rail scrolls. The scrollbar is left alone —
          // a touch browser hides it anyway, and on a desktop it is the only
          // affordance a pointer has.
          <li key={product.id} className="w-5/12 shrink-0 snap-start sm:w-48">
            <ProductCard
              product={product}
              showPrices={showPrices}
              // The first two are on screen before anything is scrolled.
              priority={i < 2}
              sizes="(max-width: 767px) 42vw, 192px"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
