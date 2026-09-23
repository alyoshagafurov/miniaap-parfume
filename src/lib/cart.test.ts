// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import {
  CART_STORAGE_KEY,
  addLine,
  applyCorrections,
  cartCount,
  cartTotalKop,
  readCart,
  removeLine,
  roundToPack,
  setQty,
  toOrderItems,
  writeCart,
  type CartLine,
} from "./cart";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  productId: "p1",
  qty: 1,
  seenPriceKop: 150_000,
  seenPackSize: 1,
  seenStock: "IN_STOCK",
  slug: "chanel-coco",
  title: "Coco Mademoiselle",
  brandName: "Chanel",
  format: "100 мл",
  imageKey: null,
  ...over,
});

describe("roundToPack", () => {
  it.each([
    [1, 1, 1],
    [4, 1, 4],
    [1, 6, 6],
    [7, 6, 12],
    [12, 6, 12],
    [0, 6, 0],
    [-3, 6, 0],
  ])("qty %i with pack %i becomes %i", (qty, pack, expected) => {
    expect(roundToPack(qty, pack)).toBe(expected);
  });

  it("treats a nonsense pack size as 1 rather than dividing by zero", () => {
    expect(roundToPack(3, 0)).toBe(3);
    expect(roundToPack(3, Number.NaN)).toBe(3);
  });

  it("caps at a whole pack below the quantity ceiling", () => {
    expect(roundToPack(1_000_000, 6)).toBeLessThanOrEqual(9999);
    expect(roundToPack(1_000_000, 6) % 6).toBe(0);
  });
});

describe("addLine", () => {
  it("adds a new product", () => {
    expect(addLine([], line({ qty: 2 }))).toHaveLength(1);
  });

  it("merges a product added twice instead of duplicating it", () => {
    // Reached from a listing and again from its own page.
    const once = addLine([], line({ qty: 2 }));
    const twice = addLine(once, line({ qty: 3 }));
    expect(twice).toHaveLength(1);
    expect(twice[0]?.qty).toBe(5);
  });

  it("adds quantities before rounding, not after", () => {
    // 4 + 4 of something sold in sixes is 12, not 6 twice.
    const once = addLine([], line({ qty: 4, seenPackSize: 6 }));
    expect(once[0]?.qty).toBe(6);
    const twice = addLine(once, line({ qty: 4, seenPackSize: 6 }));
    expect(twice[0]?.qty).toBe(12);
  });

  it("takes the newly seen price, which is the fresher observation", () => {
    const once = addLine([], line({ seenPriceKop: 150_000 }));
    const twice = addLine(once, line({ seenPriceKop: 170_000 }));
    expect(twice[0]?.seenPriceKop).toBe(170_000);
  });

  it("keeps different products apart", () => {
    const cart = addLine(addLine([], line()), line({ productId: "p2" }));
    expect(cart).toHaveLength(2);
  });
});

describe("setQty and removeLine", () => {
  it("rounds the new quantity to the pack", () => {
    const cart = setQty([line({ qty: 6, seenPackSize: 6 })], "p1", 7);
    expect(cart[0]?.qty).toBe(12);
  });

  it("removes the line when the quantity reaches zero", () => {
    expect(setQty([line({ qty: 2 })], "p1", 0)).toEqual([]);
  });

  it("removes by id", () => {
    expect(removeLine([line(), line({ productId: "p2" })], "p1")).toHaveLength(1);
  });
});

describe("totals", () => {
  it("counts units, not lines", () => {
    expect(cartCount([line({ qty: 3 }), line({ productId: "p2", qty: 2 })])).toBe(5);
  });

  it("sums in kopecks", () => {
    expect(cartTotalKop([line({ qty: 2, seenPriceKop: 150_000 })])).toBe(300_000);
  });
});

describe("toOrderItems", () => {
  it("sends identity, quantity and what was displayed — and nothing else", () => {
    const [item] = toOrderItems([line({ qty: 6 })]);
    expect(item).toEqual({
      productId: "p1",
      qty: 6,
      seenPriceKop: 150_000,
      seenPackSize: 1,
      seenStock: "IN_STOCK",
    });
    // The title and image are for rendering; the server has its own copy.
    expect(item).not.toHaveProperty("title");
  });
});

describe("storage", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.();
  });

  it("round-trips a basket", () => {
    writeCart([line({ qty: 6 })]);
    expect(readCart()).toHaveLength(1);
    expect(readCart()[0]?.qty).toBe(6);
  });

  it("returns an empty basket when nothing is stored", () => {
    expect(readCart()).toEqual([]);
  });

  it.each([
    ["not json", "{{{"],
    ["an array at the root", "[]"],
    ["a wrong version", JSON.stringify({ v: 99, lines: [] })],
    ["lines that are not an array", JSON.stringify({ v: 1, lines: "nope" })],
  ])("discards %s rather than half-understanding it", (_label, raw) => {
    globalThis.localStorage?.setItem(CART_STORAGE_KEY, raw);
    expect(readCart()).toEqual([]);
  });

  it("drops individual malformed lines but keeps the good ones", () => {
    // A half-understood basket would quietly send wrong quantities.
    globalThis.localStorage?.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ v: 1, lines: [line(), { productId: "x" }, { ...line(), qty: -5 }] }),
    );
    expect(readCart()).toHaveLength(1);
  });

  it("survives storage being unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("The operation is insecure.");
      },
    });
    // A private window must give an empty basket, not a broken page.
    expect(() => readCart()).not.toThrow();
    expect(readCart()).toEqual([]);
    expect(() => writeCart([line()])).not.toThrow();
    if (original) Object.defineProperty(globalThis, "localStorage", original);
  });
});

describe("applyCorrections", () => {
  const base: CartLine = {
    productId: "p1",
    qty: 6,
    seenPriceKop: 100_000,
    seenPackSize: 6,
    seenStock: "IN_STOCK",
    slug: "chanel-coco",
    title: "Coco Mademoiselle",
    brandName: "Chanel",
    format: "100 мл",
    imageKey: "img/1.jpg",
  };

  it("takes the server's numbers and keeps what is on the card", () => {
    const [line] = applyCorrections(
      [base],
      [{ productId: "p1", qty: 12, seenPriceKop: 110_000, seenPackSize: 12, seenStock: "LOW" }],
    );
    expect(line).toEqual({
      ...base,
      qty: 12,
      seenPriceKop: 110_000,
      seenPackSize: 12,
      seenStock: "LOW",
    });
  });

  it("drops a line the server no longer knows about", () => {
    expect(applyCorrections([base], [])).toEqual([]);
  });

  it("keeps the buyer's order", () => {
    const second = { ...base, productId: "p2" };
    const out = applyCorrections(
      [base, second],
      [
        { productId: "p2", qty: 6, seenPriceKop: 1, seenPackSize: 6, seenStock: "IN_STOCK" },
        { productId: "p1", qty: 6, seenPriceKop: 1, seenPackSize: 6, seenStock: "IN_STOCK" },
      ],
    );
    expect(out.map((l) => l.productId)).toEqual(["p1", "p2"]);
  });

  it("refuses a stock value it does not recognise", () => {
    // The corrections arrive over the wire; an unknown state would otherwise be
    // written into the basket and sent back as if the storefront had shown it.
    expect(
      applyCorrections(
        [base],
        [{ productId: "p1", qty: 6, seenPriceKop: 1, seenPackSize: 6, seenStock: "SOLD" }],
      ),
    ).toEqual([]);
  });
});
