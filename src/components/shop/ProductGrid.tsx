import { ProductCard } from "@/components/shop/ProductCard";
import type { ListedProduct } from "@/server/catalog/list";

/**
 * Two columns at 390, more as there is room.
 *
 * The card component is shared with the home screen's lanes, so a product looks
 * the same wherever it is met.
 */
export function ProductGrid({
  products,
  showPrices,
  query,
}: {
  products: readonly ListedProduct[];
  showPrices: boolean;
  /** Passed through to mark what the buyer typed. Absent outside search. */
  query?: string | undefined;
}) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id} className="flex">
          <ProductCard
            product={{
              id: p.id,
              slug: p.slug,
              sku: p.sku,
              title: p.title,
              priceKop: p.priceKop,
              oldPriceKop: p.oldPriceKop,
              packSize: p.packSize,
              stock: p.stock,
              volumeMl: p.volumeMl,
              isNew: p.isNew,
              isHit: p.isHit,
              images: p.imageKey
                ? [
                    {
                      key: p.imageKey,
                      width: p.imageWidth ?? 800,
                      height: p.imageHeight ?? 1000,
                      blurDataUrl: p.imageBlur ?? "",
                    },
                  ]
                : [],
              fragrances: p.fragranceNames.map((name, position) => ({
                position,
                fragrance: {
                  name,
                  slug: "",
                  brand: { name: p.brandName, slug: p.brandSlug },
                },
              })),
            }}
            showPrices={showPrices}
            query={query}
            // Two columns on a phone, three at `sm`, four at `md` — inside a
            // 768px column, so the widest a card is ever painted is 192px.
            // Without this every card asks for the full-bleed rendition.
            sizes={"(max-width: 639px) 50vw, (max-width: 767px) 33vw, 192px"}
            // The first row is above the fold on every viewport.
            priority={i < 2}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The loading state.
 *
 * Mandatory here, not decorative: a listing driven by searchParams is not
 * prefetched, so without it the buyer taps a category and watches an empty
 * screen. Same grid, same aspect ratio, same gaps — so nothing moves when the
 * real cards replace it.
 */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul
      aria-hidden
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="stage p-2">
          <div className="bg-canvas aspect-[4/5] w-full rounded-md" />
          <div className="px-1.5 pt-3 pb-1.5">
            <div className="bg-primary-wash h-3.5 w-11/12 rounded-md" />
            <div className="bg-primary-wash mt-1.5 h-3.5 w-2/3 rounded-md" />
            <div className="bg-primary-wash mt-4 h-6 w-1/2 rounded-md" />
            <div className="bg-primary-wash mt-3 h-3 w-3/4 rounded-md" />
          </div>
        </li>
      ))}
    </ul>
  );
}
