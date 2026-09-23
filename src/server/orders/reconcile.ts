import type { Quote } from "./quote";

/**
 * Noticing that the catalog moved under the buyer.
 *
 * The storefront is cached for an hour, deliberately — a price sixty minutes
 * old is fine on a listing. A request is not: it is money, and it is priced
 * from the catalog at the moment of submission.
 *
 * So the two can disagree, and the buyer must be the one to decide. This
 * compares what the storefront actually showed against what the server just
 * computed and reports the difference line by line. A request never goes
 * through silently on a total the buyer never saw.
 *
 * The snapshot is never trusted for pricing — only for detecting divergence.
 * Prices come from quoteCart, which reads the catalog.
 */

export interface CartSnapshotLine {
  productId: string;
  qty: number;
  /** Unit price the storefront displayed. 0 when prices are hidden. */
  seenPriceKop: number;
  seenPackSize: number;
  seenStock: string;
}

export type LineChange =
  | { productId: string; title: string; kind: "PRICE"; fromKop: number; toKop: number }
  | { productId: string; title: string; kind: "STOCK"; from: string; to: string }
  | {
      productId: string;
      title: string;
      kind: "PACK_SIZE";
      from: number;
      to: number;
      qtyFrom: number;
      qtyTo: number;
    }
  | { productId: string; title: string; kind: "GONE" };

export interface Reconciliation {
  changed: boolean;
  changes: LineChange[];
  /** Current total, from the catalog. */
  totalKop: number;
  /** What the buyer's basket added up to, for "было → стало" on the total. */
  previousTotalKop: number;
  /**
   * The basket as it now is. The client stores this as its new snapshot, so
   * accepting the change and resubmitting goes straight through instead of
   * asking again forever.
   */
  correctedLines: CartSnapshotLine[];
}

export function reconcileCart(
  snapshot: readonly CartSnapshotLine[],
  quote: Quote,
): Reconciliation {
  const changes: LineChange[] = [];
  const correctedLines: CartSnapshotLine[] = [];

  const priced = new Map(quote.lines.map((l) => [l.productId, l]));

  for (const was of snapshot) {
    const now = priced.get(was.productId);

    // Dropped by quoteCart: out of stock, archived, deleted, or unorderable.
    // One kind covers all of them, because the buyer's options are the same.
    if (!now) {
      changes.push({ productId: was.productId, title: "", kind: "GONE" });
      continue;
    }

    // A price is only news if the buyer was shown one. With showPrices off the
    // storefront says "цена по запросу", so there is nothing to have changed.
    if (quote.showPrices && now.priceKop !== was.seenPriceKop) {
      changes.push({
        productId: was.productId,
        title: now.title,
        kind: "PRICE",
        fromKop: was.seenPriceKop,
        toKop: now.priceKop,
      });
    }

    if (now.stock !== was.seenStock) {
      changes.push({
        productId: was.productId,
        title: now.title,
        kind: "STOCK",
        from: was.seenStock,
        to: now.stock,
      });
    }

    // A pack size that grew forces the quantity up, which changes what the
    // buyer pays. Reported with both numbers, since the quantity is the part
    // they will notice first.
    if (now.packSize !== was.seenPackSize) {
      changes.push({
        productId: was.productId,
        title: now.title,
        kind: "PACK_SIZE",
        from: was.seenPackSize,
        to: now.packSize,
        qtyFrom: was.qty,
        qtyTo: now.qty,
      });
    }

    correctedLines.push({
      productId: now.productId,
      qty: now.qty,
      seenPriceKop: quote.showPrices ? now.priceKop : 0,
      seenPackSize: now.packSize,
      seenStock: now.stock,
    });
  }

  const previousTotalKop = quote.showPrices
    ? snapshot.reduce((sum, l) => sum + l.seenPriceKop * l.qty, 0)
    : 0;

  return {
    changed: changes.length > 0,
    changes,
    totalKop: quote.subtotalKop,
    previousTotalKop,
    correctedLines,
  };
}
