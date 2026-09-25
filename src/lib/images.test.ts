import { describe, expect, it } from "vitest";

import { MEDIA_KEY_PATTERN, parsePhotoFilename } from "./images";

describe("parsePhotoFilename", () => {
  it("reads the article and the position", () => {
    expect(parsePhotoFilename("ARM-1005-2.jpg")).toEqual({
      candidates: ["ARM-1005-2", "ARM-1005"],
      order: 2,
    });
  });

  it("offers the whole stem first, because an article may end in a number", () => {
    // ARM-1005 is itself an article. Splitting the trailing number off blindly
    // would look for ARM and find nothing.
    const parsed = parsePhotoFilename("ARM-1005.jpg");
    expect(parsed.candidates[0]).toBe("ARM-1005");
    expect(parsed.order).toBe(1);
  });

  it("accepts an underscore or a space before the position", () => {
    expect(parsePhotoFilename("ARM-1005_3.jpeg").order).toBe(3);
    expect(parsePhotoFilename("ARM-1005 4.png").candidates).toContain("ARM-1005");
  });

  it("treats a file with no position as the first photograph", () => {
    expect(parsePhotoFilename("coco.webp")).toEqual({ candidates: ["coco"], order: 1 });
  });

  it("survives a name with several dots", () => {
    expect(parsePhotoFilename("ARM-1005-1.final.jpg").candidates).toContain(
      "ARM-1005-1.final",
    );
  });
});

describe("MEDIA_KEY_PATTERN", () => {
  it("accepts the keys the uploader writes", () => {
    expect(MEDIA_KEY_PATTERN.test("products/arm-1040/9f3a1c2b7d4e-800.webp")).toBe(
      true,
    );
    expect(MEDIA_KEY_PATTERN.test("products/arm-1040/9f3a1c2b7d4e-1600.avif")).toBe(
      true,
    );
    expect(MEDIA_KEY_PATTERN.test("banner/9f3a1c2b7d4e-400.webp")).toBe(true);
    // Category covers are flat rather than nested under the category: a
    // category is renamed and re-slugged freely, and a key carrying the slug
    // would go stale. Without this prefix the proxy answers 404 and every
    // cover the panel uploads is invisible.
    expect(MEDIA_KEY_PATTERN.test("categories/9f3a1c2b7d4e-800.webp")).toBe(true);
    expect(MEDIA_KEY_PATTERN.test("categories/9f3a1c2b7d4e-1600.avif")).toBe(true);
  });

  it("refuses a category key that is nested or misshapen", () => {
    // The prefix is a folder, not a free path: `categories/<hex12>-<w>.<fmt>`.
    expect(MEDIA_KEY_PATTERN.test("categories/parfyum/9f3a1c2b7d4e-800.webp")).toBe(
      false,
    );
    expect(MEDIA_KEY_PATTERN.test("categories/../banner/9f3a1c2b7d4e-800.webp")).toBe(
      false,
    );
    expect(MEDIA_KEY_PATTERN.test("categories/9f3a1c2b7d4-800.webp")).toBe(false);
  });

  it("refuses a traversal", () => {
    expect(MEDIA_KEY_PATTERN.test("products/../../.env")).toBe(false);
    expect(MEDIA_KEY_PATTERN.test("products/a/../../secret-800.webp")).toBe(false);
  });

  it("refuses everything else in the bucket", () => {
    // The same bucket holds the Excel exports and, on the VPS deployment, the
    // nightly database dumps. Neither is a photograph, and the proxy is the one
    // thing that reads the bucket without a session.
    expect(MEDIA_KEY_PATTERN.test("backups/arumi-2026-09-24T03-10-00Z.dump.gz")).toBe(
      false,
    );
    expect(MEDIA_KEY_PATTERN.test("deploy-check/probe-1758700000000.txt")).toBe(false);
  });

  it("refuses a width nothing renders", () => {
    expect(MEDIA_KEY_PATTERN.test("banner/9f3a1c2b7d4e-8000.webp")).toBe(false);
  });

  it("refuses a format nothing writes", () => {
    expect(MEDIA_KEY_PATTERN.test("banner/9f3a1c2b7d4e-800.svg")).toBe(false);
    expect(MEDIA_KEY_PATTERN.test("banner/9f3a1c2b7d4e-800.html")).toBe(false);
  });
});
