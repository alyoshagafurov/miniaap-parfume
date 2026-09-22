import { describe, expect, it } from "vitest";

import { matchHeaders } from "./columns";
import { parseRows } from "./rows";

const HEADERS = [
  "Артикул",
  "Бренд",
  "Аромат",
  "Категория",
  "Объём",
  "Цена",
  "Старая цена",
  "Кратность",
  "Наличие",
  "Второй аромат",
];

function parse(...rows: string[][]) {
  return parseRows([HEADERS, ...rows], matchHeaders(HEADERS));
}

const GOOD = [
  "ARM-1001",
  "Chanel",
  "Coco Mademoiselle",
  "Парфюм 100 мл",
  "100",
  "1 500",
  "",
  "",
  "",
  "",
];

describe("parseRows", () => {
  it("parses a good row into kopecks and integers", () => {
    const r = parse(GOOD);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0]!;
    expect(row.sku).toBe("ARM-1001");
    expect(row.brand).toBe("Chanel");
    expect(row.fragrance).toBe("Coco Mademoiselle");
    expect(row.volumeMl).toBe(100);
    expect(row.priceKop).toBe(150_000);
    expect(row.packSize).toBe(1);
  });

  it("reports the spreadsheet row number, counting the header", () => {
    // Row 1 is the header, so the first data row is 2 — what the person
    // looking at Excel sees.
    const r = parse([
      "",
      "Chanel",
      "X",
      "Парфюм 100 мл",
      "100",
      "1 500",
      "",
      "",
      "",
      "",
    ]);
    expect(r.errors[0]?.row).toBe(2);
  });

  it("keeps going after a bad row instead of failing the file", () => {
    const bad = [
      "ARM-2",
      "Chanel",
      "X",
      "Парфюм 100 мл",
      "100",
      "не число",
      "",
      "",
      "",
      "",
    ];
    const r = parse(GOOD, bad, [
      "ARM-3",
      "Dior",
      "Y",
      "Парфюм 100 мл",
      "35",
      "900",
      "",
      "",
      "",
      "",
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.row).toBe(3);
    expect(r.errors[0]?.field).toBe("priceKop");
  });

  it.each([
    ["missing sku", 0],
    ["missing brand", 1],
    ["missing fragrance", 2],
    ["missing category", 3],
    ["missing volume", 4],
    ["missing price", 5],
  ])("rejects a row with a %s", (_label, index) => {
    const row = [...GOOD];
    row[index] = "";
    expect(parse(row).errors).toHaveLength(1);
  });

  it("accepts Russian price formats", () => {
    for (const price of ["1500", "1 500", "1 500", "1500,50", "1500.50", "1 500 ₽"]) {
      const row = [...GOOD];
      row[5] = price;
      expect(parse(row).errors, price).toEqual([]);
    }
  });

  it("rejects an old price that is not actually higher", () => {
    // Otherwise the storefront shows a struck-through price lower than the
    // real one, which reads as a mistake and is one.
    const row = [...GOOD];
    row[6] = "1000";
    const r = parse(row);
    expect(r.errors[0]?.field).toBe("oldPriceKop");
  });

  it.each([
    ["в наличии", "IN_STOCK"],
    ["да", "IN_STOCK"],
    ["мало", "LOW"],
    ["нет", "OUT"],
    ["под заказ", "PREORDER"],
  ])("reads stock %j as %s", (input, expected) => {
    const row = [...GOOD];
    row[8] = input;
    expect(parse(row).rows[0]?.stock).toBe(expected);
  });

  it("defaults stock to IN_STOCK when the column is blank", () => {
    expect(parse(GOOD).rows[0]?.stock).toBe("IN_STOCK");
  });

  it("rejects an unrecognised stock value rather than guessing", () => {
    const row = [...GOOD];
    row[8] = "может быть";
    expect(parse(row).errors[0]?.field).toBe("stock");
  });

  it("carries a second fragrance for twins", () => {
    const row = [...GOOD];
    row[9] = "Chance Eau Tendre";
    expect(parse(row).rows[0]?.fragrance2).toBe("Chance Eau Tendre");
  });

  it("rejects a pack size below 1", () => {
    const row = [...GOOD];
    row[7] = "0";
    expect(parse(row).errors[0]?.field).toBe("packSize");
  });

  it("flags a duplicate article inside one file", () => {
    // Re-importing the same file must not duplicate, but neither should one
    // file contain the same article twice — the second silently wins otherwise.
    const r = parse(GOOD, GOOD);
    expect(r.errors.some((e) => e.field === "sku" && /дубл/i.test(e.message))).toBe(
      true,
    );
  });

  it("skips entirely blank rows without complaining", () => {
    // Spreadsheets are full of trailing empty rows.
    const r = parse(GOOD, ["", "", "", "", "", "", "", "", "", ""], ["   "]);
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toEqual([]);
  });

  it("trims whitespace around every value", () => {
    const row = GOOD.map((v) => `  ${v}  `);
    expect(parse(row).rows[0]?.sku).toBe("ARM-1001");
  });

  it("caps how many errors it collects, so a wrong file cannot flood the preview", () => {
    const bad = ["", "", "", "", "", "", "", "", "", ""];
    const many = Array.from({ length: 500 }, () => [...bad, "x"]);
    const r = parseRows([HEADERS, ...many], matchHeaders(HEADERS));
    expect(r.errors.length).toBeLessThanOrEqual(200);
    expect(r.truncatedErrors).toBe(true);
  });
});
