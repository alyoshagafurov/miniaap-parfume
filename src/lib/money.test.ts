import { describe, expect, it } from "vitest";
import {
  formatRub,
  kopToField,
  kopToRub,
  parsePriceToKop,
  rubToKop,
  sumKop,
  MAX_KOP,
} from "./money";

describe("rubToKop / kopToRub", () => {
  it("converts whole rubles", () => {
    expect(rubToKop(1200)).toBe(120_000);
    expect(kopToRub(120_000)).toBe(1200);
  });

  it("converts fractional rubles without binary drift", () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754. Rounding, not truncation.
    expect(rubToKop(19.99)).toBe(1999);
    expect(rubToKop(0.1 + 0.2)).toBe(30);
  });

  it("rejects non-finite input", () => {
    expect(() => rubToKop(Number.NaN)).toThrow();
    expect(() => rubToKop(Infinity)).toThrow();
  });
});

describe("formatRub", () => {
  it("groups thousands with a non-breaking space and appends the sign", () => {
    // U+00A0 throughout: a price must never wrap between digits and ₽.
    expect(formatRub(1_240_000)).toBe("12 400 ₽");
    expect(formatRub(500_000)).toBe("5 000 ₽");
    expect(formatRub(99_900)).toBe("999 ₽");
  });

  it("drops kopecks when they are zero and shows them when they are not", () => {
    expect(formatRub(120_000)).toBe("1 200 ₽");
    expect(formatRub(120_050)).toBe("1 200,50 ₽");
    expect(formatRub(120_005)).toBe("1 200,05 ₽");
  });

  it("handles zero and millions", () => {
    expect(formatRub(0)).toBe("0 ₽");
    expect(formatRub(123_456_789)).toBe("1 234 567,89 ₽");
  });

  it("does not depend on the host ICU locale data", () => {
    // Grouping is done by hand precisely so the dev machine and the Russian
    // VPS cannot disagree about which space character ICU emits.
    expect(formatRub(1_000_000)).not.toContain(" ");
    expect(formatRub(1_000_000)).not.toContain(",00");
  });
});

describe("parsePriceToKop — import files are typed by humans", () => {
  it.each([
    ["1200", 120_000],
    ["1 200", 120_000],
    ["1 200", 120_000],
    ["1200,50", 120_050],
    ["1200.50", 120_050],
    ["1 200,5", 120_050],
    ["1200 ₽", 120_000],
    ["1200руб", 120_000],
    ["  1200  ", 120_000],
  ])("parses %j as %i kopecks", (input, expected) => {
    expect(parsePriceToKop(input)).toBe(expected);
  });

  it.each(["", "   ", "abc", "-100", "1,2,3", "1.2.3"])("rejects %j", (input) => {
    expect(() => parsePriceToKop(input)).toThrow();
  });

  it("rejects more than two decimal places rather than silently rounding", () => {
    expect(() => parsePriceToKop("1200,555")).toThrow();
  });
});

describe("sumKop", () => {
  it("adds line totals", () => {
    expect(sumKop([100_000, 25_000, 500])).toBe(125_500);
    expect(sumKop([])).toBe(0);
  });

  it("throws rather than overflowing the Int32 column", () => {
    expect(() => sumKop([MAX_KOP, 1])).toThrow(/переполн/i);
  });

  it("rejects non-integer kopecks", () => {
    expect(() => sumKop([100.5])).toThrow();
  });
});

describe("kopToField", () => {
  it("returns nothing for an absent price", () => {
    expect(kopToField(null)).toBe("");
  });

  it("drops the decimals a person would not have typed", () => {
    expect(kopToField(125_000)).toBe("1250");
  });

  it("keeps kopecks, with a comma", () => {
    expect(kopToField(125_050)).toBe("1250,5");
  });

  it("round-trips through the parser the import uses", () => {
    for (const kop of [1, 99, 100, 125_050, 91_000, 2_147_483_647]) {
      expect(parsePriceToKop(kopToField(kop))).toBe(kop);
    }
  });
});
