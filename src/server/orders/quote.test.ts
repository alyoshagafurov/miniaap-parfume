import { describe, expect, it } from "vitest";

import { quoteCart, type CatalogEntry, type CartLine } from "./quote";

const CATALOG: Record<string, CatalogEntry> = {
  p1: {
    id: "p1",
    sku: "ARM-1001",
    title: "Chanel Coco Mademoiselle",
    brandName: "Chanel",
    format: "100 мл",
    priceKop: 150_000,
    packSize: 1,
    stock: "IN_STOCK",
    stockQty: null,
    status: "PUBLISHED",
    imageKey: null,
  },
  p6: {
    id: "p6",
    sku: "ARM-1006",
    title: "Dior Sauvage",
    brandName: "Dior",
    format: "35 мл",
    priceKop: 50_000,
    packSize: 6,
    stock: "IN_STOCK",
    stockQty: null,
    status: "PUBLISHED",
    imageKey: null,
  },
  pOut: {
    id: "pOut",
    sku: "ARM-1099",
    title: "Versace Eros",
    brandName: "Versace",
    format: "100 мл",
    priceKop: 120_000,
    packSize: 1,
    stock: "OUT",
    stockQty: null,
    status: "PUBLISHED",
    imageKey: null,
  },
  pDraft: {
    id: "pDraft",
    sku: "ARM-1100",
    title: "Черновик",
    brandName: "Dior",
    format: "100 мл",
    priceKop: 99_000,
    packSize: 1,
    stock: "IN_STOCK",
    stockQty: null,
    status: "DRAFT",
    imageKey: null,
  },
};

const SETTINGS = { minOrderKop: 500_000, showPrices: true };
const line = (productId: string, qty: number): CartLine => ({ productId, qty });

describe("quoteCart — the server is the authority on money", () => {
  it("prices from the catalog, never from the client", () => {
    const q = quoteCart([line("p1", 2)], CATALOG, SETTINGS);
    expect(q.lines[0]?.priceKop).toBe(150_000);
    expect(q.lines[0]?.lineTotalKop).toBe(300_000);
    expect(q.subtotalKop).toBe(300_000);
  });

  it("sums several lines", () => {
    const q = quoteCart([line("p1", 2), line("p6", 6)], CATALOG, SETTINGS);
    expect(q.subtotalKop).toBe(300_000 + 300_000);
  });

  it("ignores a product id that is not in the catalog", () => {
    const q = quoteCart([line("nope", 5), line("p1", 1)], CATALOG, SETTINGS);
    expect(q.lines).toHaveLength(1);
    expect(q.removed).toContainEqual({ productId: "nope", reason: "NOT_FOUND" });
  });
});

describe("pack multiples", () => {
  it("rounds up to the next whole pack and says so", () => {
    const q = quoteCart([line("p6", 7)], CATALOG, SETTINGS);
    expect(q.lines[0]?.qty).toBe(12);
    expect(q.adjusted).toContainEqual({
      productId: "p6",
      from: 7,
      to: 12,
      reason: "PACK_SIZE",
    });
    expect(q.subtotalKop).toBe(600_000);
  });

  it("leaves an exact multiple alone", () => {
    const q = quoteCart([line("p6", 12)], CATALOG, SETTINGS);
    expect(q.lines[0]?.qty).toBe(12);
    expect(q.adjusted).toHaveLength(0);
  });

  it("raises a sub-pack quantity to one full pack", () => {
    const q = quoteCart([line("p6", 1)], CATALOG, SETTINGS);
    expect(q.lines[0]?.qty).toBe(6);
  });

  it("does not touch a packSize of 1", () => {
    const q = quoteCart([line("p1", 3)], CATALOG, SETTINGS);
    expect(q.lines[0]?.qty).toBe(3);
    expect(q.adjusted).toHaveLength(0);
  });
});

describe("availability", () => {
  it("drops an out-of-stock product and reports it", () => {
    const q = quoteCart([line("p1", 1), line("pOut", 3)], CATALOG, SETTINGS);
    expect(q.lines).toHaveLength(1);
    expect(q.removed).toContainEqual({ productId: "pOut", reason: "OUT_OF_STOCK" });
  });

  it("drops anything not published, so a draft can never be ordered", () => {
    const q = quoteCart([line("pDraft", 1)], CATALOG, SETTINGS);
    expect(q.lines).toHaveLength(0);
    expect(q.removed).toContainEqual({ productId: "pDraft", reason: "UNAVAILABLE" });
  });
});

describe("a counted shelf", () => {
  // Sold in sixes, a hundred on the shelf: sixteen packs, ninety-six bottles.
  const counted = (over: Partial<CatalogEntry> = {}): Record<string, CatalogEntry> => ({
    p6: { ...CATALOG.p6!, stock: "IN_STOCK", stockQty: 100, ...over },
  });

  it("lowers a quantity above what is on the shelf, to whole packs, and says so", () => {
    const q = quoteCart([line("p6", 120)], counted(), SETTINGS);
    expect(q.lines[0]?.qty).toBe(96);
    expect(q.adjusted).toContainEqual({
      productId: "p6",
      from: 120,
      to: 96,
      reason: "STOCK_LIMIT",
    });
    // Priced at what is actually sent.
    expect(q.subtotalKop).toBe(96 * 50_000);
  });

  it("leaves a quantity that fits exactly as it is", () => {
    const q = quoteCart([line("p6", 96)], counted(), SETTINGS);
    expect(q.lines[0]?.qty).toBe(96);
    expect(q.adjusted).toEqual([]);
  });

  it("lowers two lines for the same product together, not one at a time", () => {
    // Each fits alone; together they are 120.
    const q = quoteCart([line("p6", 60), line("p6", 60)], counted(), SETTINGS);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]?.qty).toBe(96);
  });

  it("refuses a product with less than one pack on the shelf, as if it were out", () => {
    const q = quoteCart(
      [line("p6", 6)],
      counted({ stock: "LOW", stockQty: 5 }),
      SETTINGS,
    );
    expect(q.lines).toEqual([]);
    expect(q.removed).toEqual([{ productId: "p6", reason: "OUT_OF_STOCK" }]);
  });

  it("does not limit a pre-order, which is a promise beyond the shelf", () => {
    const q = quoteCart(
      [line("p6", 600)],
      counted({ stock: "PREORDER", stockQty: 0 }),
      SETTINGS,
    );
    expect(q.lines[0]?.qty).toBe(600);
  });

  it("does not limit a product nobody counts", () => {
    const q = quoteCart([line("p6", 600)], counted({ stockQty: null }), SETTINGS);
    expect(q.lines[0]?.qty).toBe(600);
  });
});

describe("quantity validation", () => {
  it.each([0, -1, -100])("rejects a quantity of %i", (qty) => {
    const q = quoteCart([line("p1", qty)], CATALOG, SETTINGS);
    expect(q.lines).toHaveLength(0);
    expect(q.removed).toContainEqual({ productId: "p1", reason: "BAD_QUANTITY" });
  });

  it.each([1.5, Number.NaN, Infinity])("rejects a non-integer quantity %s", (qty) => {
    const q = quoteCart([line("p1", qty)], CATALOG, SETTINGS);
    expect(q.lines).toHaveLength(0);
  });

  it("caps an absurd quantity rather than overflowing the total", () => {
    const q = quoteCart([line("p1", 1_000_000)], CATALOG, SETTINGS);
    expect(q.lines[0]?.qty).toBeLessThanOrEqual(9999);
    expect(q.adjusted.some((a) => a.reason === "MAX_QUANTITY")).toBe(true);
  });

  it("merges duplicate lines for the same product", () => {
    const q = quoteCart([line("p1", 2), line("p1", 3)], CATALOG, SETTINGS);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]?.qty).toBe(5);
  });
});

describe("minimum order", () => {
  it("reports the shortfall when below the minimum", () => {
    const q = quoteCart([line("p1", 2)], CATALOG, SETTINGS); // 3 000 ₽
    expect(q.meetsMinimum).toBe(false);
    expect(q.shortfallKop).toBe(200_000); // 2 000 ₽ to go
  });

  it("is met exactly at the minimum", () => {
    const q = quoteCart([line("p1", 1), line("p6", 12)], CATALOG, SETTINGS);
    expect(q.subtotalKop).toBe(750_000);
    expect(q.meetsMinimum).toBe(true);
    expect(q.shortfallKop).toBe(0);
  });

  it("an empty cart does not meet the minimum and has no negative shortfall", () => {
    const q = quoteCart([], CATALOG, SETTINGS);
    expect(q.subtotalKop).toBe(0);
    expect(q.meetsMinimum).toBe(false);
    expect(q.shortfallKop).toBe(500_000);
  });
});

describe("prices hidden", () => {
  it("still prices the lines server-side but suppresses the totals", () => {
    const q = quoteCart([line("p1", 2)], CATALOG, {
      minOrderKop: 500_000,
      showPrices: false,
    });
    expect(q.showPrices).toBe(false);
    expect(q.subtotalKop).toBe(0);
    // With no prices shown there is no minimum to fail, or the buyer could
    // never submit anything.
    expect(q.meetsMinimum).toBe(true);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]?.qty).toBe(2);
  });
});
