import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddToCart } from "@/components/shop/AddToCart";
import { Gallery, type GalleryImage } from "@/components/shop/Gallery";
import { ProductCard } from "@/components/shop/ProductCard";
import { ProductImage } from "@/components/shop/ProductImage";
import { ShareButton } from "@/components/shop/ShareButton";
import { GoldRule, SectionHeading } from "@/components/ui/GoldRule";
import { Price } from "@/components/ui/Price";
import { FAMILY_LABELS, GENDER_LABELS } from "@/lib/list-url";
import {
  getMoreFromBrand,
  getOtherFormats,
  getProductBySlug,
} from "@/server/catalog/queries";
import { getSettings } from "@/server/settings.cached";
import { keepUnits, productName } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { objectUrl } from "@/lib/media";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const STOCK_LABEL: Record<string, string> = {
  IN_STOCK: "В наличии",
  LOW: "Мало",
  OUT: "Нет в наличии",
  PREORDER: "Под заказ",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Товар не найден" };

  const brand = product.fragrances[0]?.fragrance.brand.name ?? "ÁRUMI";
  const names = product.fragrances.map((f) => f.fragrance.name).join(" + ");
  return {
    title: `${brand} ${names} — ${product.volumeMl} мл`,
    description: product.fragrances[0]?.fragrance.description ?? undefined,
  };
}

/**
 * A product.
 *
 * Same frame as everywhere else: the page function reads nothing, because under
 * cacheComponents a route that touches params outside a Suspense boundary
 * cannot be prerendered.
 *
 * One boundary here rather than the category's two. Everything on this screen —
 * the heading, the price, the gallery, the notes — comes from one cached lookup
 * by slug, so there is no half of it that could arrive sooner.
 */
export default function ProductPage({ params }: PageProps) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-4 pb-16">
      <Suspense fallback={<ProductSkeleton />}>
        <Product params={params} />
      </Suspense>
    </main>
  );
}

async function Product({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  const primary = product.fragrances[0];
  const brand = primary?.fragrance.brand;
  const brandName = brand?.name ?? "ÁRUMI";
  const names = product.fragrances.map((f) => f.fragrance.name);
  const displayTitle = names.join(" + ") || product.title;
  const orderable = product.stock !== "OUT";

  const [settings, moreFromBrand] = await Promise.all([
    getSettings(),
    brand
      ? getMoreFromBrand(brand.id, {
          productId: product.id,
          scentSlugs: product.fragrances.map((f) => f.fragrance.slug),
        })
      : Promise.resolve([]),
  ]);

  // One list per fragrance: a twin belongs to two, and merging them would claim
  // a format carries both scents when it carries one.
  const formatGroups = await Promise.all(
    product.fragrances.map(async (f) => ({
      fragranceName: f.fragrance.name,
      products: await getOtherFormats(f.fragrance.id, product.id),
    })),
  );
  const hasFormats = formatGroups.some((g) => g.products.length > 0);

  const gallery: GalleryImage[] = product.images.map((i) => ({
    src: objectUrl(i.key),
    width: i.width,
    height: i.height,
    blurDataUrl: i.blurDataUrl,
  }));

  const shareUrl = shareLink(product.slug);

  const cartLine = {
    productId: product.id,
    seenPriceKop: settings.showPrices ? product.priceKop : 0,
    seenPackSize: product.packSize,
    seenStock: product.stock,
    slug: product.slug,
    title: displayTitle,
    brandName,
    format: `${product.volumeMl} мл`,
    imageKey: product.images[0]?.key ?? null,
  };

  // The reference's size row — S · M · L · XL — is this catalog's own pivot:
  // the same fragrance in its other formats. For a single fragrance it is one
  // row with the current format underlined. A twin carries two fragrances with
  // different sets of formats, so it keeps the grouped list further down.
  const single = product.fragrances.length === 1;
  const formatRow = single
    ? [
        {
          slug: product.slug,
          volumeMl: product.volumeMl,
          categoryName: product.category.name,
          priceKop: product.priceKop,
          stock: product.stock,
          current: true,
        },
        ...(formatGroups[0]?.products ?? []).map((o) => ({
          slug: o.slug,
          volumeMl: o.volumeMl,
          categoryName: o.category.name,
          priceKop: o.priceKop,
          stock: o.stock,
          current: false,
        })),
      ].sort((a, b) => a.volumeMl - b.volumeMl)
    : [];

  return (
    <>
      <nav aria-label="Хлебные крошки" className="mb-2">
        <Link
          href={`/c/${product.category.slug}`}
          className="text-ink -ml-1 inline-flex min-h-11 items-center gap-2 rounded-full px-1 text-sm font-semibold"
        >
          <svg aria-hidden viewBox="0 0 16 12" className="h-3 w-4">
            <path
              d="M6 1L1 6l5 5M1 6h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {keepUnits(product.category.name)}
        </Link>
      </nav>

      {/*
        Two columns from `md`, one below it.

        At 768 and up a full-bleed 4:5 photograph is 960 pixels tall, so the
        price and the quantity — the two things the page exists for — sat below
        the fold on a desktop while the screen showed nothing but a bottle.
        Stacked on a phone, where the picture at the top and the price under it
        is the right order and the only one that fits.
      */}
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-10">
        <div className="stage p-2 md:sticky md:top-32">
          {gallery.length > 0 ? (
            <Gallery images={gallery} alt={productName(brandName, displayTitle)} />
          ) : (
            <ProductImage
              image={undefined}
              title={displayTitle}
              brandName={brandName}
              prominent
              sizes="(max-width: 767px) 100vw, 360px"
            />
          )}
        </div>

        <div className="mt-6 md:mt-0">
          {/* Name and price on one line, as the reference sets «COSY KNIT SET»
              against «$299»: the two things a wholesaler reads first, at the
              size they are read at. The brand is not a label above the name —
              a caption over a heading only restates it — it follows, small. */}
          <div className="flex items-start justify-between gap-4">
            <h1 className="display-caps text-ink text-xl text-balance sm:text-3xl">
              {displayTitle}
            </h1>
            <Price
              kop={product.priceKop}
              oldKop={product.oldPriceKop}
              showPrices={settings.showPrices}
              className="shrink-0 justify-end text-right text-2xl sm:text-3xl"
            />
          </div>

          <p className="text-muted mt-3 text-sm leading-snug">
            {brand ? (
              <Link
                href={`/b/${brand.slug}`}
                className="text-ink font-semibold underline decoration-rule hover:decoration-ink"
              >
                {brandName}
              </Link>
            ) : (
              brandName
            )}
            {` · ${product.volumeMl} мл · арт. ${product.sku}`}
            {STOCK_LABEL[product.stock] ? (
              <span className={product.stock === "OUT" ? "text-danger font-semibold" : ""}>
                {` · ${STOCK_LABEL[product.stock]}`}
              </span>
            ) : null}
          </p>

          {formatRow.length > 1 ? (
            <FormatRow items={formatRow} showPrices={settings.showPrices} />
          ) : null}

          {/* In the column from `md`, where the whole page fits beside the
              picture. On a phone it lives in the request bar at the foot. */}
          <div className="mt-6 hidden md:block">
            <AddToCart disabled={!orderable} line={cartLine} />
          </div>

          <Conditions
            packSize={product.packSize}
            minOrderKop={settings.minOrderKop}
            showPrices={settings.showPrices}
          />

          <div className="mt-4">
            <ShareButton url={shareUrl} title={productName(brandName, displayTitle)} />
          </div>
        </div>
      </div>

      {!single && hasFormats ? (
        <section className="mt-12">
          <SectionHeading>Этот аромат в других форматах</SectionHeading>
          <div className="mt-5 flex flex-col gap-5">
            {formatGroups.map((group) =>
              group.products.length > 0 ? (
                <div key={group.fragranceName}>
                  <h3 className="text-ink mb-2 text-sm font-bold">{group.fragranceName}</h3>
                  <ul className="stage divide-rule flex flex-col divide-y overflow-hidden">
                    {group.products.map((other) => (
                      <li key={other.id}>
                        <Link
                          href={`/p/${other.slug}`}
                          className="hover:bg-primary-wash flex items-center justify-between gap-4 px-4 py-3.5 transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="text-ink block text-base leading-snug font-bold">
                              {other.volumeMl} мл
                            </span>
                            <span className="text-muted mt-0.5 block text-xs">
                              {other.category.name}
                              {other.packSize > 1 ? ` · кратно ${other.packSize}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <Price
                              kop={other.priceKop}
                              showPrices={settings.showPrices}
                              className="text-base"
                            />
                            {other.stock === "OUT" ? (
                              <span className="text-danger mt-0.5 block text-xs font-semibold">
                                Нет
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null,
            )}
          </div>
        </section>
      ) : null}

      {product.fragrances.map((f) => (
        <FragranceDetail
          key={f.fragrance.id}
          fragrance={f.fragrance}
          named={product.fragrances.length > 1}
        />
      ))}

      {moreFromBrand.length > 0 ? (
        <section className="mt-12">
          <SectionHeading>Ещё от {brandName}</SectionHeading>
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {moreFromBrand.map((p) => (
              <li key={p.id} className="flex">
                <ProductCard
                  product={p}
                  showPrices={settings.showPrices}
                  sizes={"(max-width: 639px) 50vw, (max-width: 767px) 33vw, 192px"}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        The request bar.

        On a 390×844 phone «В заявку» sat at 896 pixels — below the first
        screen, under a photograph and a heading, where a buyer holding the
        phone in one hand had to scroll to find the one thing the page is for.
        PRODUCT.md puts primary actions in the lower third and says the request
        must always be reachable, and the reference ends its screen the same
        way: a single capsule on a dark ground at the thumb.

        Sticky, not fixed. As the last thing in the page's own content it rides
        the bottom of the screen while there is page below it, and comes to rest
        above the footer when the buyer reaches the end — so it never covers
        the telephone number at the bottom, which a fixed bar would.
      */}
      <div
        className="bg-night sticky bottom-0 z-20 -mx-4 mt-12 rounded-t-lg md:hidden"
        style={{ paddingBottom: "var(--tg-safe-bottom)" }}
      >
        <div className="px-4 pt-3 pb-4">
          <AddToCart disabled={!orderable} line={cartLine} tone="dark" />
        </div>
      </div>
    </>
  );
}

/**
 * This fragrance's formats, as the reference's size row.
 *
 * Volume on top, the format's price beneath it, the current one underlined in
 * the logo's gold. Two formats can share a volume — a 100 ml bottle and a 100 ml
 * twin — so a volume that appears twice is told apart by what kind of bottle it
 * is. A row rather than a dropdown because there are two to four of them, and a
 * buyer should see what exists without opening anything.
 */
function FormatRow({
  items,
  showPrices,
}: {
  items: ReadonlyArray<{
    slug: string;
    volumeMl: number;
    categoryName: string;
    priceKop: number;
    stock: string;
    current: boolean;
  }>;
  showPrices: boolean;
}) {
  const repeated = new Set(
    items.map((i) => i.volumeMl).filter((v, _, all) => all.indexOf(v) !== all.lastIndexOf(v)),
  );

  return (
    <nav aria-label="Другие форматы этого аромата" className="-mx-4 mt-6 overflow-x-auto px-4">
      <ul className="flex gap-6">
        {items.map((item) => {
          const label = `${item.volumeMl} мл`;
          const kind = repeated.has(item.volumeMl) ? formatKind(item.categoryName) : null;
          const body = (
            <>
              <span className="text-ink block text-base leading-none font-extrabold tabular-nums">
                {label}
              </span>
              {kind ? <span className="text-muted mt-1 block text-xs">{kind}</span> : null}
              {showPrices ? (
                <span className="text-price mt-1.5 block text-sm font-bold tabular-nums">
                  {formatRub(item.priceKop)}
                </span>
              ) : null}
              <span
                aria-hidden
                className={`mt-2 block h-0.5 w-full rounded-full ${item.current ? "bg-gold" : "bg-transparent"}`}
              />
            </>
          );
          return (
            <li key={item.slug} className="shrink-0">
              {item.current ? (
                <span aria-current="true" className="block min-w-11 py-1">
                  {body}
                </span>
              ) : (
                <Link
                  href={`/p/${item.slug}`}
                  className={`block min-w-11 py-1 transition-opacity hover:opacity-70 ${item.stock === "OUT" ? "opacity-50" : ""}`}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** What kind of bottle a format is, when its volume alone is ambiguous. */
function formatKind(categoryName: string): string {
  if (/2\s*в\s*1|двойняш/i.test(categoryName)) return "2 в 1";
  if (/дезодорант/i.test(categoryName)) return "дезодорант";
  if (/карандаш/i.test(categoryName)) return "карандаш";
  return categoryName;
}

/**
 * The terms of trade, in the reference's dark FEATURES panel.
 *
 * Three facts a wholesaler needs before pressing «В заявку», and a list rather
 * than three tiles with an icon each — that arrangement is the page every
 * template ships, and these are conditions to read, not features to admire.
 * The minimum is money, so it is amber: the bright one, which only reads on a
 * dark ground.
 */
function Conditions({
  packSize,
  minOrderKop,
  showPrices,
}: {
  packSize: number;
  minOrderKop: number;
  showPrices: boolean;
}) {
  return (
    <section aria-labelledby="conditions" className="bg-night text-on-night mt-6 rounded-lg p-5">
      <h2 id="conditions" className="display-caps text-lg">
        Условия
      </h2>
      <dl className="divide-on-night-muted/25 mt-4 flex flex-col divide-y">
        <div className="flex items-baseline justify-between gap-4 pb-3">
          <dt className="text-on-night-muted text-sm">Отпускается</dt>
          <dd className="text-sm font-bold tabular-nums">
            {packSize > 1 ? `упаковкой по ${packSize} шт` : "поштучно"}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 py-3">
          <dt className="text-on-night-muted text-sm">Минимальный заказ</dt>
          <dd className="text-sm font-bold tabular-nums">
            {showPrices ? (
              <span className="text-price-bright">{formatRub(minOrderKop)}</span>
            ) : (
              "уточните у менеджера"
            )}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 pt-3">
          <dt className="text-on-night-muted text-sm">Доставка</dt>
          <dd className="text-sm font-bold">по всей России</dd>
        </div>
      </dl>
    </section>
  );
}

type FragranceDetailData =
  Awaited<ReturnType<typeof getProductBySlug>> extends infer T
    ? T extends { fragrances: Array<{ fragrance: infer F }> }
      ? F
      : never
    : never;

/**
 * Everything about the scent rather than about the bottle.
 *
 * Repeated per fragrance, because a twin has two and describing only the first
 * would be a lie about what is in it. The name is printed above each block only
 * when there is more than one to tell apart.
 */
function FragranceDetail({
  fragrance,
  named,
}: {
  fragrance: FragranceDetailData;
  named: boolean;
}) {
  const hasNotes =
    fragrance.notesTop.length > 0 ||
    fragrance.notesHeart.length > 0 ||
    fragrance.notesBase.length > 0;

  if (!hasNotes && !fragrance.description && fragrance.families.length === 0)
    return null;

  return (
    <section className="mt-12">
      <SectionHeading>{named ? fragrance.name : "Об аромате"}</SectionHeading>

      {/* Centred as one composition with the pyramid below it. The tags and the
          description left-aligned against a centred triangle read as two
          sections that happen to be adjacent. */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Tag>{GENDER_LABELS[fragrance.gender] ?? fragrance.gender}</Tag>
        {fragrance.families.map((family) => (
          <Tag key={family}>{FAMILY_LABELS[family] ?? family}</Tag>
        ))}
      </div>

      {/* Small and last, as the client asked: the description is for the
          buyer who has already decided to read on, not for the one scanning. */}
      {fragrance.description ? (
        <p className="text-ink mx-auto mt-5 max-w-md text-center text-sm leading-relaxed">
          {fragrance.description}
        </p>
      ) : null}

      {hasNotes ? <NotePyramid fragrance={fragrance} /> : null}
    </section>
  );
}

/**
 * The pyramid, drawn as one.
 *
 * Perfumery has described a scent in three tiers for a century and always draws
 * it as a triangle: the top notes are what opens and fades, the heart is what
 * the scent is, the base is what is left on skin at the end of the day. Three
 * labelled rows carry the same words and none of the meaning — a buyer who
 * knows the convention reads a triangle at a glance and reads a definition list
 * one line at a time.
 *
 * Drawn with the golden thread and nothing else: each tier is introduced by the
 * same rule the whole interface is divided by, stepping wider as it descends.
 * No gradient, no new colour, no illustration — the brand already owned the one
 * mark this needed.
 *
 * A fragrance with only a base — which happens in an import — gets one rule at
 * the widest step rather than a lopsided apex, because the widths are assigned
 * over the tiers that exist rather than over the three that might.
 */
function NotePyramid({
  fragrance,
}: {
  fragrance: { notesTop: string[]; notesHeart: string[]; notesBase: string[] };
}) {
  const tiers = [
    { label: "Верхние ноты", notes: fragrance.notesTop },
    { label: "Сердце", notes: fragrance.notesHeart },
    { label: "База", notes: fragrance.notesBase },
  ].filter((tier) => tier.notes.length > 0);

  // Narrowest at the apex. One tier gets the widest rule, two get the outer
  // pair, three get all three.
  const widths = ["w-12", "w-24", "w-40"];
  const step = (i: number) => widths[widths.length - tiers.length + i] ?? "w-40";

  return (
    <dl className="mt-8 flex flex-col items-center gap-6 text-center">
      {tiers.map((tier, i) => (
        <div key={tier.label} className="flex flex-col items-center">
          <GoldRule className={step(i)} />
          <dt className="caps text-muted mt-3">{tier.label}</dt>
          <dd className="text-ink mt-1 max-w-sm text-sm leading-snug font-semibold">
            {tier.notes.join(" · ")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="bg-primary-wash text-ink rounded-full px-3 py-1.5 text-xs font-semibold">
      {children}
    </span>
  );
}

/**
 * The share link.
 *
 * `t.me/<bot>?startapp=p_<slug>` opens the Mini App straight on this product,
 * which is what a buyer forwarding it to a colleague wants — not a web page the
 * colleague then has to find inside Telegram.
 *
 * Without BOT_USERNAME there is no such link, so it falls back to the public
 * site. Local work has no bot configured and the button still has to do
 * something honest.
 */
function shareLink(slug: string): string {
  const bot = process.env.BOT_USERNAME;
  if (bot) return `https://t.me/${bot}?startapp=p_${slug}`;
  const site = process.env.MINI_APP_URL ?? "";
  return `${site.replace(/\/+$/, "")}/p/${slug}`;
}

function ProductSkeleton() {
  return (
    <div aria-hidden>
      <div className="bg-primary-wash mb-5 h-5 w-36 rounded-full" />
      {/* The same two columns as the page it stands in for. A skeleton that
          lays out differently from what replaces it is not a placeholder, it is
          a guaranteed reflow — and on this page the difference was a 960-pixel
          photograph moving everything below it. */}
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-10">
        <div className="stage p-2">
          <div className="bg-canvas aspect-[4/5] w-full rounded-md" />
        </div>
        <div className="mt-6 md:mt-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="bg-primary-wash h-6 w-11/12 rounded-md" />
              <div className="bg-primary-wash mt-2 h-6 w-2/3 rounded-md" />
            </div>
            <div className="bg-primary-wash h-7 w-24 rounded-md" />
          </div>
          <div className="bg-primary-wash mt-4 h-4 w-3/4 rounded-md" />
          <div className="mt-6 flex gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-primary-wash h-12 w-14 rounded-md" />
            ))}
          </div>
          <div className="bg-primary-wash mt-6 h-12 w-full rounded-full" />
          <div className="bg-night mt-6 h-44 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
