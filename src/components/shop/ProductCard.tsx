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
 */
export function ProductCard({
  product,
  showPrices = true,
  priority = false,
  query,
}: {
  product: ProductCardData;
  showPrices?: boolean;
  priority?: boolean;
  /** The search a buyer typed, so the card can show why it is here. */
  query?: string | undefined;
}) {
  const primary = product.fragrances[0];
  const brandName = primary?.fragrance.brand.name ?? "ÁRUMI";
  const names = product.fragrances.map((f) => f.fragrance.name);
  const stock = STOCK_LABEL[product.stock];

  return (
    <article className="group relative flex flex-col gap-2">
      <ProductImage
        image={product.images[0]}
        title={product.title}
        brandName={brandName}
        priority={priority}
      />

      <p className="caps text-muted">
        <Mark text={brandName} query={query} />
      </p>

      <h3 className="text-ink text-sm leading-snug font-medium">
        <Link href={`/p/${product.slug}`} className="after:absolute after:inset-0">
          <Mark text={names.join(" + ") || product.title} query={query} />
        </Link>
      </h3>

      <p className="text-muted text-xs">
        {product.volumeMl} мл
        {product.packSize > 1 ? ` · кратно ${product.packSize}` : ""}
      </p>

      <Price
        kop={product.priceKop}
        oldKop={product.oldPriceKop}
        showPrices={showPrices}
      />

      {stock ? (
        <p
          className={`text-xs ${product.stock === "OUT" ? "text-danger" : "text-muted"}`}
        >
          {stock}
        </p>
      ) : null}
    </article>
  );
}
