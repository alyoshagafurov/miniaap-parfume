import { describe, expect, it } from "vitest";

import { COLUMNS, matchHeaders, normalizeHeader } from "./columns";

describe("normalizeHeader", () => {
  it.each([
    ["Артикул", "артикул"],
    ["  АРТИКУЛ  ", "артикул"],
    ["Арт.", "арт"],
    ["Цена, ₽", "цена"],
    ["Объём (мл)", "объем мл"],
    ["Объем", "объем"],
    ["SKU", "sku"],
  ])("folds %j to %j", (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });

  it("folds ё to е so «Объём» and «Объем» are one header", () => {
    expect(normalizeHeader("Объём")).toBe(normalizeHeader("Объем"));
  });
});

describe("matchHeaders — recognising a client's spreadsheet", () => {
  it("matches the canonical Russian headers", () => {
    const m = matchHeaders(["Артикул", "Бренд", "Аромат", "Категория", "Объём", "Цена"]);
    expect(m.mapping.sku).toBe(0);
    expect(m.mapping.brand).toBe(1);
    expect(m.mapping.fragrance).toBe(2);
    expect(m.mapping.category).toBe(3);
    expect(m.mapping.volumeMl).toBe(4);
    expect(m.mapping.priceKop).toBe(5);
    expect(m.missingRequired).toEqual([]);
  });

  it.each([
    ["SKU", "sku"],
    ["Код", "sku"],
    ["Арт.", "sku"],
    ["Опт", "priceKop"],
    ["Цена опт", "priceKop"],
    ["Мл", "volumeMl"],
    ["Кратность", "packSize"],
    ["Остаток", "stock"],
    ["Второй аромат", "fragrance2"],
  ])("accepts the synonym %j for %s", (header, field) => {
    const m = matchHeaders([header]);
    expect(m.mapping[field as keyof typeof m.mapping]).toBe(0);
  });

  it("reports unknown columns as a warning, not an error", () => {
    // Point 9: an unfamiliar column must not stop the import. The client's real
    // spreadsheet will have columns we have never seen.
    const m = matchHeaders(["Артикул", "Бренд", "Аромат", "Категория", "Объём", "Цена", "Поставщик", "Мой комментарий"]);
    expect(m.unknown).toEqual([
      { index: 6, header: "Поставщик" },
      { index: 7, header: "Мой комментарий" },
    ]);
    expect(m.missingRequired).toEqual([]);
  });

  it("reports missing required columns", () => {
    const m = matchHeaders(["Бренд", "Цена"]);
    expect(m.missingRequired).toContain("sku");
    expect(m.missingRequired).toContain("category");
  });

  it("takes the first of two columns claiming the same field, and warns", () => {
    const m = matchHeaders(["Артикул", "SKU"]);
    expect(m.mapping.sku).toBe(0);
    expect(m.duplicates).toEqual([{ index: 1, header: "SKU", field: "sku" }]);
  });

  it("ignores blank header cells", () => {
    const m = matchHeaders(["Артикул", "", "   ", "Цена"]);
    expect(m.mapping.sku).toBe(0);
    expect(m.mapping.priceKop).toBe(3);
    expect(m.unknown).toEqual([]);
  });

  it("every field in the dictionary has at least one synonym", () => {
    for (const [field, def] of Object.entries(COLUMNS)) {
      expect(def.synonyms.length, field).toBeGreaterThan(0);
    }
  });

  it("no synonym is claimed by two different fields", () => {
    const seen = new Map<string, string>();
    for (const [field, def] of Object.entries(COLUMNS)) {
      for (const s of def.synonyms) {
        const key = normalizeHeader(s);
        expect(seen.get(key), `«${s}» claimed by ${seen.get(key)} and ${field}`).toBeUndefined();
        seen.set(key, field);
      }
    }
  });
});
