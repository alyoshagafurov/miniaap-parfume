import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CANVAS, INK, OLIVE, OLIVE_WASH, SURFACE } from "./tokens";

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
    ["color-olive", OLIVE],
    ["color-ink", INK],
    ["color-olive-wash", OLIVE_WASH],
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
