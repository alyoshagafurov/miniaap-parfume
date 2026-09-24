import { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";

/**
 * Database health checks for search.
 *
 * Both web and bot run this at startup. It exists because of a defect that
 * reached this project once already and would have reached production: with
 * `LC_CTYPE=C`, pg_trgm classifies characters through isalnum() and extracts
 * ZERO trigrams from Cyrillic. `show_trgm('шанель')` returns `{}`, Russian typo
 * tolerance stops working entirely — and Latin search keeps working perfectly,
 * so nothing looks wrong.
 *
 * A misconfigured database should therefore refuse to start with a message
 * naming the fix, not serve a catalog whose search quietly fails for the
 * language it is written in.
 */

export interface SearchHealth {
  ok: boolean;
  /** Number of trigrams pg_trgm produces for a Russian word. Must be > 0. */
  cyrillicTrigrams: number;
  hasRussianCollation: boolean;
  /** Существование collation и её работоспособность — разные вещи. */
  collationSorts: boolean;
  ctype: string;
  collate: string;
  problems: string[];
}

export async function checkSearchHealth(): Promise<SearchHealth> {
  // A database without pg_trgm makes show_trgm() a missing function, which
  // throws rather than returning an empty array. That is still a configuration
  // problem this check exists to report, so it is caught and described rather
  // than raised as an opaque Postgres error.
  let row:
    | {
        trigrams: number;
        hasCollation: boolean;
        sorted: string[] | null;
        ctype: string;
        collate: string;
      }
    | undefined;
  try {
    [row] = await prisma.$queryRaw<
      Array<{
        trigrams: number;
        hasCollation: boolean;
        sorted: string[] | null;
        ctype: string;
        collate: string;
      }>
    >`
    SELECT
      coalesce(array_length(show_trgm('шанель'), 1), 0)::int AS "trigrams",
      EXISTS (SELECT 1 FROM pg_collation WHERE collname = 'ru-RU-x-icu') AS "hasCollation",
      -- Наличия строки в pg_collation мало: сборка без ICU её показывает и
      -- падает при использовании. Единственная честная проверка — отсортировать.
      -- Побайтово «ёлка» уходит в конец, по-русски стоит между «апельсин» и
      -- «яблоко», и разница видна на трёх словах.
      (SELECT array_agg(w ORDER BY w COLLATE "ru-RU-x-icu")
         FROM unnest(ARRAY['яблоко','ёлка','апельсин']) AS t(w)) AS "sorted",
      (SELECT datctype FROM pg_database WHERE datname = current_database()) AS "ctype",
      (SELECT datcollate FROM pg_database WHERE datname = current_database()) AS "collate"
  `;
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const detail = raw.split("\n")[0] ?? raw;
    // Name the actual cause rather than guessing one. Postgres 42883 is
    // "function does not exist", which for this query means pg_trgm is missing;
    // anything else is a different problem and saying "pg_trgm" would send
    // whoever reads this down the wrong path.
    const missingExtension = /42883|show_trgm.*does not exist/i.test(detail);
    return {
      ok: false,
      cyrillicTrigrams: 0,
      hasRussianCollation: false,
      collationSorts: false,
      ctype: "?",
      collate: "?",
      problems: [
        missingExtension
          ? "расширение pg_trgm не установлено — поиск не будет работать вовсе " +
            "(CREATE EXTENSION pg_trgm; обычно это значит, что миграции не применены)"
          : `не удалось проверить поиск: ${detail}`,
      ],
    };
  }

  if (!row) {
    return {
      ok: false,
      cyrillicTrigrams: 0,
      hasRussianCollation: false,
      collationSorts: false,
      ctype: "?",
      collate: "?",
      problems: ["не удалось опросить базу данных"],
    };
  }

  const problems: string[] = [];
  if (row.trigrams <= 0) {
    problems.push(
      `pg_trgm не извлекает триграммы из кириллицы (LC_CTYPE=${row.ctype}) — ` +
        "поиск по-русски не работает, хотя по-латински работает",
    );
  }
  if (!row.hasCollation) {
    problems.push(
      'collation "ru-RU-x-icu" отсутствует — сортировка А–Я будет байтовой, ' +
        "и «ёлка» окажется после «яблоко»",
    );
  }

  const collationSorts =
    Array.isArray(row.sorted) && row.sorted.join(",") === "апельсин,ёлка,яблоко";
  if (row.hasCollation && !collationSorts) {
    problems.push(
      'collation "ru-RU-x-icu" есть, но сортирует неверно: получилось ' +
        `[${(row.sorted ?? []).join(", ")}], ожидалось [апельсин, ёлка, яблоко] — ` +
        "обычно это сборка PostgreSQL без ICU",
    );
  }

  return {
    ok: problems.length === 0,
    cyrillicTrigrams: row.trigrams,
    hasRussianCollation: row.hasCollation,
    collationSorts,
    ctype: row.ctype,
    collate: row.collate,
    problems,
  };
}

/** A failure message that names the cause and the fix, not just the symptom. */
export function describeSearchHealth(health: SearchHealth): string {
  if (health.ok) {
    return `Поиск настроен верно: ctype=${health.ctype}, collate=${health.collate}`;
  }
  return [
    "База данных настроена так, что поиск по-русски работать не будет.",
    "",
    ...health.problems.map((p) => `  • ${p}`),
    "",
    `  Сейчас: LC_CTYPE=${health.ctype}, LC_COLLATE=${health.collate}`,
    "  Нужно:  LC_CTYPE должен быть UTF-8 (например C.UTF-8).",
    "",
    "  На Railway initdb недоступен, но локаль задаётся отдельной базе —",
    "  в том же кластере, без пересоздания сервиса:",
    "",
    "    pnpm db:create-ru        (см. scripts/create-search-db.ts)",
    "",
    "  затем в переменных сервисов подставить имя новой базы в DATABASE_URL",
    "  и прогнать миграции: railway run pnpm prisma migrate deploy",
    "",
    '  В docker-compose: POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale=C.UTF-8".',
    "  Там локаль задаётся при initdb, поэтому том придётся пересоздать:",
    "    docker compose down -v && docker compose up -d && pnpm db:deploy && pnpm seed",
  ].join("\n");
}

/**
 * Throws unless search is correctly configured. Called once at process start by
 * both web and bot.
 */
export async function assertSearchHealth(): Promise<void> {
  const health = await checkSearchHealth();
  if (!health.ok) throw new Error(describeSearchHealth(health));
}

/**
 * Sorts Russian text the way a reader expects.
 *
 * The database is deliberately created with `datcollate=C` — a deterministic
 * byte ordering that cannot drift between machines — so Cyrillic does not sort
 * alphabetically by default: `ё` lands after `я`, and capitals sort before all
 * lower case. Anywhere Cyrillic is actually *sorted* rather than filtered, the
 * ICU collation has to be named explicitly, and Prisma's typed `orderBy` cannot
 * emit `COLLATE` — so those queries are raw.
 *
 * Exported mainly so the behaviour is directly testable.
 */
export async function orderedByName(words: readonly string[]): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ w: string }>>`
    SELECT w FROM unnest(ARRAY[${Prisma.join(words.map((w) => w))}]::text[]) AS t(w)
    ORDER BY w COLLATE "ru-RU-x-icu"
  `;
  return rows.map((r) => r.w);
}
