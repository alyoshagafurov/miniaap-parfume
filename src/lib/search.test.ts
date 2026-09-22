import { describe, expect, it } from "vitest";
import { buildSearchText, normalizeSearch } from "./search";

describe("normalizeSearch", () => {
  it("lower-cases and collapses whitespace", () => {
    expect(normalizeSearch("  Chanel   №5  ")).toBe("chanel 5");
    expect(normalizeSearch("ШАНЕЛЬ")).toBe("шанель");
  });

  it("folds ё to е, because buyers type both", () => {
    expect(normalizeSearch("Ёлка")).toBe("елка");
    expect(normalizeSearch("мёд")).toBe("мед");
    expect(normalizeSearch("ЁЖИК ёжик")).toBe("ежик ежик");
  });

  it("strips Latin diacritics so Chloé is reachable as chloe", () => {
    expect(normalizeSearch("Chloé")).toBe("chloe");
    expect(normalizeSearch("Hermès")).toBe("hermes");
    expect(normalizeSearch("Lancôme")).toBe("lancome");
  });

  it("keeps й intact — it is a letter, not и with an accent", () => {
    // NFD decomposes й into и + U+0306. A blanket combining-mark strip would
    // turn "Майский" into "маискии" and break every match for it.
    expect(normalizeSearch("Майский")).toBe("майский");
    expect(normalizeSearch("Йод")).toBe("йод");
    expect(normalizeSearch("Майский")).toHaveLength(7);
  });

  it("keeps ъ and ь", () => {
    expect(normalizeSearch("подъезд")).toBe("подъезд");
    expect(normalizeSearch("соль")).toBe("соль");
  });

  it("turns punctuation into separators rather than deleting it", () => {
    // "coco-mademoiselle" must not become "cocomademoiselle", or a search for
    // "coco mademoiselle" stops matching it.
    expect(normalizeSearch("Coco-Mademoiselle")).toBe("coco mademoiselle");
    expect(normalizeSearch("Dolce&Gabbana")).toBe("dolce gabbana");
    expect(normalizeSearch("L'Eau")).toBe("l eau");
  });

  it("keeps digits, which is how article numbers are found", () => {
    expect(normalizeSearch("ARM-100-35")).toBe("arm 100 35");
    expect(normalizeSearch("№5")).toBe("5");
  });

  it("is idempotent", () => {
    const once = normalizeSearch("Chloé — Майский Ёж №5");
    expect(normalizeSearch(once)).toBe(once);
  });

  it("handles empty and whitespace-only input", () => {
    expect(normalizeSearch("")).toBe("");
    expect(normalizeSearch("   ")).toBe("");
    expect(normalizeSearch("---")).toBe("");
  });
});

describe("buildSearchText", () => {
  it("folds every searchable field into one normalised haystack", () => {
    const text = buildSearchText({
      brandName: "Chanel",
      brandAliases: ["Шанель", "шанел"],
      fragranceNames: ["Coco Mademoiselle"],
      fragranceAliases: ["Коко Мадемуазель"],
      title: "Chanel Coco Mademoiselle 100 мл",
      sku: "ARM-1001",
    });

    expect(text).toContain("chanel");
    expect(text).toContain("шанель");
    expect(text).toContain("coco mademoiselle");
    expect(text).toContain("коко мадемуазель");
    expect(text).toContain("arm 1001");
  });

  it("includes both fragrances of a twin", () => {
    const text = buildSearchText({
      brandName: "ÁRUMI",
      brandAliases: [],
      fragranceNames: ["Aqua Fresh", "Night Rose"],
      fragranceAliases: [],
      title: "Двойняшка 100 мл",
      sku: "ARM-2001",
    });

    expect(text).toContain("aqua fresh");
    expect(text).toContain("night rose");
  });

  it("de-duplicates repeated tokens so one term cannot dominate similarity", () => {
    const text = buildSearchText({
      brandName: "Chanel",
      brandAliases: ["Chanel", "chanel"],
      fragranceNames: ["Chanel"],
      fragranceAliases: [],
      title: "Chanel Chanel",
      sku: "CHANEL",
    });

    expect(text.split(" ").filter((t) => t === "chanel")).toHaveLength(1);
  });

  it("produces output that is already normalised", () => {
    const text = buildSearchText({
      brandName: "Hermès",
      brandAliases: ["Эрмэ"],
      fragranceNames: ["Terre d'Hermès"],
      fragranceAliases: [],
      title: "Hermès Terre 100 мл",
      sku: "ARM-3001",
    });

    expect(normalizeSearch(text)).toBe(text);
    expect(text).not.toContain("è");
  });
});
