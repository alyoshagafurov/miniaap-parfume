import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AddToCart } from "@/components/shop/AddToCart";
import { Gallery, type GalleryImage } from "@/components/shop/Gallery";
import { ProductCard } from "@/components/shop/ProductCard";
import { ProductImage } from "@/components/shop/ProductImage";
import { ShareButton } from "@/components/shop/ShareButton";
import { RuledHeading } from "@/components/ui/GoldRule";
import { Price } from "@/components/ui/Price";
import { FAMILY_LABELS, GENDER_LABELS } from "@/lib/list-url";
import {
  getMoreFromBrand,
  getOtherFormats,
  getProductBySlug,
} from "@/server/catalog/queries";
import { getSettings } from "@/server/settings.cached";
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
    brand ? getMoreFromBrand(brand.id, product.id) : Promise.resolve([]),
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
        <Link href={`/c/${product.category.slug}`} className="inline-flex min-h-11 items-center">
          ← {product.category.name}
        </Link>
      </nav>

      {gallery.length > 0 ? (
        <Gallery images={gallery} alt={`${brandName} ${displayTitle}`} />
      ) : (
        // No label: the brand sits twenty pixels below in the same spaced caps,
        // and printing it inside the placeholder too reads as a mistake.
        <ProductImage
          image={undefined}
          title={displayTitle}
          brandName={brandName}
          sizes="(max-width: 767px) 100vw, 640px"
        />
      )}

      <div className="mt-6">
        <p className="caps text-muted">
          {brand ? (
            <Link href={`/b/${brand.slug}`} className="inline-flex min-h-11 items-center">
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
          <ShareButton url={shareUrl} title={`${brandName} ${displayTitle}`} />
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
                      <li key={other.id} className="border-rule border-b last:border-b-0">
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
                              <span className="text-danger mt-0.5 block text-xs">Нет</span>
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
                <ProductCard product={p} showPrices={settings.showPrices} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

type FragranceDetailData = Awaited<
  ReturnType<typeof getProductBySlug>
> extends infer T
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

  if (!hasNotes && !fragrance.description && fragrance.families.length === 0) return null;

  return (
    <section className="mt-12">
      <RuledHeading>{named ? fragrance.name : "Об аромате"}</RuledHeading>

      <div className="mt-4 flex flex-wrap gap-2">
        <Tag>{GENDER_LABELS[fragrance.gender] ?? fragrance.gender}</Tag>
        {fragrance.families.map((family) => (
          <Tag key={family}>{FAMILY_LABELS[family] ?? family}</Tag>
        ))}
      </div>

      {fragrance.description ? (
        <p className="text-ink mt-4 text-base leading-relaxed">{fragrance.description}</p>
      ) : null}

      {hasNotes ? (
        <dl className="mt-6 flex flex-col gap-4">
          <NoteRow label="Верхние ноты" notes={fragrance.notesTop} />
          <NoteRow label="Сердце" notes={fragrance.notesHeart} />
          <NoteRow label="База" notes={fragrance.notesBase} />
        </dl>
      ) : null}
    </section>
  );
}

function NoteRow({ label, notes }: { label: string; notes: readonly string[] }) {
  if (notes.length === 0) return null;
  return (
    <div>
      <dt className="caps text-muted">{label}</dt>
      <dd className="text-ink mt-1 text-base">{notes.join(" · ")}</dd>
    </div>
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
      <div className="bg-surface border-rule aspect-[4/5] w-full rounded-md border" />
      <div className="mt-6 flex flex-col gap-3">
        <div className="bg-surface h-4 w-24 rounded-md" />
        <div className="bg-surface h-8 w-3/4 rounded-md" />
        <div className="bg-surface h-4 w-1/2 rounded-md" />
        <div className="bg-surface mt-2 h-8 w-32 rounded-md" />
        <div className="bg-surface mt-4 h-11 w-full rounded-md" />
      </div>
    </div>
  );
}
