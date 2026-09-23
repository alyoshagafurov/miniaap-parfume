import { describe, expect, it } from "vitest";

import {
  buildListHref,
  NO_FILTERS,
  filterCount,
  parseListFilters,
  parseSort,
  type ActiveFilters,
} from "./list-url";

/**
 * The URL is the listing's state, and it arrives from outside: a stale
 * bookmark, a truncated share, a hand-edited address. So the tests that matter
 * here are the round trip — what is written must read back identically — and
 * what happens to input nobody should have sent.
 */

describe("parseListFilters", () => {
  it("reads a full set", () => {
    expect(
      parseListFilters({
        brand: "dior,chanel",
        gender: "FEMALE",
        family: "FLORAL,WOODY",
        stock: "1",
      }),
    ).toEqual({
      brands: ["dior", "chanel"],
      gender: "FEMALE",
      families: ["FLORAL", "WOODY"],
      inStockOnly: true,
    });
  });

  it("is empty when nothing is in the URL", () => {
    expect(parseListFilters({})).toEqual(NO_FILTERS);
  });

  it("drops unknown values and keeps the known ones beside them", () => {
    const f = parseListFilters({ family: "NOPE,FLORAL,ЦВЕТОЧНЫЕ", gender: "XX" });
    expect(f.families).toEqual(["FLORAL"]);
    expect(f.gender).toBeNull();
  });

  it("rejects a brand that is not a slug", () => {
    // Parameterised SQL makes this harmless, but a value that cannot be one of
    // ours has no business reaching the query.
    const f = parseListFilters({ brand: "../etc/passwd,dior,<script>,ДИОР" });
    expect(f.brands).toEqual(["dior"]);
  });

  it("treats stock as a flag, not a boolean-ish string", () => {
    expect(parseListFilters({ stock: "1" }).inStockOnly).toBe(true);
    expect(parseListFilters({ stock: "true" }).inStockOnly).toBe(false);
    expect(parseListFilters({ stock: "0" }).inStockOnly).toBe(false);
  });

  it("takes the first when a key is repeated", () => {
    // ?gender=MALE&gender=FEMALE arrives as an array.
    expect(parseListFilters({ gender: ["MALE", "FEMALE"] }).gender).toBe("MALE");
  });

  it("caps a list long enough to be an attack rather than a buyer", () => {
    const many = Array.from({ length: 500 }, (_, i) => `brand-${i}`).join(",");
    expect(parseListFilters({ brand: many }).brands).toHaveLength(32);
  });

  it("ignores empty segments", () => {
    expect(parseListFilters({ brand: "dior,,chanel," }).brands).toEqual([
      "dior",
      "chanel",
    ]);
  });
});

describe("parseSort", () => {
  it("reads a known key", () => {
    expect(parseSort({ sort: "price_desc" })).toBe("price_desc");
  });

  it("falls back to popular for anything else", () => {
    expect(parseSort({})).toBe("popular");
    expect(parseSort({ sort: "cheapest" })).toBe("popular");
    expect(parseSort({ sort: "; DROP TABLE products" })).toBe("popular");
  });
});

describe("buildListHref", () => {
  it("leaves a plain listing plain", () => {
    expect(buildListHref("/c/parfyum-100-ml", NO_FILTERS, "popular")).toBe(
      "/c/parfyum-100-ml",
    );
  });

  it("omits the default sort but writes any other", () => {
    expect(buildListHref("/c/x", NO_FILTERS, "alpha")).toBe("/c/x?sort=alpha");
  });

  it("carries the listing's own params through", () => {
    const href = buildListHref("/search", NO_FILTERS, "popular", { q: "диор" });
    expect(href).toBe("/search?q=%D0%B4%D0%B8%D0%BE%D1%80");
  });

  it("drops an extra with no value", () => {
    expect(buildListHref("/search", NO_FILTERS, "popular", { q: undefined })).toBe(
      "/search",
    );
  });
});

describe("round trip", () => {
  const cases: ActiveFilters[] = [
    NO_FILTERS,
    { brands: ["dior"], gender: null, families: [], inStockOnly: false },
    { brands: [], gender: "UNISEX", families: ["MUSK"], inStockOnly: true },
    {
      brands: ["yves-saint-laurent", "paco-rabanne"],
      gender: "MALE",
      families: ["WOODY", "SPICY", "LEATHER"],
      inStockOnly: true,
    },
  ];

  it.each(cases)("survives being written and read back", (filters) => {
    const href = buildListHref("/c/x", filters, "price_asc");
    const query = Object.fromEntries(new URLSearchParams(href.split("?")[1] ?? ""));
    expect(parseListFilters(query)).toEqual(filters);
    expect(parseSort(query)).toBe("price_asc");
  });
});

describe("filterCount", () => {
  it("counts every kind once", () => {
    expect(filterCount(NO_FILTERS)).toBe(0);
    expect(
      filterCount({
        brands: ["a", "b"],
        gender: "MALE",
        families: ["WOODY"],
        inStockOnly: true,
      }),
    ).toBe(5);
  });
});
