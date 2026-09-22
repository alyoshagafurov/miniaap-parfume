import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("passes Latin names through", () => {
    expect(slugify("Chanel")).toBe("chanel");
    expect(slugify("Coco Mademoiselle")).toBe("coco-mademoiselle");
  });

  it("transliterates Cyrillic", () => {
    expect(slugify("Шанель")).toBe("shanel");
    expect(slugify("Парфюм 100 мл")).toBe("parfyum-100-ml");
    expect(slugify("Дезодорант")).toBe("dezodorant");
  });

  it("handles the letters that catch naive transliterators", () => {
    expect(slugify("Ёжик")).toBe("ezhik");
    expect(slugify("Щука")).toBe("shchuka");
    expect(slugify("Подъезд")).toBe("podezd");
    expect(slugify("Йогурт")).toBe("yogurt");
    expect(slugify("Цирк")).toBe("tsirk");
    expect(slugify("Чай")).toBe("chay");
  });

  it("strips Latin diacritics", () => {
    expect(slugify("Chloé")).toBe("chloe");
    expect(slugify("Hermès")).toBe("hermes");
  });

  it("collapses separators and trims them from the ends", () => {
    expect(slugify("  Coco   —   Mademoiselle  ")).toBe("coco-mademoiselle");
    expect(slugify("№5")).toBe("5");
    expect(slugify("Dolce & Gabbana")).toBe("dolce-gabbana");
    expect(slugify("---a---b---")).toBe("a-b");
  });

  it("produces URL-safe output for anything", () => {
    for (const input of ["Ёлка & Щука №5", "L'Eau d'Issey", "ARM/100\\35", "a?b#c"]) {
      expect(slugify(input)).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("returns an empty string when nothing survives, so callers must decide", () => {
    expect(slugify("")).toBe("");
    expect(slugify("!!!")).toBe("");
  });
});
