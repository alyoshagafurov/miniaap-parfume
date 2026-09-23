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
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
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
                fragrance: { name, slug: "", brand: { name: p.brandName, slug: p.brandSlug } },
              })),
            }}
            showPrices={showPrices}
            query={query}
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
      className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4"
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex flex-col gap-2">
          <div className="bg-surface border-rule aspect-[4/5] w-full rounded-md border" />
          <div className="bg-surface h-3 w-2/3 rounded-md" />
          <div className="bg-surface h-4 w-full rounded-md" />
          <div className="bg-surface h-4 w-1/2 rounded-md" />
        </li>
      ))}
    </ul>
  );
}
