import { describe, expect, it } from "vitest";

import { highlightParts } from "./highlight";

const marked = (text: string, query: string) =>
  highlightParts(text, query)
    .filter((p) => p.match)
    .map((p) => p.text);

const rebuilt = (text: string, query: string) =>
  highlightParts(text, query)
    .map((p) => p.text)
    .join("");

describe("highlightParts", () => {
  it("marks a whole word from a prefix", () => {
    expect(marked("Coco Mademoiselle", "мад")).toEqual([]);
    expect(marked("Coco Mademoiselle", "mad")).toEqual(["Mademoiselle"]);
  });

  it("marks every word a multi-token query names", () => {
    expect(marked("Coco Mademoiselle", "coco mad")).toEqual(["Coco Mademoiselle"]);
  });

  it("merges adjacent marks so a phrase is one mark", () => {
    const parts = highlightParts("Coco Mademoiselle", "coco mademoiselle");
    expect(parts).toHaveLength(1);
    expect(parts[0]).toEqual({ text: "Coco Mademoiselle", match: true });
  });

  it("folds the display text the same way the search folds the query", () => {
    expect(marked("Hermès", "hermes")).toEqual(["Hermès"]);
    expect(marked("Chloé", "chloe")).toEqual(["Chloé"]);
    expect(marked("Тёмный лес", "темный")).toEqual(["Тёмный"]);
  });

  it("marks nothing when the match cannot be pointed at", () => {
    // A typo corrected by trigram similarity, and a Cyrillic query against a
    // Latin brand: the row is a real hit, but no substring of it is.
    expect(marked("Chanel", "шанель")).toEqual([]);
    expect(marked("Chanel", "шанел")).toEqual([]);
  });

  it("refuses to mark on a single letter", () => {
    expect(marked("Dior Sauvage", "d")).toEqual([]);
    // Unless the word really is that letter.
    expect(marked("Yves Saint Laurent Y", "y")).toEqual(["Y"]);
  });

  it("returns the original text unchanged for an empty query", () => {
    expect(highlightParts("Miss Dior", "")).toEqual([{ text: "Miss Dior", match: false }]);
    expect(highlightParts("Miss Dior", "   ")).toEqual([{ text: "Miss Dior", match: false }]);
  });

  it("reassembles the original exactly, whatever the query", () => {
    const text = "Acqua di Gio — «двойняшка», 100 мл (ARM-1005)";
    for (const q of ["", "acqua", "di gio", "arm 1005", "нет", "«"]) {
      expect(rebuilt(text, q)).toBe(text);
    }
  });

  it("handles an empty display string", () => {
    expect(highlightParts("", "dior")).toEqual([{ text: "", match: false }]);
  });
});
