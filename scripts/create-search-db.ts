/**
 * Создаёт базу с локалью, при которой русский поиск работает.
 *
 *   pnpm db:create-ru                  # имя по умолчанию: arumi
 *   pnpm db:create-ru --name arumi_ru
 *
 * Нужен только если `pnpm deploy:check` сказал, что LC_CTYPE не UTF-8.
 *
 * ── Почему это вообще может понадобиться ──
 *
 * Под LC_CTYPE=C расширение pg_trgm извлекает из кириллицы НОЛЬ триграмм:
 * `show_trgm('шанель')` возвращает пустой массив. Поиск с опечаткой по-русски
 * перестаёт работать полностью, а по-латински продолжает — то есть дефект не
 * виден, пока кто-нибудь не наберёт «шанел» вместо «chanel».
 *
 * ── Почему отдельная база, а не пересоздание сервиса ──
 *
 * Локаль задаётся при `initdb` и у готового кластера не меняется. На своём
 * сервере это лечится `POSTGRES_INITDB_ARGS` и пересозданием тома. На Railway
 * до initdb не добраться — но локаль можно задать ОТДЕЛЬНОЙ базе внутри того же
 * кластера, из-под `template0`. Это и делает скрипт: он не трогает
 * существующую базу и ничего из неё не удаляет.
 *
 * После него остаётся подставить имя новой базы в DATABASE_URL сервисов web и
 * bot и прогнать миграции.
 *
 * ── Почему C.UTF-8, а не ru_RU.UTF-8 ──
 *
 * Нужна только классификация символов по UTF-8 — ради триграмм. Порядок А–Я
 * применяется в запросах через `COLLATE "ru-RU-x-icu"`, то есть не зависит от
 * локали базы вовсе. C.UTF-8 при этом детерминирован и есть в любом образе,
 * тогда как ru_RU.UTF-8 требует сгенерированной локали в контейнере.
 */

import { Client } from "pg";

import { loadDotEnv } from "@/lib/env";

loadDotEnv(process.env.ENV_FILE ?? ".env.production");
loadDotEnv(".env");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

/** Только то, что безопасно подставить в имя базы: оно не параметризуется. */
function assertSafeName(name: string): void {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error(
      `Недопустимое имя базы «${name}». Латиница в нижнем регистре, цифры и ` +
        "подчёркивание, начиная с буквы.",
    );
  }
}

async function main(): Promise<void> {
  const target = arg("name") ?? "arumi";
  assertSafeName(target);

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL не задан — некуда подключаться");

  // Подключаемся к той базе, что есть, и создаём рядом новую. CREATE DATABASE
  // не работает внутри транзакции, поэтому обычный клиент, а не Prisma.
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    const { rows } = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [target],
    );
    if (rows[0]?.exists) {
      const info = await client.query<{ ctype: string; collate: string }>(
        "SELECT datctype AS ctype, datcollate AS collate FROM pg_database WHERE datname = $1",
        [target],
      );
      const row = info.rows[0];
      console.log(
        `\n  База «${target}» уже существует: LC_CTYPE=${row?.ctype}, ` +
          `LC_COLLATE=${row?.collate}\n`,
      );
      if (row && !/UTF-?8/i.test(row.ctype)) {
        console.log(
          "  И её локаль тоже не UTF-8. Выберите другое имя: --name arumi_ru\n",
        );
        process.exitCode = 1;
      }
      return;
    }

    // template0, а не template1: только он позволяет задать локаль, отличную от
    // той, с которой создан кластер.
    await client.query(
      `CREATE DATABASE "${target}" TEMPLATE template0 ` +
        `ENCODING 'UTF8' LC_CTYPE 'C.UTF-8' LC_COLLATE 'C'`,
    );

    console.log(`\n  Создана база «${target}»: LC_CTYPE=C.UTF-8, LC_COLLATE=C\n`);
    console.log("  Дальше:");
    console.log(
      `    1. В переменных web и bot заменить имя базы в DATABASE_URL на «${target}»`,
    );
    console.log("    2. Прогнать миграции:  railway run pnpm prisma migrate deploy");
    console.log("    3. Проверить:          railway run pnpm deploy:check\n");
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(`\n  ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
