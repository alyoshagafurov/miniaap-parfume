#!/usr/bin/env node
/**
 * The build must not read the database.
 *
 * Under `cacheComponents` a prerender EXECUTES functions carrying `'use cache'`
 * in order to fill their entries, and a Suspense boundary does not change that:
 * the boundary decides where a result lands, not whether it is computed at
 * build. So a storefront read written the obvious way makes `next build`
 * open a connection to PostgreSQL.
 *
 * That cost three things, all of which were paid for a while: the first deploy
 * failed, because migrations run after the build and the tables were not there
 * yet; the database password stayed in the image's layer history; and the
 * database had to be reachable from the open internet.
 *
 * The fix is `io()` from next/cache — a suspension point BEFORE the query
 * rather than around it. It is a no-op inside a cache scope by design, so it
 * cannot live in the cached function itself; each read is therefore a pair.
 * This checks that the pairing holds:
 *
 *   1. No exported function carries `'use cache'`. An exported one can be
 *      reached from a page with nothing in between to suspend the prerender.
 *   2. In any file that caches, every `export async function` begins with
 *      `await io();`. Synchronous exports are pure helpers and are left alone.
 *   3. A GET route handler that can reach the database has a request-time
 *      suspension point of its own. `next build` runs route handlers to find
 *      out whether they can be static; /api/health had none, answered 503
 *      rather than throwing when the database was unreachable, and was one
 *      catch block away from baking a permanent health-check failure into the
 *      image.
 *
 *   pnpm check:build-io
 *
 * The end-to-end version of this check is a build against a database that
 * cannot exist, which must pass and print no Prisma error:
 *
 *   DATABASE_URL='postgresql://nobody:nobody@127.0.0.1:1/none' pnpm build
 */

import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/**
 * What counts as waiting for a real request in a route handler.
 *
 * `connection()` is explicit. The others reach `cookies()` further down the
 * call stack, which is itself a suspension point — every admin route
 * authenticates before it reads anything, so the check follows the name rather
 * than the import graph.
 */
const REQUEST_TIME = [
  "connection()",
  "cookies()",
  "headers()",
  "currentSession(",
  "requirePermission(",
  "requireRole(",
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if ([".ts", ".tsx"].includes(extname(entry.name))) out.push(full);
  }
  return out;
}

/**
 * The source with its comments removed.
 *
 * Rule 3 searches for a call, and a call named in prose is not a call. The
 * health route's own comment explains why it uses `connection()`, which was
 * enough to satisfy the check that the call was there after it had been
 * deleted — the check passed on the explanation of itself.
 */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** The first line of a body that is neither blank nor a comment. */
function firstStatement(lines, from) {
  for (let i = from; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("//") || line.startsWith("/*") || line.startsWith("*"))
      continue;
    return { line, at: i };
  }
  return null;
}

const problems = [];

for (const file of walk(SRC)) {
  const source = readFileSync(file, "utf8");
  const where = relative(ROOT, file);
  const lines = source.split("\n");
  // The directive, not a mention of it. src/server/settings.ts and list.ts both
  // explain in prose why they do NOT carry it, and matching that prose made
  // this check demand an io() from two modules that must stay free of any Next
  // import — which is the opposite of what it is for.
  const isDirective = (line) => line === '"use cache";' || line === "'use cache';";
  const caches = lines.some((line) => isDirective(line.trim()));

  // 1 + 2 — the pairing.
  lines.forEach((raw, i) => {
    const line = raw.trim();

    if (isDirective(line)) {
      for (let j = i - 1; j >= 0; j--) {
        const back = lines[j].trim();
        if (!back.includes("function ")) continue;
        if (back.startsWith("export ")) {
          problems.push(
            `${where}:${j + 1} — «use cache» на экспортируемой функции.\n` +
              `      Разделите: экспортируемая ждёт await io(), приватная несёт директиву.`,
          );
        }
        break;
      }
    }

    if (caches && /^export async function \w+/.test(line)) {
      // The signature may wrap over several lines — getMoreFromBrand takes
      // three parameters and does. The body starts after the line that opens
      // it, not after the declaration line.
      let open = i;
      while (open < lines.length && !/\{\s*$/.test(lines[open])) open++;
      const next = firstStatement(lines, open + 1);
      if (!next || next.line !== "await io();") {
        problems.push(
          `${where}:${i + 1} — ${line.replace(/\s*\(.*$/, "")} не начинается с await io().\n` +
            `      Без него пререндер выполнит чтение и сборка пойдёт в базу.`,
        );
      }
    }
  });

  // 3 — route handlers.
  if (where.includes("/api/") && where.endsWith("route.ts")) {
    const code = withoutComments(source);
    const reachesDb = code.includes('from "@/server/db"');
    const hasGet = /^export async function GET/m.test(code);
    if (reachesDb && hasGet && !REQUEST_TIME.some((token) => code.includes(token))) {
      problems.push(
        `${where} — GET трогает базу и ничего не ждёт от запроса.\n` +
          `      next build выполняет route handlers. Добавьте await connection().`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("\ncheck:build-io — сборка может пойти в базу:\n");
  for (const problem of problems) console.error(`  • ${problem}\n`);
  process.exit(1);
}

console.log("check:build-io — чисто (сборка не читает базу)");
