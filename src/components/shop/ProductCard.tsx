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
 * A product in a list: one object on a white stage.
 *
 * What a wholesaler came to read comes first and large — the name, then the
 * price in amber. Brand, format and pack multiple follow small, underneath. The
 * old card led with the brand in spaced caps and gave every line a similar
 * weight, which on a screen of sixteen cards read as a column of fields rather
 * than as sixteen products.
 *
 * A twin shows both of its fragrances; that is the whole point of the format,
 * and clamping the second one away would make the card a lie. So the name gets
 * three lines, not two.
 *
 * The stage is lifted by a soft shadow, not outlined — the hairline box around
 * every card was the grid this replaces.
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
    <article className="stage group relative flex h-full w-full flex-col p-2">
      <ProductImage
        image={product.images[0]}
        title={product.title}
        brandName={brandName}
        priority={priority}
        {...(sizes ? { sizes } : {})}
      />

      <div className="flex flex-1 flex-col px-1.5 pt-3 pb-1.5">
        {/* Two lines reserved whether used or not: a row's names differ in
            length, and without the reservation each price landed at its own
            height and the row read as ragged. Two, not three — three left a
            one-word name like «H24» floating over a gap wider than itself. A
            twin that needs the third line still gets it. */}
        <h3 className="display-caps text-ink line-clamp-3 min-h-8 text-sm leading-tight">
          <Link
            href={`/p/${product.slug}`}
            className="rounded-sm after:absolute after:inset-0 after:rounded-lg"
          >
            <Mark text={names.join(" + ") || product.title} query={query} />
          </Link>
        </h3>

        <Price
          kop={product.priceKop}
          oldKop={product.oldPriceKop}
          showPrices={showPrices}
          className="mt-2 text-xl"
        />

        {/* The rest, small and last, at the foot of the stage. */}
        <p className="text-muted mt-auto pt-2 text-xs leading-snug">
          <Mark text={brandName} query={query} />
          {` · ${product.volumeMl} мл`}
          {product.packSize > 1 ? ` · кратно ${product.packSize}` : ""}
        </p>

        {stock ? (
          <p
            className={`mt-0.5 text-xs font-semibold ${product.stock === "OUT" ? "text-danger" : "text-muted"}`}
          >
            {stock}
          </p>
        ) : null}
      </div>
    </article>
  );
}
