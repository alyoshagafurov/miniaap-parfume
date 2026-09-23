#!/usr/bin/env node
/**
 * Catalog write guard.
 *
 * The storefront caches its reads for an hour and is invalidated by tag. A
 * write that does not say what it dirtied leaves a stale price, a hidden
 * product or a renamed category on the shelf for up to an hour, and there is
 * nothing in any log to notice — the page simply keeps being correct-looking
 * and wrong.
 *
 * So every catalog write goes through src/server/catalog/mutations, where a
 * mutation returns the tags it touched and the boundary applies them after the
 * commit. This makes that an invariant rather than a habit: a Prisma write to a
 * catalog table anywhere else is an error here.
 *
 * Reads are untouched. Orders, admins, sessions and Telegram users are not
 * catalog tables and are not checked — nothing caches them.
 *
 *   pnpm check:catalog-writes
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Prisma model accessors whose rows the storefront caches. */
const CATALOG_MODELS = [
  "product",
  "productFragrance",
  "productImage",
  "fragrance",
  "brand",
  "category",
  "settings",
];

/** Every Prisma method that writes. */
const WRITE_METHODS = [
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
];

/** Where catalog writes are allowed to live. */
const ALLOWED = [join(SRC, "server", "catalog", "mutations")];

const EXTENSIONS = [".ts", ".tsx", ".mts"];

function listSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSources(full));
    else if (EXTENSIONS.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/**
 * Deliberately a regex over `<receiver>.<model>.<method>(`.
 *
 * The receiver is not checked: `prisma`, `tx`, `client` and anything else are
 * all the same mistake. A false positive here is a five-second conversation; a
 * false negative is a stale storefront nobody notices.
 */
const WRITE = new RegExp(
  String.raw`\b[A-Za-z_$][\w$]*\s*\.\s*(${CATALOG_MODELS.join("|")})\s*\.\s*(${WRITE_METHODS.join("|")})\s*\(`,
  "g",
);

/** Raw SQL that writes to a catalog table sidesteps Prisma's accessors entirely. */
const RAW_WRITE = /\$(?:execute|query)Raw(?:Unsafe)?[\s\S]{0,400}?\b(insert\s+into|update|delete\s+from)\s+"?(products|product_fragrances|product_images|fragrances|brands|categories|settings)"?\b/gi;

const violations = [];

for (const file of listSources(SRC)) {
  if (ALLOWED.some((dir) => file.startsWith(dir + "/"))) continue;
  // Tests may set up and tear down their own rows: they run against a database
  // nobody is reading from, and the whole point of a fixture is to be direct.
  if (/\.test\.tsx?$/.test(file)) continue;

  const code = stripComments(readFileSync(file, "utf8"));
  const rel = relative(ROOT, file);

  for (const match of code.matchAll(WRITE)) {
    const line = code.slice(0, match.index).split("\n").length;
    violations.push({ file: rel, line, what: `${match[1]}.${match[2]}()` });
  }
  for (const match of code.matchAll(RAW_WRITE)) {
    const line = code.slice(0, match.index).split("\n").length;
    violations.push({ file: rel, line, what: `сырой ${match[1].toUpperCase()} по ${match[2]}` });
  }
}

if (violations.length > 0) {
  console.error("\ncheck:catalog-writes — запись в каталог вне mutations/:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.what}\n`);
  }
  console.error(
    "  Каталог кэшируется по тегам. Запись вне src/server/catalog/mutations\n" +
      "  не сообщает, что протухло, и витрина отдаёт старое до часа.\n",
  );
  process.exit(1);
}

const scanned = listSources(SRC).length;
console.log(`check:catalog-writes — чисто (просмотрено ${scanned} модулей)`);
