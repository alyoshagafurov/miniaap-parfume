#!/usr/bin/env node
/**
 * Bot boundary guard.
 *
 * The bot is a separate process with no Next request context. A `'use cache'`
 * function there throws the moment it runs, and anything pulled in from
 * `next/*` is at best dead weight and at worst a crash. That already happened
 * once: getSettings carried the directive and would have taken down /start,
 * /catalog, /contacts, /admin and the terms button alike.
 *
 * This walks the actual import graph from the bot's entry point rather than
 * checking a hand-maintained list of directories. A list has to be extended
 * every time the bot reaches one module deeper — and the one time someone
 * forgets is the time it breaks. The graph finds the transitive set by itself.
 *
 *   pnpm check:bot-boundary
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ENTRY = join(SRC, "bot", "index.ts");

/** Anything matching these is forbidden inside the bot's reachable graph. */
const FORBIDDEN_MODULES = [/^next$/, /^next\//, /^react-dom\/server$/];

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

/** Resolves an import specifier to a file under src/, or null if it is external. */
function resolveImport(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) {
    base = join(SRC, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    // A bare specifier: a package, not our source.
    return null;
  }

  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexed = join(base, `index${ext}`);
    if (existsSync(indexed)) return indexed;
  }
  return null;
}

/**
 * Pulls import specifiers out of a module.
 *
 * Deliberately regex-based rather than a full parse: the goal is to be
 * conservative and catch everything that looks like an import, dynamic ones
 * included. A false positive here is a five-second conversation; a false
 * negative is a production crash.
 */
function importsOf(source) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+[^"';]*?from\s*["']([^"']+)["']/g, // import x from "y"
    /\bimport\s*["']([^"']+)["']/g, // import "y"
    /\bexport\s+[^"';]*?from\s*["']([^"']+)["']/g, // export * from "y"
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, // await import("y")
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, // require("y")
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

/** Blanks comments so a directive or import named in prose is not a violation. */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

const violations = [];
const visited = new Set();
/** How each file came to be part of the graph, for a useful error message. */
const via = new Map();

function chainFor(file) {
  const chain = [];
  let current = file;
  while (current && chain.length < 12) {
    chain.unshift(relative(ROOT, current));
    current = via.get(current);
  }
  return chain.join("\n      → ");
}

function walk(file) {
  if (visited.has(file)) return;
  visited.add(file);

  const code = stripComments(readFileSync(file, "utf8"));
  const rel = relative(ROOT, file);

  // The directive must be an actual statement, not a word inside a string.
  if (/^\s*["']use cache["']\s*;?\s*$/m.test(code)) {
    violations.push({
      file: rel,
      what: "директива 'use cache'",
      why: "в процессе бота нет контекста запроса Next — бросит при первом вызове",
      chain: chainFor(file),
    });
  }

  for (const specifier of importsOf(code)) {
    if (FORBIDDEN_MODULES.some((r) => r.test(specifier))) {
      violations.push({
        file: rel,
        what: `импорт "${specifier}"`,
        why: "модуль Next недоступен в процессе бота",
        chain: chainFor(file),
      });
      continue;
    }
    const target = resolveImport(specifier, file);
    if (target) {
      if (!via.has(target)) via.set(target, file);
      walk(target);
    }
  }
}

if (!existsSync(ENTRY)) {
  console.error(`check:bot-boundary — точка входа не найдена: ${relative(ROOT, ENTRY)}`);
  process.exit(1);
}

walk(ENTRY);

if (violations.length === 0) {
  console.log(
    `check:bot-boundary — чисто (${visited.size} модулей в графе бота, ни одного импорта Next)`,
  );
  process.exit(0);
}

console.error(`check:bot-boundary — ${violations.length} нарушени(й) границы процесса бота\n`);
for (const v of violations) {
  console.error(`  ${v.file}`);
  console.error(`    ${v.what} — ${v.why}`);
  console.error(`    путь из точки входа:\n      → ${v.chain}\n`);
}
console.error(
  "  Бот — отдельный процесс без Next. Вынесите кэширующую обёртку в отдельный\n" +
    "  файл (как settings.ts / settings.cached.ts) и импортируйте её только из\n" +
    "  React-компонентов.",
);
process.exit(1);
