import { writeFileSync } from "node:fs";

import { createBot } from "@/bot/bot";
import { miniAppUrlFor } from "@/bot/handlers/start";
import { BUTTON, COMMAND_DESCRIPTION } from "@/bot/texts/ru";
import { checkEnv, loadDotEnv } from "@/lib/env";
import { prisma } from "@/server/db";
import { assertSearchHealth } from "@/server/db-health";
import { clientOptions } from "@/server/telegram/client";

/**
 * The bot process.
 *
 *   pnpm bot
 *
 * A separate process from the web app, sharing its database. Long polling
 * only — webhooks are never registered, because the production host is in
 * Russia and reaches the Bot API through a relay; a webhook would require
 * Telegram to reach back in, which it cannot.
 *
 * This file is only the process: environment, boot, polling, shutdown. Every
 * handler lives in bot.ts, which has no side effects, so the smoke test can
 * stand the same bot up in plain Node with no network.
 */

loadDotEnv();

/** Fails loudly at boot rather than producing `undefined` at the first send. */
function requireEnv(name: string, why: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`${name} не задан — ${why}. Проверьте .env`);
    process.exit(1);
  }
  return value;
}

/**
 * The whole environment, before anything that needs it.
 *
 * requireEnv below covers the two the bot reaches for by name. The rest —
 * DATABASE_URL, AUTH_SECRET, the S3 group — are validated by the same schema
 * the web process uses, so a bot that starts is a bot whose database and
 * storage configuration is already known good, rather than one that dies on
 * the first /start.
 */
const envCheck = checkEnv();
if (!envCheck.ok) {
  console.error(
    `\nНе запускаюсь: проблема с переменными окружения — ${envCheck.variables.join(", ")}\n\n` +
      `${envCheck.message}\n\nПроверьте .env (образец — .env.example).\n`,
  );
  process.exit(1);
}

const token = requireEnv("BOT_TOKEN", "бот не запущен");
const miniAppUrl = requireEnv("MINI_APP_URL", "кнопке каталога некуда вести");

const bot = createBot({ token, miniAppUrl });

/**
 * Proof of life for the container's health check.
 *
 * A long-polling bot has no port to probe, so `docker compose` can only see
 * whether the process exists — and a process that exists is not the same as a
 * bot that is still talking to Telegram. A hung event loop, a relay that
 * accepts connections and never answers, a poller wedged after a network
 * change: all of them leave a healthy-looking process and a bot that has
 * silently stopped taking orders.
 *
 * So the loop proves it is running by asking Telegram who it is and writing the
 * time down. The health check reads the file's age; when it stops being
 * refreshed the container is restarted. `getMe` is the cheapest call in the Bot
 * API and is not rate limited in any way that matters at one per minute.
 */
const HEARTBEAT_FILE = process.env.BOT_HEARTBEAT_FILE ?? "";
const HEARTBEAT_INTERVAL_MS = 60_000;

function startHeartbeat(): () => void {
  if (!HEARTBEAT_FILE) return () => undefined;

  const beat = async () => {
    try {
      await bot.api.getMe();
      writeFileSync(HEARTBEAT_FILE, `${new Date().toISOString()}\n`);
    } catch {
      // Deliberately not rewritten and deliberately not logged per failure: a
      // relay that is down for a minute is ordinary, and the file going stale
      // is exactly the signal the health check is watching for.
    }
  };

  void beat();
  const timer = setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  // Must not hold the process open on its own; shutdown clears it anyway.
  timer.unref();
  return () => clearInterval(timer);
}

async function boot(): Promise<void> {
  // Refuse to start against a database whose search is silently broken. The bot
  // does not search itself, but it shares the database with the catalog, and a
  // process that starts cleanly against a misconfigured one is how the defect
  // stays invisible.
  await assertSearchHealth();

  // If a webhook was ever registered, getUpdates returns 409 forever.
  await bot.api.deleteWebhook({ drop_pending_updates: false });

  // /id is answered but listed nowhere: it is a setup tool the owner is told
  // about, not something a buyer should find in the menu.
  const PUBLIC_COMMANDS = [
    { command: "start", description: COMMAND_DESCRIPTION.start },
    { command: "catalog", description: COMMAND_DESCRIPTION.catalog },
    { command: "contacts", description: COMMAND_DESCRIPTION.contacts },
  ];

  await bot.api.setMyCommands(PUBLIC_COMMANDS);

  // Per-admin command lists. BotCommandScopeChat REPLACES the whole list for
  // that chat, so every command an administrator should still see is repeated
  // here — omitting /start would hide it from them entirely.
  const admins = await prisma.adminUser.findMany({
    where: { isActive: true },
    select: { telegramId: true },
  });
  for (const admin of admins) {
    try {
      await bot.api.setMyCommands(
        [
          ...PUBLIC_COMMANDS,
          { command: "admin", description: COMMAND_DESCRIPTION.admin },
        ],
        { scope: { type: "chat", chat_id: Number(admin.telegramId) } },
      );
    } catch {
      // An admin who has never opened a chat with the bot cannot be scoped yet.
      // Not fatal, and not worth logging an id over.
    }
  }

  await bot.api.setChatMenuButton({
    menu_button: { type: "web_app", text: BUTTON.menu, web_app: { url: miniAppUrl } },
  });

  const stopHeartbeat = startHeartbeat();

  const running = bot.start({
    onStart: (me) =>
      console.log(
        `Бот @${me.username} запущен, long polling через ${clientOptions().apiRoot}`,
      ),
  });

  // bot.stop() does not wait for the middleware stack — the start promise does.
  const shutdown = async (signal: string) => {
    console.log(`\n${signal}: останавливаю бота…`);
    stopHeartbeat();
    await bot.stop();
    await running;
    await prisma.$disconnect();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await running;
}

boot().catch((e) => {
  console.error("Бот не смог запуститься:", e);
  process.exit(1);
});

export { miniAppUrlFor };
