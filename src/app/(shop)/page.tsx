import Link from "next/link";
import { Suspense } from "react";

import { ProductCard } from "@/components/shop/ProductCard";
import { SectionHeading } from "@/components/ui/GoldRule";
import { objectUrl } from "@/lib/media";
import { GOODS, keepUnits, plural } from "@/lib/format";
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
 *
 * ── Why the page function reads nothing ──
 *
 * It used to await all four queries in its own body, so nothing at all appeared
 * until the slowest of them returned. Every other route in this application
 * already reads inside a boundary; this one is now consistent with them, and
 * the three blocks arrive top to bottom behind skeletons that hold their
 * heights, so nothing below moves as each lands.
 *
 * The build does not read any of it. Each of the four reads awaits `io()`
 * before touching PostgreSQL, so what `next build` emits for this route is the
 * three skeletons below and nothing else — see src/server/catalog/queries.ts.
 */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-20">
      <Suspense fallback={<HeroSkeleton />}>
        <HeroBlock />
      </Suspense>

      <Suspense fallback={<CategoriesSkeleton />}>
        <Categories />
      </Suspense>

      <Suspense fallback={<LanesSkeleton />}>
        <Lanes />
      </Suspense>
    </main>
  );
}

async function HeroBlock() {
  const settings = await getSettings();
  return (
    <Hero
      minOrderKop={settings.minOrderKop}
      address={settings.address}
      phone={settings.phone}
      whatsappPhone={settings.whatsappPhone}
    />
  );
}

async function Categories() {
  const categories = await getCategories();

  /**
   * Nothing published yet.
   *
   * Not a case anyone designed for until the demo rows were cleared from the
   * live catalog and the home screen was left with the word «Категории» over a
   * blank gap — a heading promising a list that was not coming. An empty
   * catalog is a real state twice over: on the day the client takes this over,
   * and any time everything is unpublished at once.
   *
   * It says what is true and where the goods come from, and it is quiet:
   * a buyer who lands here mid-import should see a shop between deliveries,
   * not a broken page.
   */
  if (categories.length === 0) {
    return (
      <section aria-labelledby="categories" className="mt-12">
        <SectionHeading>
          <span id="categories">Категории</span>
        </SectionHeading>
        <p className="text-muted mt-5 text-sm leading-normal">
          Каталог наполняется. Позвоните или напишите в WhatsApp — подскажем, что
          есть в наличии сейчас.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="categories" className="mt-12">
      <SectionHeading>
        <span id="categories">Категории</span>
      </SectionHeading>

      <ul className="mt-5 flex flex-col gap-3">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} />
        ))}
      </ul>
    </section>
  );
}

async function Lanes() {
  // One boundary for both, because they arrive from the same round trip and
  // revealing «Хиты» before «Новинки» would be motion for its own sake.
  const [settings, newArrivals, hits] = await Promise.all([
    getSettings(),
    getNewArrivals(8),
    getHits(8),
  ]);
  return (
    <>
      <Lane title="Новинки" products={newArrivals} showPrices={settings.showPrices} />
      <Lane title="Хиты" products={hits} showPrices={settings.showPrices} />
    </>
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
 * The terms sit in a dark block, the reference's FEATURES panel, because they
 * are the one part of this screen that is the same promise to every buyer. The
 * minimum is a sentence in it rather than a big number over a small label —
 * that arrangement is the stat tile every dashboard ships, and this is a
 * condition of trade, not a metric. Its figure is money, so it is amber: the
 * bright one, which reads at 6.3:1 on the block and would not on white.
 *
 * The «СКЛАД» label that stood over the address is gone. A label above a line
 * that already says what it is was only ever a caption for itself.
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
    <section className="pt-8 pb-2">
      <h1 className="display-caps text-ink text-h1 text-balance">
        Оптовый склад парфюмерии
      </h1>

      <p className="text-muted mt-4 text-sm leading-snug">
        Известные бренды · Выгодные условия · Надёжные поставки
      </p>

      <div className="bg-night text-on-night mt-6 rounded-lg p-5">
        <p className="display-caps text-2xl">
          Оптом от{" "}
          <span className="text-price-bright tabular-nums">{formatRub(minOrderKop)}</span>
        </p>
        <p className="mt-2 text-base font-semibold">Доставка по России</p>

        {address ? (
          <p className="text-on-night-muted mt-4 text-sm leading-snug">{address}</p>
        ) : null}

        {phone || whatsappPhone ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {/* The reference's white capsule on a dark ground: the call is the
                primary action here, so it takes the light. */}
            {phone ? (
              <a
                href={`tel:${tel}`}
                className="bg-on-night text-night focus-visible:outline-on-night inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold tabular-nums transition-opacity hover:opacity-90"
              >
                {phone}
              </a>
            ) : null}
            {whatsappPhone ? (
              <a
                href={`https://wa.me/${wa}`}
                rel="noopener noreferrer"
                target="_blank"
                className="border-on-night-muted text-on-night focus-visible:outline-on-night inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold transition-opacity hover:opacity-80"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * A category: a stage you press, with its picture, its name and its depth.
 *
 * The client's own example is a list of rows rather than a grid of tiles, and
 * it is the right shape for four categories whose names are long and whose
 * difference is a format rather than a look — «Парфюм 2 в 1 «двойняшки» 100 мл»
 * does not fit under a tile and is the whole distinction.
 *
 * Names are in sentence case, bold, not capitals. The reference sets its tabs
 * — «Underground», «Casual» — the same way, and a Russian category name that
 * runs to five words is read faster in lower case by a buyer who is over forty
 * and standing in daylight. 16px on a phone and 20 from `sm`: at 20 the longest
 * name wrapped to two lines on a 375 screen.
 *
 * The picture is optional and mostly absent — the client enters the catalog
 * themselves and a cover is the last thing they will get to — so the monogram
 * in its well is a designed state, quiet enough that four in a column read as
 * the brand and not as four errors.
 */
function CategoryRow({ category }: { category: CategoryRowData }) {
  return (
    <li>
      <Link
        href={`/c/${category.slug}`}
        className="stage group flex items-center gap-4 p-3"
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
            className="bg-canvas h-20 w-16 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="bg-canvas flex h-20 w-16 shrink-0 items-center justify-center rounded-md"
          >
            <span className="font-wordmark text-wordmark/45 text-2xl leading-none">Á</span>
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="text-ink block text-base leading-snug font-bold sm:text-lg">
            {keepUnits(category.name)}
          </span>
          <span className="text-muted mt-1 block text-sm leading-snug">
            {category.productCount} {plural(category.productCount, GOODS)}
          </span>
        </span>

        {/* One stroke, and it leans in on hover — movement by transform, so it
            costs no layout. */}
        <svg
          aria-hidden
          viewBox="0 0 8 14"
          className="text-ink mr-1 h-3.5 w-2 shrink-0 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
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

/**
 * A lane — «Новинки», «Хиты».
 *
 * A rail rather than a grid, and that is the difference between a home screen
 * and a wall. Eight cards in a two-column grid is four screens of scrolling on
 * a phone before the second lane even begins; the same eight in a rail take one
 * screen and say, by the card cut off at the edge, that there are more.
 *
 * Built from scroll-snap and overflow, so it costs no JavaScript and keeps
 * working with a keyboard, a trackpad and a screen reader.
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
    <section className="mt-12">
      <SectionHeading>{title}</SectionHeading>

      {/*
        Negative margin and matching padding: the rail bleeds to both edges of
        the phone, so the last card is clipped by the screen rather than by a
        gutter — which is what tells a thumb there is more to the right.

        `scroll-px-4` is not decoration. A snap container snaps to its
        scrollport, which is the padding box — so with padding alone the browser
        scrolls the gutter away to align the first card with the screen edge.
        The scroll padding moves the snap edge to match the visual one.

        The vertical padding is for the stages' shadows. An overflow container
        clips on both axes once one is set, and a card whose shadow is cut off
        at its foot looks pasted onto the page rather than standing on it.
      */}
      <ul className="-mx-4 mt-5 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pt-1 pb-5">
        {products.map((product, i) => (
          // 5/12 rather than a half: two cards fit and a third shows its edge,
          // which is what says the rail scrolls.
          <li key={product.id} className="flex w-5/12 shrink-0 snap-start sm:w-48">
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

/**
 * The loading states.
 *
 * Each one holds the height of the block it stands in for, because a skeleton
 * that lays out differently is not a placeholder — it is a guaranteed reflow of
 * everything below it the moment the real content lands.
 */
function HeroSkeleton() {
  return (
    <section aria-hidden className="pt-8 pb-2">
      <div className="bg-primary-wash h-8 w-4/5 rounded-md" />
      <div className="bg-primary-wash mt-2 h-8 w-1/2 rounded-md" />
      <div className="bg-primary-wash mt-5 h-4 w-3/4 rounded-md" />
      <div className="bg-night mt-6 h-56 rounded-lg" />
    </section>
  );
}

function CategoriesSkeleton() {
  return (
    <section aria-hidden className="mt-12">
      <SectionHeading>Категории</SectionHeading>
      <ul className="mt-5 flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="stage flex items-center gap-4 p-3">
            <span className="bg-canvas h-20 w-16 shrink-0 rounded-md" />
            <span className="min-w-0 flex-1">
              <span className="bg-primary-wash block h-5 w-2/3 rounded-md" />
              <span className="bg-primary-wash mt-2 block h-4 w-1/3 rounded-md" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function LanesSkeleton() {
  return (
    <div aria-hidden>
      {["Новинки", "Хиты"].map((title) => (
        <section key={title} className="mt-12">
          <SectionHeading>{title}</SectionHeading>
          <div className="-mx-4 mt-5 flex gap-3 overflow-hidden px-4 pt-1 pb-5">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="stage w-5/12 shrink-0 p-2 sm:w-48">
                <div className="bg-canvas aspect-[4/5] w-full rounded-md" />
                <div className="px-1.5 pt-3 pb-1.5">
                  <div className="bg-primary-wash h-3.5 w-11/12 rounded-md" />
                  <div className="bg-primary-wash mt-1.5 h-3.5 w-2/3 rounded-md" />
                  <div className="bg-primary-wash mt-4 h-6 w-1/2 rounded-md" />
                  <div className="bg-primary-wash mt-3 h-3 w-3/4 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
