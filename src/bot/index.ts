import { createBot } from "@/bot/bot";
import { miniAppUrlFor } from "@/bot/handlers/start";
import { BUTTON, COMMAND_DESCRIPTION } from "@/bot/texts/ru";
import { loadDotEnv } from "@/lib/env";
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

const token = requireEnv("BOT_TOKEN", "бот не запущен");
const miniAppUrl = requireEnv("MINI_APP_URL", "кнопке каталога некуда вести");

const bot = createBot({ token, miniAppUrl });

async function boot(): Promise<void> {
  // Refuse to start against a database whose search is silently broken. The bot
  // does not search itself, but it shares the database with the catalog, and a
  // process that starts cleanly against a misconfigured one is how the defect
  // stays invisible.
  await assertSearchHealth();

  // If a webhook was ever registered, getUpdates returns 409 forever.
  await bot.api.deleteWebhook({ drop_pending_updates: false });

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
        [...PUBLIC_COMMANDS, { command: "admin", description: COMMAND_DESCRIPTION.admin }],
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

  const running = bot.start({
    onStart: (me) =>
      console.log(`Бот @${me.username} запущен, long polling через ${clientOptions().apiRoot}`),
  });

  // bot.stop() does not wait for the middleware stack — the start promise does.
  const shutdown = async (signal: string) => {
    console.log(`\n${signal}: останавливаю бота…`);
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
