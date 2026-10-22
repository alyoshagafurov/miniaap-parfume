import { describe, expect, it } from "vitest";

import { afterDiscount, discountFor, nextDiscount } from "./discount";

describe("discountFor", () => {
  it("is nothing up to and including 10 000 ₽ — «более» is literal", () => {
    expect(discountFor(999_999)).toEqual({ percent: 0, discountKop: 0 });
    expect(discountFor(1_000_000)).toEqual({ percent: 0, discountKop: 0 });
  });

  it("is 3% above 10 000 ₽ and up to 30 000 ₽", () => {
    expect(discountFor(1_000_001).percent).toBe(3);
    expect(discountFor(1_500_000)).toEqual({ percent: 3, discountKop: 45_000 });
    expect(discountFor(3_000_000).percent).toBe(3);
  });

  it("is 5% above 30 000 ₽", () => {
    expect(discountFor(3_000_001).percent).toBe(5);
    expect(discountFor(4_000_000)).toEqual({ percent: 5, discountKop: 200_000 });
  });

  it("rounds to a whole kopeck", () => {
    // 3% of 10 000,01 ₽ is 300,0003 ₽ — thirty thousand kopecks and a fraction.
    expect(Number.isInteger(discountFor(1_000_001).discountKop)).toBe(true);
  });

  it("judges the line on the sum before the discount", () => {
    // 10 300 ₽ earns 3%; the 9 991 ₽ left after it must not unearn it.
    expect(afterDiscount(1_030_000)).toBe(1_030_000 - 30_900);
  });
});

describe("nextDiscount", () => {
  it("names the first step and how much more reaches it", () => {
    expect(nextDiscount(900_000)).toEqual({ percent: 3, moreKop: 100_001 });
  });

  it("names the second step once the first is earned", () => {
    expect(nextDiscount(1_500_000)).toEqual({ percent: 5, moreKop: 1_500_001 });
  });

  it("is null at the top", () => {
    expect(nextDiscount(3_000_001)).toBeNull();
  });

  it("at exactly the line, asks for one kopeck more", () => {
    expect(nextDiscount(1_000_000)).toEqual({ percent: 3, moreKop: 1 });
  });
});
