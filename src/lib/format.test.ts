import { describe, expect, it } from "vitest";

import { formatDateRu, formatDateTimeRu, productName } from "./format";

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
