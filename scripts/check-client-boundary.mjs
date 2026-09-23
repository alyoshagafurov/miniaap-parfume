#!/usr/bin/env node
/**
 * Client boundary guard.
 *
 * A `"use client"` module and everything it imports for a value is compiled
 * into the browser bundle. Reach `src/server/**` from there and the whole
 * server module comes along — its Prisma client, its database URL, its
 * permission guards — and the failure is neither obvious nor honest. Next
 * reports a `next/headers` import from a client graph as a **Pages Router**
 * error, which sends you looking at routing in a project that has no Pages
 * Router at all.
 *
 * This has now happened twice: once reading a sort label out of the catalog
 * listing, and once reading order-status labels out of the admin orders module.
 * Both times the fix was the same — put the shared vocabulary in `src/lib`,
 * which is where client-safe code lives. So it is a guard now rather than a
 * habit.
 *
 * Type-only imports are erased by the compiler and are explicitly allowed: a
 * client component may know the *shape* of what the server returns, it just may
 * not run any of it.
 *
 * A `'use server'` file is a boundary, not a step: Next replaces the import
 * with a call stub, so nothing behind a Server Action reaches the browser. The
 * walk stops there, which is why a form may import the action that submits it.
 *
 *   pnpm check:client-boundary
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

/** Server-only by construction; nothing in a browser bundle may reach them. */
const FORBIDDEN_DIRS = [join(SRC, "server"), join(SRC, "bot")];
const FORBIDDEN_MODULES = [
  /^next\/headers$/,
  /^@prisma\/client$/,
  /^prisma$/,
  /^argon2$/,
];

function resolveImport(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;

  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) {
    const indexed = join(base, `index${ext}`);
    if (existsSync(indexed)) return indexed;
  }
  return null;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/**
 * Value imports only.
 *
 * `import type {...}` is dropped whole. An inline `{ type A, B }` still brings
 * B, so it counts; `{ type A }` alone does not. Anything that is not a named
 * import list — a default import, a namespace, a bare side-effect import — is a
 * value import by definition.
 */
function valueImportsOf(source) {
  const specifiers = [];
  const pattern = /\b(import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const [, , clause, target] = match;
    if (/^type\b/.test(clause.trim())) continue;

    const named = clause.match(/^\{([\s\S]*)\}$/);
    if (named) {
      const parts = named[1]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      // Every name marked `type` means nothing is emitted.
      if (parts.length > 0 && parts.every((p) => /^type\s/.test(p))) continue;
    }
    specifiers.push(target);
  }

  // Side-effect and dynamic imports are always value imports.
  for (const p of [
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    let m;
    while ((m = p.exec(source)) !== null) specifiers.push(m[1]);
  }
  return specifiers;
}

function isServerFile(file) {
  return FORBIDDEN_DIRS.some((dir) => file.startsWith(dir + "/"));
}

function listSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSources(full));
    else if (EXTENSIONS.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

const violations = [];

/** Walks one client graph, reporting anything server-side it can reach. */
function walk(file, entry, chain, visited) {
  if (visited.has(file)) return;
  visited.add(file);

  const code = stripComments(readFileSync(file, "utf8"));
  const here = [...chain, relative(ROOT, file)];

  // The RPC boundary. What this file imports runs on the server and is reached
  // by a request, not by a bundle.
  if (/^\s*["']use server["']\s*;?/.test(code)) return;

  for (const specifier of valueImportsOf(code)) {
    if (FORBIDDEN_MODULES.some((r) => r.test(specifier))) {
      violations.push({
        entry: relative(ROOT, entry),
        what: `импорт "${specifier}"`,
        chain: here.join("\n      → "),
      });
      continue;
    }
    const target = resolveImport(specifier, file);
    if (!target) continue;

    if (isServerFile(target)) {
      violations.push({
        entry: relative(ROOT, entry),
        what: `значение из ${relative(ROOT, target)}`,
        chain: [...here, relative(ROOT, target)].join("\n      → "),
      });
      continue;
    }
    walk(target, entry, here, visited);
  }
}

const sources = listSources(SRC);
let clientCount = 0;

for (const file of sources) {
  const code = readFileSync(file, "utf8");
  // The directive must be the first statement, not a word in a sentence.
  if (!/^\s*(\/\*[\s\S]*?\*\/\s*)?["']use client["']\s*;?/.test(code)) continue;
  clientCount += 1;
  walk(file, file, [], new Set());
}

if (violations.length > 0) {
  console.error("\ncheck:client-boundary — нарушения:\n");
  for (const v of violations) {
    console.error(`  ${v.entry}`);
    console.error(`    ${v.what}`);
    console.error(`    цепочка:\n      → ${v.chain}\n`);
  }
  console.error(
    "  Общий словарь между клиентом и сервером живёт в src/lib.\n" +
      "  Тип можно импортировать через `import type` — он стирается.\n",
  );
  process.exit(1);
}

console.log(
  `check:client-boundary — чисто (${clientCount} клиентских модулей, ни одного импорта из src/server)`,
);
