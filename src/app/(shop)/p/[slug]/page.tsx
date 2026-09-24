import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { AddToCart } from "@/components/shop/AddToCart";
import { Gallery, type GalleryImage } from "@/components/shop/Gallery";
import { ProductCard } from "@/components/shop/ProductCard";
import { ProductImage } from "@/components/shop/ProductImage";
import { ShareButton } from "@/components/shop/ShareButton";
import { GoldRule, RuledHeading } from "@/components/ui/GoldRule";
import { Price } from "@/components/ui/Price";
import { FAMILY_LABELS, GENDER_LABELS } from "@/lib/list-url";
import {
  getMoreFromBrand,
  getOtherFormats,
  getProductBySlug,
} from "@/server/catalog/queries";
import { getSettings } from "@/server/settings.cached";
import { productName } from "@/lib/format";
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
  // Ничего не делает в рантайме и всё решает при сборке: во время
  // пререндера этот промис не резолвится никогда, то есть метаданные
  // помечаются динамическими и не выполняются на этапе `next build`.
  //
  // Без него сборка образа невозможна без живой базы. Поиск по slug идёт
  // через функцию с 'use cache', и Next честно пытается наполнить этот кэш
  // при пререндере оболочки динамического маршрута — то есть лезет в
  // Postgres, которого в сборочном контейнере нет и быть не должно.
  // `docker compose up --build` на чистом сервере падал именно здесь.
  await connection();
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

  return (
    <>
      <nav aria-label="Хлебные крошки" className="text-muted mb-4 text-sm">
        <Link
          href={`/c/${product.category.slug}`}
          className="inline-flex min-h-11 items-center"
        >
          ← {product.category.name}
        </Link>
      </nav>

      {/*
        Two columns from `md`, one below it.

        At 768 and up a full-bleed 4:5 photograph is 960 pixels tall, so the
        price and the quantity — the two things the page exists for — sat below
        the fold on a desktop while the screen showed nothing but an empty
        bottle. Stacked on a phone, where a photograph at the top and the price
        under it is the right order and the only one that fits.
      */}
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-10">
        <div className="md:sticky md:top-24">
          {gallery.length > 0 ? (
            <Gallery images={gallery} alt={productName(brandName, displayTitle)} />
          ) : (
            // No label: the brand sits twenty pixels below in the same spaced
            // caps, and printing it inside the placeholder too reads as a
            // mistake.
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
          <p className="caps text-muted">
            {brand ? (
              <Link
                href={`/b/${brand.slug}`}
                className="inline-flex min-h-11 items-center"
              >
                {brandName}
              </Link>
            ) : (
              brandName
            )}
          </p>

          <h1 className="font-display text-ink text-h1 mt-1 leading-tight font-semibold">
            {displayTitle}
          </h1>

          <p className="text-muted mt-2 text-sm">
            {product.volumeMl} мл · артикул {product.sku}
            {product.packSize > 1 ? ` · кратно ${product.packSize}` : ""}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Price
              kop={product.priceKop}
              oldKop={product.oldPriceKop}
              showPrices={settings.showPrices}
              className="text-h2"
            />
            <span
              className={`text-sm ${product.stock === "OUT" ? "text-danger" : "text-muted"}`}
            >
              {STOCK_LABEL[product.stock] ?? ""}
            </span>
          </div>

          <div className="mt-6">
            <AddToCart
              disabled={!orderable}
              line={{
                productId: product.id,
                seenPriceKop: settings.showPrices ? product.priceKop : 0,
                seenPackSize: product.packSize,
                seenStock: product.stock,
                slug: product.slug,
                title: displayTitle,
                brandName,
                format: `${product.volumeMl} мл`,
                imageKey: product.images[0]?.key ?? null,
              }}
            />
          </div>

          <div className="mt-4">
            <ShareButton url={shareUrl} title={productName(brandName, displayTitle)} />
          </div>
        </div>
      </div>

      {hasFormats ? (
        <section className="mt-12">
          <RuledHeading>Этот аромат в других форматах</RuledHeading>
          <div className="mt-4 flex flex-col gap-6">
            {formatGroups.map((group) =>
              group.products.length > 0 ? (
                <div key={group.fragranceName}>
                  {product.fragrances.length > 1 ? (
                    <p className="text-muted mb-2 text-sm">{group.fragranceName}</p>
                  ) : null}
                  <ul className="flex flex-col">
                    {group.products.map((other) => (
                      <li
                        key={other.id}
                        className="border-rule border-b last:border-b-0"
                      >
                        <Link
                          href={`/p/${other.slug}`}
                          className="hover:bg-surface flex items-center justify-between gap-4 rounded-md px-2 py-4 transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="text-ink block text-base leading-snug">
                              {other.volumeMl} мл
                            </span>
                            <span className="text-muted mt-0.5 block text-sm">
                              {other.category.name}
                              {other.packSize > 1 ? ` · кратно ${other.packSize}` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <Price
                              kop={other.priceKop}
                              showPrices={settings.showPrices}
                              className="text-sm"
                            />
                            {other.stock === "OUT" ? (
                              <span className="text-danger mt-0.5 block text-xs">
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
          <RuledHeading>Ещё от {brandName}</RuledHeading>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
            {moreFromBrand.map((p) => (
              <li key={p.id}>
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
    </>
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
      <RuledHeading>{named ? fragrance.name : "Об аромате"}</RuledHeading>

      {/* Centred as one composition with the pyramid below it. The tags and the
          description left-aligned against a centred triangle read as two
          sections that happen to be adjacent. */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Tag>{GENDER_LABELS[fragrance.gender] ?? fragrance.gender}</Tag>
        {fragrance.families.map((family) => (
          <Tag key={family}>{FAMILY_LABELS[family] ?? family}</Tag>
        ))}
      </div>

      {fragrance.description ? (
        <p className="text-ink mx-auto mt-5 max-w-md text-center text-base leading-relaxed">
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
          <dd className="text-ink mt-1 max-w-sm text-base leading-snug">
            {tier.notes.join(" · ")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-rule text-muted rounded-full border px-3 py-1 text-sm">
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
      <div className="bg-surface mb-4 h-5 w-32 rounded-md" />
      {/* The same two columns as the page it stands in for. A skeleton that
          lays out differently from what replaces it is not a placeholder, it is
          a guaranteed reflow — and on this page the difference was a 960-pixel
          photograph moving everything below it. */}
      <div className="md:grid md:grid-cols-2 md:items-start md:gap-10">
        <div className="bg-surface border-rule aspect-[4/5] w-full rounded-md border" />
        <div className="mt-6 flex flex-col gap-3 md:mt-0">
          <div className="bg-surface h-4 w-24 rounded-md" />
          <div className="bg-surface h-8 w-3/4 rounded-md" />
          <div className="bg-surface h-4 w-1/2 rounded-md" />
          <div className="bg-surface mt-2 h-8 w-32 rounded-md" />
          <div className="bg-surface mt-4 h-11 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
