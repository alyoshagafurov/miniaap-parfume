import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CANVAS, INK, PRIMARY, PRIMARY_WASH, SURFACE } from "./tokens";

/**
 * tokens.ts duplicates a handful of values from globals.css, because Telegram's
 * colour setters, Next's themeColor and an .xlsx cell fill all take a string
 * rather than a CSS variable. This test is what stops that duplication rotting:
 * change one and the other fails.
 */
const css = readFileSync(
  fileURLToPath(new URL("../app/globals.css", import.meta.url)),
  "utf8",
);

function cssToken(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(css);
  if (!match?.[1]) throw new Error(`--${name} не найден в globals.css`);
  return match[1].toLowerCase();
}

describe("tokens.ts mirrors globals.css", () => {
  it.each([
    ["color-canvas", CANVAS],
    ["color-surface", SURFACE],
    ["color-primary", PRIMARY],
    ["color-ink", INK],
    ["color-primary-wash", PRIMARY_WASH],
  ])("--%s matches", (name, js) => {
    expect(js.toLowerCase()).toBe(cssToken(name));
  });

  it("the H1 clamp is a token, not improvised per page", () => {
    expect(css).toMatch(/--text-h1:\s*clamp\(/);
  });

  /**
   * The blanket reduced-motion block selects `*`, which loses on specificity to
   * any selector with a class or an attribute — even when both are !important.
   * The sheet override is `[data-vaul-drawer]`, so for a while the single piece
   * of motion in this interface was the single piece that ignored the
   * preference. This asserts the counterpart exists and comes after it.
   */
  it("reduced motion reaches the sheet, which the blanket rule cannot", () => {
    const override = css.indexOf("[data-vaul-drawer] {");
    expect(override).toBeGreaterThan(-1);

    const guard = css.indexOf("prefers-reduced-motion", override);
    expect(guard).toBeGreaterThan(override);
    // And it must actually name the sheet; a second blanket `*` block would
    // lose the same way the first one does.
    expect(css.slice(guard, guard + 300)).toContain("data-vaul");
  });

  it("nothing animates longer than the direction allows", () => {
    for (const [, ms] of css.matchAll(
      /(?:transition|animation)-duration:\s*(\d+)ms/g,
    )) {
      expect(Number(ms)).toBeLessThanOrEqual(250);
    }
  });
});

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("every text colour reads on the ground it is used on", () => {
  // The floor is 4.5:1 for all text, not only body copy — PRODUCT.md sets it
  // for a phone read outdoors, and a price is exactly the text that most needs
  // to survive a bright screen.
  it.each([
    ["ink", "canvas"],
    ["ink", "surface"],
    ["muted", "canvas"],
    ["muted", "surface"],
    ["price", "canvas"],
    ["price", "surface"],
    ["on-night", "night"],
    ["on-night-muted", "night"],
    ["price-bright", "night"],
    ["danger", "canvas"],
    ["danger", "surface"],
    ["wordmark", "canvas"],
  ])("%s on %s clears 4.5:1", (fg, bg) => {
    expect(contrast(cssToken(`color-${fg}`), cssToken(`color-${bg}`))).toBeGreaterThanOrEqual(4.5);
  });

  it("a form field's edge clears 3:1 on both grounds (WCAG 1.4.11)", () => {
    for (const bg of ["canvas", "surface"]) {
      expect(contrast(cssToken("color-control"), cssToken(`color-${bg}`))).toBeGreaterThanOrEqual(3);
    }
  });

  it("the reference's own amber is kept off every light ground", () => {
    // Why there are two ambers. #C8955F is the reference's price colour and
    // it is 2.65:1 on white — it vanishes in daylight. It reads at 6.3:1 on
    // the dark blocks, so that is the only place it may appear. If this ever
    // passes, the second amber is no longer needed; until then it is.
    const bright = cssToken("color-price-bright");
    expect(contrast(bright, cssToken("color-surface"))).toBeLessThan(4.5);
    expect(contrast(bright, cssToken("color-night"))).toBeGreaterThanOrEqual(4.5);
  });
});
