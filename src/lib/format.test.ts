import { describe, expect, it } from "vitest";

import { formatDateRu, formatDateTimeRu, keepUnits, plural, productName } from "./format";

describe("formatDateRu", () => {
  it("renders a Russian date", () => {
    expect(formatDateRu(new Date("2026-09-23T10:32:00Z"))).toBe("23 сентября 2026");
  });

  it("renders Moscow time, not the reader's", () => {
    // 22:30 UTC is already the next day in Moscow, and that is the day the
    // warehouse means.
    expect(formatDateRu(new Date("2026-09-23T22:30:00Z"))).toBe("24 сентября 2026");
    expect(formatDateTimeRu(new Date("2026-09-23T22:30:00Z"))).toBe(
      "24 сентября 2026, 01:30",
    );
  });

  it("pads the clock", () => {
    expect(formatDateTimeRu(new Date("2026-01-05T02:04:00Z"))).toBe(
      "5 января 2026, 05:04",
    );
  });

  it("covers every month", () => {
    const names = Array.from(
      { length: 12 },
      (_, m) => formatDateRu(new Date(Date.UTC(2026, m, 15, 12))).split(" ")[1],
    );
    expect(names).toEqual([
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ]);
  });
});

describe("productName", () => {
  it("does not repeat a brand the title already carries", () => {
    // How every seeded and imported row actually looks.
    expect(productName("Chanel", "Chanel Coco Mademoiselle")).toBe(
      "Chanel Coco Mademoiselle",
    );
    expect(productName("Yves Saint Laurent", "Yves Saint Laurent Black Opium")).toBe(
      "Yves Saint Laurent Black Opium",
    );
  });

  it("adds the brand when the title lacks it", () => {
    expect(productName("Chanel", "Coco Mademoiselle")).toBe("Chanel Coco Mademoiselle");
  });

  it("ignores case, because an imported row may shout", () => {
    expect(productName("Chanel", "CHANEL Coco Mademoiselle")).toBe(
      "CHANEL Coco Mademoiselle",
    );
  });

  it("does not let a brand swallow a longer word", () => {
    // «Dior» is a prefix of «Diorama» as a string but not as a name.
    expect(productName("Dior", "Diorama")).toBe("Dior Diorama");
  });

  it("treats a title that is only the brand as complete", () => {
    expect(productName("Chanel", "Chanel")).toBe("Chanel");
  });

  it("survives a product with no brand", () => {
    expect(productName("", "Дезодорант 200 мл")).toBe("Дезодорант 200 мл");
  });

  it("accepts punctuation right after the brand", () => {
    expect(productName("Hermès", "Hermès — Terre d'Hermès")).toBe(
      "Hermès — Terre d'Hermès",
    );
  });
});

describe("plural", () => {
  const forms = ["товар", "товара", "товаров"] as const;
  const say = (n: number) => `${n} ${plural(n, forms)}`;

  it("picks the singular for one", () => {
    expect(say(1)).toBe("1 товар");
    expect(say(21)).toBe("21 товар");
    expect(say(101)).toBe("101 товар");
  });

  it("picks the few-form for two to four", () => {
    expect(say(2)).toBe("2 товара");
    expect(say(3)).toBe("3 товара");
    expect(say(4)).toBe("4 товара");
    expect(say(22)).toBe("22 товара");
  });

  it("picks the many-form for five and up", () => {
    expect(say(5)).toBe("5 товаров");
    expect(say(10)).toBe("10 товаров");
    expect(say(400)).toBe("400 товаров");
  });

  it("gives eleven to fourteen the many-form whatever they end in", () => {
    // The trap: 11 ends in 1 and 12 ends in 2, and both take «товаров».
    expect(say(11)).toBe("11 товаров");
    expect(say(12)).toBe("12 товаров");
    expect(say(13)).toBe("13 товаров");
    expect(say(14)).toBe("14 товаров");
    expect(say(111)).toBe("111 товаров");
    expect(say(112)).toBe("112 товаров");
  });

  it("handles zero", () => {
    expect(say(0)).toBe("0 товаров");
  });

  it("ignores a sign and a fraction rather than inventing a form", () => {
    expect(plural(-1, forms)).toBe("товар");
    expect(plural(1.7, forms)).toBe("товар");
  });
});

describe("keepUnits", () => {
  const NBSP = "\u00a0";

  it("binds a volume to its unit", () => {
    expect(keepUnits("Парфюм 35 мл «карандаши»")).toBe(`Парфюм 35${NBSP}мл «карандаши»`);
    expect(keepUnits("Дезодоранты 200 мл")).toBe(`Дезодоранты 200${NBSP}мл`);
  });

  it("binds «2 в 1» as one unit", () => {
    expect(keepUnits("Парфюм 2 в 1 «двойняшки» 100 мл")).toBe(
      `Парфюм 2${NBSP}в${NBSP}1 «двойняшки» 100${NBSP}мл`,
    );
  });

  it("does not catch a unit that is the start of a longer word", () => {
    // Why the boundary is spelled out: `\b` would treat «млн» as «мл» + «н».
    expect(keepUnits("5 млн")).toBe("5 млн");
  });

  it("leaves a name without numbers alone", () => {
    expect(keepUnits("Хиты сезона")).toBe("Хиты сезона");
  });
});
