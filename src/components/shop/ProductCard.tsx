import Link from "next/link";

import { Mark } from "@/components/ui/Mark";
import { Price } from "@/components/ui/Price";
import { ProductImage } from "@/components/shop/ProductImage";
import type { ProductCard as ProductCardData } from "@/server/catalog/queries";

const STOCK_LABEL: Record<string, string> = {
  LOW: "Мало",
  OUT: "Нет в наличии",
  PREORDER: "Под заказ",
};

/**
 * A product in a list.
 *
 * Brand in spaced caps, then the fragrance, then the format — the order a buyer
 * scans in. The price is the largest thing after the image, because it is what
 * they came to check.
 *
 * A twin shows both of its fragrances; that is the whole point of the format
 * and hiding the second one would make the card a lie.
 *
 * The spacing is deliberately uneven. Brand, name and format are one thought
 * and sit tight together; the price is a second thought and is given air. An
 * even gap between all five lines — which is what this had — reads as a list of
 * fields rather than as a card, and on a screen showing sixteen of them at once
 * that is the difference between a catalog and a spreadsheet.
 */
export function ProductCard({
  product,
  showPrices = true,
  priority = false,
  sizes,
  query,
}: {
  product: ProductCardData;
  showPrices?: boolean;
  priority?: boolean;
  /**
   * What width this card will actually be rendered at. A rail card is 45vw on
   * a phone and a grid card is 50vw; without this every one of them downloads
   * the widest rendition on the assumption that it might be full-bleed.
   */
  sizes?: string;
  /** The search a buyer typed, so the card can show why it is here. */
  query?: string | undefined;
}) {
  const primary = product.fragrances[0];
  const brandName = primary?.fragrance.brand.name ?? "ÁRUMI";
  const names = product.fragrances.map((f) => f.fragrance.name);
  const stock = STOCK_LABEL[product.stock];

  return (
    <article className="group relative flex flex-col">
      <ProductImage
        image={product.images[0]}
        title={product.title}
        brandName={brandName}
        priority={priority}
        {...(sizes ? { sizes } : {})}
      />

      <p className="caps text-muted mt-3">
        <Mark text={brandName} query={query} />
      </p>

      <h3 className="text-ink mt-1 text-base leading-snug font-medium">
        <Link href={`/p/${product.slug}`} className="after:absolute after:inset-0">
          <Mark text={names.join(" + ") || product.title} query={query} />
        </Link>
      </h3>

      <p className="text-muted mt-0.5 text-xs">
        {product.volumeMl} мл
        {product.packSize > 1 ? ` · кратно ${product.packSize}` : ""}
      </p>

      {/*
        The price, a step larger than the name above it.
        
        On a wholesale card the price is not metadata — it is the reason the
        card is being read, and it used to sit at the same size as the volume
        and the pack multiple. The reference the client pointed at makes the
        same call and goes further, setting prices in its accent colour; that
        part is not borrowed, because this palette's gold is 2.14:1 on the
        canvas and a price is the last text in the catalog that may be hard to
        read. Size and weight carry it instead.
      */}
      <Price
        kop={product.priceKop}
        oldKop={product.oldPriceKop}
        showPrices={showPrices}
        className="mt-2 text-lg"
      />

      {stock ? (
        <p
          className={`mt-1 text-xs ${product.stock === "OUT" ? "text-danger" : "text-muted"}`}
        >
          {stock}
        </p>
      ) : null}
    </article>
  );
}
