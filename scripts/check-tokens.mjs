#!/usr/bin/env node
/**
 * Design-token guard.
 *
 * Resetting Tailwind's namespaces stops a stray shade resolving to the wrong
 * colour, but it does not stop anyone writing one: in Tailwind v4 an undefined
 * utility emits no rule and fails nothing, and arbitrary bracket values compile
 * regardless. This script is therefore the actual enforcement of the design
 * direction's rules, not a secondary check.
 *
 * Every rule below maps to a line in the direction.
 *
 *   pnpm check:tokens
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  "coverage",
  "playwright-report",
  "test-results",
  "qa",
]);
const SCAN_EXT = new Set([".ts", ".tsx", ".css", ".mjs", ".js", ".jsx"]);

/** This file necessarily contains every pattern it bans. */
const SKIP_FILES = new Set([join("scripts", "check-tokens.mjs")]);

/** The one file allowed to define raw values — it is the token source. */
const TOKEN_SOURCE = join("src", "app", "globals.css");

/**
 * Mirrors a handful of those values for JavaScript, where an API takes a colour
 * string and cannot read a CSS variable. Kept honest by src/lib/tokens.test.ts,
 * which parses globals.css and fails on drift.
 */
const TOKEN_MIRROR = join("src", "lib", "tokens.ts");

/**
 * Blanks out comments and preserves line numbers, so a comment that names a
 * banned pattern in order to explain it is not reported as a violation of
 * itself. A line-prefix test is not enough — the continuation lines of a CSS
 * block comment carry no marker of their own.
 *
 * Blanking also hides commented-out code, which is an acceptable trade:
 * nothing commented out is shipped.
 */
function stripComments(source) {
  const SQ = String.fromCharCode(39);
  const DQ = String.fromCharCode(34);
  const BT = String.fromCharCode(96);
  let out = "";
  let i = 0;
  let state = "code";

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    const blank = c === "\n" ? "\n" : " ";

    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        out += "  ";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        out += "  ";
        i += 2;
        continue;
      }
      if (c === SQ) state = "single";
      else if (c === DQ) state = "double";
      else if (c === BT) state = "template";
      out += c;
      i += 1;
      continue;
    }
    if (state === "line") {
      if (c === "\n") state = "code";
      out += blank;
      i += 1;
      continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        out += "  ";
        i += 2;
        continue;
      }
      out += blank;
      i += 1;
      continue;
    }
    // inside a string literal
    if (c === "\\") {
      out += c + (next ?? "");
      i += 2;
      continue;
    }
    if (
      (state === "single" && c === SQ) ||
      (state === "double" && c === DQ) ||
      (state === "template" && c === BT)
    ) {
      state = "code";
    }
    out += c;
    i += 1;
  }
  return out;
}

const RULES = [
  {
    id: "raw-hex",
    why: "Colour literals belong in the token file. Use a token utility or var(--color-…).",
    test: /#[0-9a-fA-F]{3,8}\b/g,
    skipFiles: [TOKEN_SOURCE, TOKEN_MIRROR],
  },
  {
    id: "raw-colour-function",
    why: "Use a token, not a literal colour function.",
    test: /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/g,
    skipFiles: [TOKEN_SOURCE],
  },
  {
    id: "arbitrary-value",
    why: "Arbitrary Tailwind bracket values bypass the token system and still compile. Add a token instead.",
    test: /\b(?:bg|text|border|ring|outline|fill|stroke|rounded|shadow|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|h|gap|leading|tracking|duration|ease)-\[[^\]\s]+\]/g,
  },
  {
    id: "dead-palette-class",
    why: "That colour family was removed from the theme, so the class silently renders nothing.",
    test: /\b(?:bg|text|border|ring|fill|stroke|from|via|to|decoration|outline|shadow|accent|caret|divide)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|mist|taupe|olive)-\d{2,3}\b/g,
  },
  {
    id: "gradient",
    why: "The direction bans gradients and gradient text, including gold foil.",
    test: /\b(?:linear|radial|conic)-gradient\(|\bbg-gradient-|\bbg-linear-|\bbg-radial\b/g,
  },
  {
    id: "glassmorphism",
    why: "The direction bans glassmorphism.",
    test: /\bbackdrop-(?:blur|filter|saturate)\b|backdrop-filter\s*:/g,
  },
  {
    id: "banned-typeface",
    why: "The direction permits exactly two families: Cormorant Garamond (display) and Manrope (UI).",
    test: /\b(?:Inter|Roboto|Open Sans|Lato|Montserrat|Poppins|Nunito)\b/g,
  },
  {
    id: "loose-font-family",
    why: "font-family belongs in the token file; use font-sans or font-display.",
    test: /font-family\s*:/g,
    skipFiles: [TOKEN_SOURCE],
  },
  {
    id: "loose-radius",
    why: "border-radius belongs in the token file; use rounded-md or rounded-full.",
    test: /border-radius\s*:/g,
    skipFiles: [TOKEN_SOURCE],
  },
  {
    id: "slow-motion",
    why: "Stage-1 motion is capped at 250ms ease-out.",
    test: /\bduration-(?:3\d\d|[4-9]\d\d|\d{4,})\b|transition[^;\n]*\b(?:[3-9]\d\d|\d{4,})ms/g,
  },
  {
    id: "transition-all",
    why: "Animate transform and opacity only; transition-all invites layout-triggering properties.",
    test: /\btransition-all\b|transition\s*:\s*all\b/g,
  },
  {
    id: "undefined-text-size",
    why:
      "That size is not in the type scale, so in Tailwind 4 the class emits no rule and the text renders at whatever it inherits. It happened twice: text-h2 on every admin title and the request total, and text-5xl on the placeholder monogram.",
    // Built from globals.css at start-up below; a placeholder until then.
    test: /$^/g,
  },
  {
    id: "emoji",
    why: "The direction bans emoji in the interface.",
    test: /\p{Extended_Pictographic}/gu,
    /**
     * The bot's own copy is the exception, and it is the client's call.
     *
     * This rule used to read "in the interface and in bot messages", because
     * the brief banned both. The client has since written their own greeting
     * and ordering steps with emoji in them and asked for those words exactly.
     * They are the client's words to their own buyers in a messenger, which is
     * a different register from a catalog screen — and they are data: the two
     * texts live in Settings and are edited in the panel, so what sits in the
     * seed is only their initial value.
     *
     * The interface is still covered. Nothing else in prisma/seed.ts should
     * carry an emoji either, and if it ever does, this line is why it was not
     * caught — narrow it rather than widening the habit.
     */
    skipFiles: ["prisma/seed.ts"],
  },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SCAN_EXT.has(entry.slice(entry.lastIndexOf(".")))) out.push(full);
  }
  return out;
}

{
  const css = readFileSync(join(ROOT, TOKEN_SOURCE), "utf8");
  const scale = css.slice(css.indexOf("--text-*: initial"), css.indexOf("--tracking-*: initial"));
  const defined = new Set([...scale.matchAll(/--text-([a-z0-9]+):/g)].map((m) => m[1]));
  const sizes = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl", "h1", "h2", "h3", "h4", "h5", "h6"];
  const missing = sizes.filter((s) => !defined.has(s));
  const rule = RULES.find((r) => r.id === "undefined-text-size");
  if (rule && missing.length > 0) {
    rule.test = new RegExp(`(?<![\\w-])(?:[a-z]+:)*text-(?:${missing.join("|")})(?![\\w-])`, "g");
  }
}

const findings = [];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (SKIP_FILES.has(rel)) continue;
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");

  for (const rule of RULES) {
    if (rule.skipFiles?.some((s) => rel === s || rel === s.split("/").join(sep)))
      continue;
    lines.forEach((line, i) => {
      rule.test.lastIndex = 0;
      const hits = line.match(rule.test);
      if (hits) {
        findings.push({
          rel,
          line: i + 1,
          id: rule.id,
          why: rule.why,
          hit: hits[0],
          text: line.trim().slice(0, 100),
        });
      }
    });
  }
}

if (findings.length === 0) {
  console.log("check:tokens — clean");
  process.exit(0);
}

const byRule = new Map();
for (const f of findings) {
  if (!byRule.has(f.id)) byRule.set(f.id, { why: f.why, items: [] });
  byRule.get(f.id).items.push(f);
}

console.error(`check:tokens — ${findings.length} violation(s)\n`);
for (const [id, { why, items }] of byRule) {
  console.error(`  ${id} (${items.length})`);
  console.error(`    ${why}`);
  for (const f of items.slice(0, 12)) {
    console.error(`      ${f.rel}:${f.line}  ${JSON.stringify(f.hit)}  ${f.text}`);
  }
  if (items.length > 12) console.error(`      … and ${items.length - 12} more`);
  console.error("");
}
process.exit(1);
