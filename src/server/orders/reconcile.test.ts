import { describe, expect, it } from "vitest";

import { reconcileCart, type CartSnapshotLine } from "./reconcile";
import { quoteCart, type CatalogEntry } from "./quote";

/**
 * The storefront is allowed to be stale — its reads are cached for an hour.
 * The request is not. This is the layer that notices the difference and refuses
 * to let a request go through silently on a price the buyer never saw.
 */

const CATALOG: Record<string, CatalogEntry> = {
  p1: {
    id: "p1", sku: "ARM-1001", title: "Chanel Coco Mademoiselle",
    brandName: "Chanel", format: "100 мл", priceKop: 150_000,
    packSize: 1, stock: "IN_STOCK", status: "PUBLISHED", imageKey: null,
  },
  p6: {
    id: "p6", sku: "ARM-1006", title: "Dior Sauvage",
    brandName: "Dior", format: "35 мл", priceKop: 50_000,
    packSize: 6, stock: "IN_STOCK", status: "PUBLISHED", imageKey: null,
  },
};

const SETTINGS = { minOrderKop: 500_000, showPrices: true };

/** What the storefront showed when the buyer put it in the basket. */
const seen = (over: Partial<CartSnapshotLine> = {}): CartSnapshotLine => ({
  productId: "p1",
  qty: 4,
  seenPriceKop: 150_000,
  seenPackSize: 1,
  seenStock: "IN_STOCK",
  ...over,
});

function reconcile(lines: CartSnapshotLine[], catalog = CATALOG) {
  const quote = quoteCart(
    lines.map((l) => ({ productId: l.productId, qty: l.qty })),
    catalog,
    SETTINGS,
  );
  return reconcileCart(lines, quote);
}

describe("reconcileCart — nothing changed", () => {
  it("reports no changes when the catalog still matches what was shown", () => {
    const r = reconcile([seen()]);
    expect(r.changed).toBe(false);
    expect(r.changes).toEqual([]);
  });

  it("carries the current total through so the caller need not recompute", () => {
    const r = reconcile([seen({ qty: 4 })]);
    expect(r.totalKop).toBe(600_000);
  });
});

describe("price moved", () => {
  it("reports было → стало per line", () => {
    const r = reconcile([seen({ seenPriceKop: 120_000 })]);
    expect(r.changed).toBe(true);
    expect(r.changes).toContainEqual({
      productId: "p1",
      title: "Chanel Coco Mademoiselle",
      kind: "PRICE",
      fromKop: 120_000,
      toKop: 150_000,
    });
  });

  it("notices a price that went down too", () => {
    // A buyer who sees a higher figure at confirmation than in the basket has
    // the same right to be told, in either direction.
    const r = reconcile([seen({ seenPriceKop: 200_000 })]);
    expect(r.changes[0]).toMatchObject({ kind: "PRICE", fromKop: 200_000, toKop: 150_000 });
  });

  it("gives the new total alongside the changes", () => {
    const r = reconcile([seen({ qty: 4, seenPriceKop: 120_000 })]);
    expect(r.totalKop).toBe(600_000);
    expect(r.previousTotalKop).toBe(480_000);
  });
});

describe("availability moved", () => {
  it("reports a product that sold out", () => {
    const catalog = { ...CATALOG, p1: { ...CATALOG.p1!, stock: "OUT" } };
    const r = reconcile([seen()], catalog);
    expect(r.changed).toBe(true);
    expect(r.changes[0]).toMatchObject({ productId: "p1", kind: "GONE" });
  });

  it("reports a product that was archived", () => {
    const catalog = { ...CATALOG, p1: { ...CATALOG.p1!, status: "ARCHIVED" } };
    expect(reconcile([seen()], catalog).changes[0]).toMatchObject({ kind: "GONE" });
  });

  it("reports a product that was deleted outright", () => {
    const r = reconcile([seen({ productId: "vanished" })], CATALOG);
    expect(r.changes[0]).toMatchObject({ productId: "vanished", kind: "GONE" });
  });

  it("reports a stock level that merely worsened, without dropping the line", () => {
    const catalog = { ...CATALOG, p1: { ...CATALOG.p1!, stock: "LOW" } };
    const r = reconcile([seen()], catalog);
    expect(r.changes[0]).toMatchObject({ kind: "STOCK", from: "IN_STOCK", to: "LOW" });
    // Still orderable — the buyer just gets told.
    expect(r.totalKop).toBe(600_000);
  });
});

describe("pack size moved", () => {
  it("reports the rounding it forced on the quantity", () => {
    // Bought 4 when singles were allowed; the pack is now 6, so the server
    // rounds up — the buyer must see that before it becomes their order.
    const catalog = { ...CATALOG, p1: { ...CATALOG.p1!, packSize: 6 } };
    const r = reconcile([seen({ qty: 4, seenPackSize: 1 })], catalog);
    expect(r.changes).toContainEqual({
      productId: "p1",
      title: "Chanel Coco Mademoiselle",
      kind: "PACK_SIZE",
      from: 1,
      to: 6,
      qtyFrom: 4,
      qtyTo: 6,
    });
  });

  it("does not report a pack size that only rounded within what was already shown", () => {
    // packSize 6 both before and after: the rounding is not news.
    const r = reconcile([seen({ productId: "p6", qty: 6, seenPriceKop: 50_000, seenPackSize: 6 })]);
    expect(r.changed).toBe(false);
  });
});

describe("the corrected basket", () => {
  it("hands back lines the client can store as the new snapshot", () => {
    const catalog = { ...CATALOG, p1: { ...CATALOG.p1!, priceKop: 170_000, packSize: 6 } };
    const r = reconcile([seen({ qty: 4 })], catalog);
    expect(r.correctedLines).toEqual([
      { productId: "p1", qty: 6, seenPriceKop: 170_000, seenPackSize: 6, seenStock: "IN_STOCK" },
    ]);
  });

  it("drops vanished products from the corrected basket", () => {
    const catalog = { ...CATALOG, p1: { ...CATALOG.p1!, stock: "OUT" } };
    const r = reconcile([seen(), seen({ productId: "p6", qty: 6, seenPriceKop: 50_000, seenPackSize: 6 })], catalog);
    expect(r.correctedLines.map((l) => l.productId)).toEqual(["p6"]);
  });

  it("reconciling the corrected basket a second time reports nothing", () => {
    // The loop has to terminate: after the buyer accepts, a resubmit must go
    // straight through rather than asking again forever.
    const catalog = { ...CATALOG, p1: { ...CATALOG.p1!, priceKop: 170_000 } };
    const first = reconcile([seen({ qty: 4 })], catalog);
    expect(first.changed).toBe(true);
    const second = reconcile(first.correctedLines, catalog);
    expect(second.changed).toBe(false);
  });
});

describe("several lines at once", () => {
  it("reports every changed line, not just the first", () => {
    const catalog = {
      ...CATALOG,
      p1: { ...CATALOG.p1!, priceKop: 160_000 },
      p6: { ...CATALOG.p6!, stock: "OUT" },
    };
    const r = reconcile(
      [seen({ qty: 4 }), seen({ productId: "p6", qty: 6, seenPriceKop: 50_000, seenPackSize: 6 })],
      catalog,
    );
    expect(r.changes.map((c) => c.kind).sort()).toEqual(["GONE", "PRICE"]);
  });

  it("leaves untouched lines out of the report", () => {
    const catalog = { ...CATALOG, p6: { ...CATALOG.p6!, priceKop: 60_000 } };
    const r = reconcile(
      [seen({ qty: 4 }), seen({ productId: "p6", qty: 6, seenPriceKop: 50_000, seenPackSize: 6 })],
      catalog,
    );
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]?.productId).toBe("p6");
  });
});

describe("prices hidden", () => {
  it("does not report price movement the buyer was never shown", () => {
    // With showPrices off the storefront says "цена по запросу", so a price
    // change is not a change the buyer can have seen.
    const quote = quoteCart([{ productId: "p1", qty: 4 }], CATALOG, {
      minOrderKop: 500_000,
      showPrices: false,
    });
    const r = reconcileCart([seen({ seenPriceKop: 0 })], quote);
    expect(r.changes.some((c) => c.kind === "PRICE")).toBe(false);
  });
});
