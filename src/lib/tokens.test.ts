import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CANVAS, INK, OLIVE, SURFACE } from "./tokens";

/**
 * tokens.ts duplicates four values from globals.css, because Telegram's colour
 * setters and Next's themeColor take strings rather than CSS variables. This
 * test is what stops that duplication rotting: change one and the other fails.
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
  ])("--%s matches", (name, js) => {
    expect(js.toLowerCase()).toBe(cssToken(name));
  });

  it("the H1 clamp is a token, not improvised per page", () => {
    expect(css).toMatch(/--text-h1:\s*clamp\(/);
  });
});
