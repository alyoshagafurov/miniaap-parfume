/**
 * Готовность развёртывания, до того как что-то пойдёт не так.
 *
 *   pnpm deploy:check
 *
 * Запускается человеком на сервере — после первой установки, после обновления,
 * после восстановления из бэкапа. Проверяет ровно то, что ломается молча: не
 * «отвечает ли сайт» (это видно и так), а те вещи, каждая из которых может
 * быть настроена неверно и не сообщить об этом неделями.
 *
 * Почему именно эти:
 *
 *   ENV      — переменная, которую читают лениво, всплывает через сутки чужим
 *              сообщением. Один раз это уже случилось: пустой BOT_USERNAME
 *              отчитался как «хранилище недоступно».
 *   БАЗА     — под LC_CTYPE=C pg_trgm не извлекает из кириллицы ни одной
 *              триграммы. Поиск с опечаткой по-русски не работает совсем, а
 *              по-латински работает — то есть дефекта не видно.
 *   МИГРАЦИИ — приложение на половине схемы падает на первом же запросе, но
 *              только к той таблице, которой не хватает.
 *   REDIS    — лимитер намеренно открывается при недоступном хранилище, чтобы
 *              не ронять каталог. Значит, его отсутствие ничем не видно.
 *   S3       — право на запись проверяется иначе только в тот момент, когда
 *              администратор грузит фотографию.
 *   TELEGRAM — релей отвечает на вызовы методов и может не отвечать на файлы;
 *              вторая форма ломается позже и не там, где её будут искать.
 *
 * Выход: 0 — можно запускать, 1 — есть отказы. Предупреждения не валят код.
 */

import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import Redis from "ioredis";

import { checkEnv, loadDotEnv } from "@/lib/env";
import { prisma } from "@/server/db";
import { checkSearchHealth, describeSearchHealth } from "@/server/db-health";
import { deleteObjects, putObjects } from "@/server/storage/s3";
import { apiRoot } from "@/server/telegram/client";

loadDotEnv(process.env.ENV_FILE ?? ".env.production");
// Запасной вариант, чтобы скрипт можно было прогнать и на машине разработчика.
loadDotEnv(".env");

type Level = "ok" | "warn" | "fail";

interface Result {
  level: Level;
  title: string;
  detail?: string;
  /** Что сделать. Пишется только когда есть что исправлять. */
  fix?: string;
}

const results: Result[] = [];
const ok = (title: string, detail?: string) =>
  results.push({ level: "ok", title, ...(detail ? { detail } : {}) });
const warn = (title: string, detail: string, fix?: string) =>
  results.push({ level: "warn", title, detail, ...(fix ? { fix } : {}) });
const fail = (title: string, detail: string, fix?: string) =>
  results.push({ level: "fail", title, detail, ...(fix ? { fix } : {}) });

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Никогда не печатает значение — только имя и факт наличия. */
function present(name: string): boolean {
  const value = process.env[name];
  return Boolean(value && value.trim() !== "");
}

// ── 1. Переменные окружения ────────────────────────────────────────────────

function checkEnvironment(): void {
  const parsed = checkEnv();
  if (parsed.ok) {
    ok("Переменные окружения", "схема приложения проходит");
  } else {
    fail(
      "Переменные окружения",
      `не заданы или неверны: ${parsed.variables.join(", ")}`,
      "Заполните .env.production по образцу .env.production.example",
    );
  }

  // Продакшен-специфичные: приложение их не читает, но без них не поднимется
  // compose и не выпустится сертификат.
  for (const [name, why] of [
    ["DOMAIN", "Caddy не выпустит сертификат"],
    ["ACME_EMAIL", "Let's Encrypt некуда писать о проблемах с продлением"],
    ["MINI_APP_URL", "кнопке каталога в боте некуда вести"],
  ] as const) {
    if (!present(name)) fail(name, why, `Задайте ${name} в .env.production`);
  }

  if (!present("ADMIN_CHAT_ID")) {
    warn(
      "ADMIN_CHAT_ID",
      "не задан — уведомления о заявках менеджеру не уходят",
      "Заявки всё равно видны в админке. Задайте id чата, чтобы приходили в Telegram.",
    );
  }

  if (apiRoot().includes("api.telegram.org")) {
    fail(
      "TELEGRAM_API_ROOT",
      "указывает на api.telegram.org напрямую",
      "С российского хостинга он недоступен. Поднимите релей: relay/README.md",
    );
  }

  if (!present("ENABLE_HSTS")) {
    warn(
      "ENABLE_HSTS",
      "выключен",
      "Включите после того, как HTTPS заработал и проверен. Раньше нельзя: браузер запомнит запрет на год.",
    );
  }

  if (present("CSP_REPORT_ONLY")) {
    warn(
      "CSP_REPORT_ONLY",
      "включён — политика безопасности отчитывается, но не применяется",
      "Снимите, когда посмотрели консоль в настоящем Telegram.",
    );
  }
}

// ── 2. База: локаль, расширения, поиск ─────────────────────────────────────

async function checkDatabase(): Promise<void> {
  try {
    const [row] = await prisma.$queryRaw<
      Array<{ ctype: string; collate: string; version: string }>
    >`
      SELECT datctype AS ctype, datcollate AS collate, version() AS version
        FROM pg_database WHERE datname = current_database()
    `;
    if (!row) {
      fail("База данных", "не удалось прочитать параметры текущей базы");
      return;
    }

    ok("База данных", row.version.split(",")[0] ?? row.version);

    if (/UTF-?8/i.test(row.ctype)) {
      ok("Локаль базы", `LC_CTYPE=${row.ctype}, LC_COLLATE=${row.collate}`);
    } else {
      fail(
        "Локаль базы",
        `LC_CTYPE=${row.ctype} — не UTF-8`,
        "pg_trgm не извлекает из кириллицы ни одной триграммы: поиск с опечаткой " +
          "по-русски не работает вообще. Базу нужно пересоздать с " +
          "--locale=C.UTF-8 и восстановить из дампа: scripts/restore.sh",
      );
    }

    // Настоящая проверка, а не наличие расширения: берётся кириллическое слово
    // и считается, сколько триграмм из него вышло.
    const health = await checkSearchHealth();
    if (health.ok) ok("Поиск", "триграммы из кириллицы извлекаются, индексы на месте");
    else fail("Поиск", describeSearchHealth(health));
  } catch (error) {
    fail(
      "База данных",
      message(error),
      "Проверьте DATABASE_URL и что контейнер postgres поднят",
    );
  }
}

async function checkMigrations(): Promise<void> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{ name: string; finished: Date | null; rolled: Date | null }>
    >`
      SELECT migration_name AS name, finished_at AS finished, rolled_back_at AS rolled
        FROM _prisma_migrations ORDER BY started_at
    `;
    const unfinished = rows.filter((r) => !r.finished || r.rolled);
    if (unfinished.length > 0) {
      fail(
        "Миграции",
        `не завершены: ${unfinished.map((r) => r.name).join(", ")}`,
        "docker compose -f docker-compose.prod.yml run --rm migrate",
      );
      return;
    }
    ok("Миграции", `применено ${rows.length}`);
  } catch (error) {
    fail(
      "Миграции",
      message(error),
      "Таблицы _prisma_migrations нет — схема не разворачивалась. " +
        "docker compose -f docker-compose.prod.yml run --rm migrate",
    );
  }
}

// ── 3. Redis ───────────────────────────────────────────────────────────────

async function checkRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    warn(
      "Redis",
      "REDIS_URL не задан — лимиты заявок и входа не работают",
      "Лимитер намеренно открывается при недоступном хранилище, поэтому каталог " +
        "работает, а защиты от перебора нет.",
    );
    return;
  }

  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    const pong = await redis.ping();
    if (pong === "PONG") ok("Redis", "отвечает, лимиты работают");
    else warn("Redis", `неожиданный ответ на PING: ${pong}`);
  } catch (error) {
    fail(
      "Redis",
      message(error),
      "Лимиты заявок и входа сейчас не действуют. Проверьте контейнер redis.",
    );
  } finally {
    redis.disconnect();
  }
}

// ── 4. Объектное хранилище ─────────────────────────────────────────────────

async function checkStorage(): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  const endpoint = process.env.S3_ENDPOINT;
  if (!bucket || !endpoint) {
    fail("Хранилище", "S3_BUCKET или S3_ENDPOINT не заданы");
    return;
  }

  try {
    const client = new S3Client({
      endpoint,
      region: process.env.S3_REGION ?? "ru-central1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY ?? "",
        secretAccessKey: process.env.S3_SECRET_KEY ?? "",
      },
    });
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    ok("Хранилище", `бакет ${bucket} доступен`);
  } catch (error) {
    fail(
      "Хранилище",
      message(error),
      "Проверьте S3_ENDPOINT, ключи и что бакет существует",
    );
    return;
  }

  // Чтения мало: право на запись проверяется иначе только в тот момент, когда
  // администратор грузит фотографию.
  const probe = `deploy-check/probe-${Date.now()}.txt`;
  try {
    await putObjects([
      {
        key: probe,
        body: Buffer.from("arumi deploy-check"),
        contentType: "text/plain",
      },
    ]);
    await deleteObjects([probe]);
    ok("Запись в хранилище", "пробный объект записан и удалён");
  } catch (error) {
    fail(
      "Запись в хранилище",
      message(error),
      "Ключам не хватает прав на запись — загрузка фотографий работать не будет",
    );
  }

  const publicUrl = process.env.NEXT_PUBLIC_S3_PUBLIC_URL;
  if (!publicUrl) {
    fail(
      "Публичный адрес бакета",
      "NEXT_PUBLIC_S3_PUBLIC_URL не задан",
      "Без него на витрине не покажется ни одна фотография",
    );
    return;
  }
  try {
    ok(
      "Публичный адрес бакета",
      `${new URL(publicUrl).origin} (вшит в сборку и в CSP)`,
    );
  } catch {
    fail(
      "Публичный адрес бакета",
      `не разбирается как URL: ${publicUrl}`,
      "CSP не сможет разрешить origin картинок, и браузер заблокирует их все",
    );
  }
}

// ── 5. Telegram через релей ────────────────────────────────────────────────

async function checkTelegram(): Promise<void> {
  const token = process.env.BOT_TOKEN;
  const root = apiRoot().replace(/\/+$/, "");
  if (!token) {
    fail("Telegram", "BOT_TOKEN не задан");
    return;
  }

  try {
    const response = await fetch(`${root}/bot${token}/getMe`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await response.json()) as {
      ok?: boolean;
      result?: { username?: string };
      description?: string;
    };
    if (body.ok && body.result?.username) {
      ok("Telegram через релей", `@${body.result.username}`);
    } else {
      fail(
        "Telegram через релей",
        body.description ?? `ответ ${response.status}`,
        "Проверьте BOT_TOKEN и что этот сервер в ALLOWED_IP релея",
      );
      return;
    }
  } catch (error) {
    fail(
      "Telegram через релей",
      message(error),
      `Релей ${root} не отвечает. Без него не работают ни приветствие, ни ` +
        "уведомления о заявках, ни код входа в админку. См. relay/README.md",
    );
    return;
  }

  // Вторая форма. Релей, который проксирует только методы, выглядит рабочим
  // ровно до первой попытки скачать присланный файл.
  try {
    const response = await fetch(`${root}/file/bot${token}/nonexistent`, {
      signal: AbortSignal.timeout(10_000),
    });
    // 400 или 404 от самого Telegram — это успех: запрос доехал. Провал — 403
    // от релея (не пустил) или сетевая ошибка (не проксирует этот путь).
    if (response.status === 403) {
      fail(
        "Скачивание файлов через релей",
        "релей ответил 403 на /file/bot…",
        "Путь /file/bot* не разрешён. Обе формы обязаны проксироваться — см. relay/Caddyfile",
      );
    } else {
      ok(
        "Скачивание файлов через релей",
        `путь /file/bot* проксируется (${response.status})`,
      );
    }
  } catch (error) {
    fail(
      "Скачивание файлов через релей",
      message(error),
      "Путь /file/bot* не проксируется. apiRoot покрывает только вызовы " +
        "методов — файлы идут другим путём. См. relay/Caddyfile",
    );
  }
}

// ── Вывод ──────────────────────────────────────────────────────────────────

const MARK: Record<Level, string> = { ok: " OK ", warn: "ВНИМ", fail: "НЕТ " };

function report(): number {
  const failures = results.filter((r) => r.level === "fail");
  const warnings = results.filter((r) => r.level === "warn");

  console.log("\n  ÁRUMI — проверка развёртывания\n");
  for (const r of results) {
    console.log(`  [${MARK[r.level]}]  ${r.title}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.fix) console.log(`          ${r.fix}`);
  }

  console.log("");
  if (failures.length === 0 && warnings.length === 0) {
    console.log("  Всё в порядке. Можно запускать.\n");
    return 0;
  }
  if (failures.length === 0) {
    console.log(
      `  Отказов нет, предупреждений ${warnings.length}. Запускаться можно, но прочитайте их.\n`,
    );
    return 0;
  }
  console.log(
    `  Отказов ${failures.length}` +
      `${warnings.length ? `, предупреждений ${warnings.length}` : ""}. ` +
      "Запускать нельзя, пока не исправлено.\n",
  );
  return 1;
}

async function main(): Promise<void> {
  checkEnvironment();
  await checkDatabase();
  await checkMigrations();
  await checkRedis();
  await checkStorage();
  await checkTelegram();
  process.exitCode = report();
}

void main()
  .catch((error: unknown) => {
    console.error(`\n  Проверка сама упала: ${message(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
