#!/usr/bin/env node
/**
 * Server Action guard.
 *
 * A Server Action is a public POST endpoint. Next generates an id for every
 * exported async function in a `'use server'` file and will invoke it for
 * anyone who can reach the route — the page it belongs to never has to render,
 * so a permission check that lives only in a layout is a check in the one place
 * that can be skipped. CLAUDE.md says every admin action checks for itself.
 *
 * That held for twenty-two of the twenty-three actions in the panel. The
 * twenty-third checked one layer down, inside the mutation, which is defensible
 * right up until somebody edits the mutation. So it is a guard now.
 *
 * Storefront actions are deliberately public and are listed below by name,
 * because "public" is a decision worth writing down once rather than inferring
 * from the absence of a line.
 *
 *   pnpm check:action-guards
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/**
 * Any of these satisfies the requirement.
 *
 * `requireAdminPage` is deliberately NOT here. It proves only that *some*
 * administrator is signed in, so an admins:write-class action using it would
 * satisfy the script while letting an EDITOR through.
 */
const GUARDS = ["requirePermission", "requireAdmin"];

/**
 * Actions that are public on purpose, each with the reason.
 *
 * `login`, `confirmCode` and `logout` are how permission is obtained. The
 * storefront's three are the shop itself. The two order-history actions take
 * their identity from a signed Telegram launch string instead, which is checked
 * inside them.
 */
const PUBLIC = new Map([
  ["src/app/admin/login/actions.ts", ["login", "confirmCode", "logout"]],
  ["src/app/(shop)/c/[slug]/actions.ts", ["loadMoreProducts"]],
  ["src/app/(shop)/search/actions.ts", ["loadMoreResults"]],
  ["src/app/(shop)/cart/actions.ts", ["submitOrder"]],
  ["src/app/(shop)/orders/actions.ts", ["listMyOrders", "repeatOrder"]],
]);

const EXTENSIONS = [".ts", ".tsx"];

function listSources(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) listSources(full, out);
    else if (EXTENSIONS.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

const violations = [];
let checked = 0;

for (const file of listSources(SRC)) {
  const raw = readFileSync(file, "utf8");
  if (!/^\s*(\/\*[\s\S]*?\*\/\s*)?["']use server["']\s*;?/.test(raw)) continue;

  const code = stripComments(raw);
  const rel = relative(ROOT, file).split("\\").join("/");
  const allowed = new Set(PUBLIC.get(rel) ?? []);

  // Each exported async function, and the text from it to the next one.
  // Both declaration forms. `export const doThing = async (...) => {}` is a
  // perfectly good Server Action and was invisible to the first version of this
  // script — neither checked nor counted.
  const pattern = /export\s+(?:async\s+function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  const found = [...code.matchAll(pattern)];

  for (const [index, match] of found.entries()) {
    const name = match[1];
    checked += 1;
    if (allowed.has(name)) continue;

    const start = match.index ?? 0;
    const end = index + 1 < found.length ? (found[index + 1].index ?? code.length) : code.length;
    const body = code.slice(start, end);

    if (!GUARDS.some((guard) => body.includes(`${guard}(`))) {
      violations.push({ file: rel, name, line: code.slice(0, start).split("\n").length });
    }
  }
}

if (violations.length > 0) {
  console.error("\ncheck:action-guards — Server Action без проверки прав:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.name}()`);
  }
  console.error(
    "\n  Server Action — публичная точка входа: Next зовёт её и без рендера страницы.\n" +
      "  Добавьте requirePermission/requireAdmin в саму функцию, либо внесите её\n" +
      "  в список PUBLIC в scripts/check-action-guards.mjs с объяснением.\n",
  );
  process.exit(1);
}

console.log(`check:action-guards — чисто (проверено ${checked} Server Action)`);
