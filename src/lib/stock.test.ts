import { describe, expect, it } from "vitest";

import {
  describeAvailability,
  formatQty,
  LOW_PACKS,
  MAX_STOCK_QTY,
  maxOrderableQty,
  parseStockQty,
  resolveStock,
  stockLevelFor,
  unorderableReason,
} from "./stock";

describe("stockLevelFor", () => {
  it("is out at zero", () => {
    expect(stockLevelFor(0, 1)).toBe("OUT");
    expect(stockLevelFor(0, 12)).toBe("OUT");
  });

  it("is low up to three packs and in stock beyond", () => {
    // Sold singly: three bottles is the edge.
    expect(stockLevelFor(LOW_PACKS, 1)).toBe("LOW");
    expect(stockLevelFor(LOW_PACKS + 1, 1)).toBe("IN_STOCK");
    // Sold in twelves: the same position is thirty-six bottles, not three.
    expect(stockLevelFor(36, 12)).toBe("LOW");
    expect(stockLevelFor(48, 12)).toBe("IN_STOCK");
  });

  it("calls less than one pack low, not out — there is stock, just not an order", () => {
    expect(stockLevelFor(5, 12)).toBe("LOW");
  });
});

describe("resolveStock", () => {
  it("lets the owner's word stand when nothing is counted", () => {
    expect(resolveStock(null, 12, "PREORDER")).toBe("PREORDER");
    expect(resolveStock(null, 12, "LOW")).toBe("LOW");
  });

  it("derives the word from a count and ignores the one asked for", () => {
    expect(resolveStock(400, 1, "OUT")).toBe("IN_STOCK");
    expect(resolveStock(0, 1, "IN_STOCK")).toBe("OUT");
    // A count and «под заказ» cannot coexist: the count wins.
    expect(resolveStock(0, 1, "PREORDER")).toBe("OUT");
  });
});

describe("maxOrderableQty", () => {
  it("is unlimited without a count", () => {
    expect(maxOrderableQty({ stock: "IN_STOCK", stockQty: null, packSize: 12 })).toBe(
      Infinity,
    );
  });

  it("is a whole number of packs", () => {
    expect(maxOrderableQty({ stock: "IN_STOCK", stockQty: 100, packSize: 12 })).toBe(
      96,
    );
    expect(maxOrderableQty({ stock: "IN_STOCK", stockQty: 240, packSize: 1 })).toBe(
      240,
    );
  });

  it("is zero below one pack", () => {
    expect(maxOrderableQty({ stock: "LOW", stockQty: 5, packSize: 12 })).toBe(0);
  });

  it("does not limit a pre-order, which is a promise beyond the shelf", () => {
    expect(maxOrderableQty({ stock: "PREORDER", stockQty: 0, packSize: 1 })).toBe(
      Infinity,
    );
  });
});

describe("parseStockQty", () => {
  it.each([
    ["240", 240],
    ["0", 0],
    [" 1 200 ", 1200],
    ["1 200", 1200],
    ["24 шт", 24],
    ["24 шт.", 24],
    ["24ШТ", 24],
  ])("reads %j as %i", (raw, expected) => {
    expect(parseStockQty(raw)).toBe(expected);
  });

  it("reads empty as «not counted», which is not zero", () => {
    expect(parseStockQty("")).toBeNull();
    expect(parseStockQty("   ")).toBeNull();
  });

  it.each(["12,5", "12.5", "-3", "+3", "много", "1e3", "12 коробок"])(
    "refuses %j instead of guessing",
    (raw) => {
      expect(parseStockQty(raw)).toBeUndefined();
    },
  );

  it("refuses a count above the ceiling", () => {
    expect(parseStockQty(String(MAX_STOCK_QTY))).toBe(MAX_STOCK_QTY);
    expect(parseStockQty(String(MAX_STOCK_QTY + 1))).toBeUndefined();
  });
});

describe("formatQty", () => {
  it("separates thousands with a non-breaking space", () => {
    expect(formatQty(240)).toBe("240");
    expect(formatQty(1200)).toBe("1 200");
    expect(formatQty(1_000_000)).toBe("1 000 000");
  });
});

describe("describeAvailability", () => {
  const p = (stock: string, stockQty: number | null, packSize = 1) => ({
    stock,
    stockQty,
    packSize,
  });

  it("says nothing about an uncounted product in stock on a card, as before", () => {
    expect(describeAvailability(p("IN_STOCK", null), "card").text).toBeNull();
    expect(describeAvailability(p("IN_STOCK", null), "page").text).toBe("В наличии");
  });

  it("keeps the old words for an uncounted product", () => {
    expect(describeAvailability(p("LOW", null), "card").text).toBe("Мало");
    expect(describeAvailability(p("OUT", null), "card")).toEqual({
      text: "Нет в наличии",
      tone: "out",
    });
    expect(describeAvailability(p("PREORDER", null), "page").text).toBe("Под заказ");
  });

  it("states the count, and in packs on the page", () => {
    expect(describeAvailability(p("IN_STOCK", 240), "card").text).toBe(
      "В наличии 240 шт",
    );
    expect(describeAvailability(p("IN_STOCK", 240, 12), "page").text).toBe(
      "В наличии 240 шт · 20 упак. по 12",
    );
  });

  it("says «осталось» and warns once the count runs low", () => {
    expect(describeAvailability(p("LOW", 24, 12), "card")).toEqual({
      text: "Осталось 24 шт",
      tone: "low",
    });
  });

  it("does not claim packs where there is not one", () => {
    expect(describeAvailability(p("LOW", 5, 12), "page").text).toBe("Осталось 5 шт");
  });
});

describe("unorderableReason", () => {
  it("explains a count smaller than a pack", () => {
    expect(unorderableReason({ stock: "LOW", stockQty: 5, packSize: 12 })).toMatch(
      /меньше одной упаковки/,
    );
  });

  it("has nothing to say when it can be ordered, or is simply out", () => {
    expect(
      unorderableReason({ stock: "IN_STOCK", stockQty: 100, packSize: 12 }),
    ).toBeNull();
    expect(unorderableReason({ stock: "OUT", stockQty: 0, packSize: 12 })).toBeNull();
    expect(
      unorderableReason({ stock: "IN_STOCK", stockQty: null, packSize: 12 }),
    ).toBeNull();
  });
});
