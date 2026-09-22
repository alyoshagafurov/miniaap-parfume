import { Bot, GrammyError, HttpError } from "grammy";

import { handleStart, miniAppUrlFor } from "@/bot/handlers/start";
import { mainKeyboard } from "@/bot/keyboards/main";
import {
  BUTTON,
  COMMAND_DESCRIPTION,
  NOT_ADMIN,
  contacts,
  terms,
} from "@/bot/texts/ru";
import { loadDotEnv } from "@/lib/env";
import { prisma } from "@/server/db";
import { getSettings } from "@/server/settings";
import { clientOptions, installAutoRetry } from "@/server/telegram/client";

/**
 * The bot process.
 *
 *   pnpm bot
 *
 * A separate process from the web app, sharing its database. Long polling
 * only — webhooks are never registered, because the production host is in
 * Russia and reaches the Bot API through a relay; a webhook would require
 * Telegram to reach back in, which it cannot.
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

const bot = new Bot(token, { client: clientOptions() });
installAutoRetry(bot.api);

// ── Identity ────────────────────────────────────────────────────────────────

const adminCache = new Map<string, boolean>();

async function isAdmin(telegramId: bigint): Promise<boolean> {
  const key = telegramId.toString();
  const cached = adminCache.get(key);
  if (cached !== undefined) return cached;
  const row = await prisma.adminUser.findFirst({
    where: { telegramId, isActive: true },
    select: { id: true },
  });
  const result = row !== null;
  adminCache.set(key, result);
  return result;
}

/**
 * Every update refreshes the sender, so the catalog knows who is active and the
 * notifier knows who has blocked the bot. Personal data beyond what Telegram
 * already sends is never stored, and none of it is logged.
 */
bot.use(async (ctx, next) => {
  const from = ctx.from;
  if (from && !from.is_bot) {
    await prisma.telegramUser.upsert({
      where: { telegramId: BigInt(from.id) },
      update: {
        firstName: from.first_name,
        username: from.username ?? null,
        lastSeenAt: new Date(),
        botBlocked: false,
      },
      create: {
        telegramId: BigInt(from.id),
        firstName: from.first_name,
        username: from.username ?? null,
      },
    });
  }
  await next();
});

/**
 * In a private chat my_chat_member fires only on block and unblock, which is
 * the cheapest possible signal that a user has stopped the bot — far better
 * than discovering it from a 403 the next time a request notification is sent.
 */
bot.on("my_chat_member", async (ctx) => {
  const status = ctx.myChatMember.new_chat_member.status;
  const blocked = status === "kicked" || status === "left";
  await prisma.telegramUser.updateMany({
    where: { telegramId: BigInt(ctx.from.id) },
    data: { botBlocked: blocked },
  });
});

// ── Commands ────────────────────────────────────────────────────────────────

bot.command("start", (ctx) => handleStart(ctx, { miniAppUrl, isAdmin }));

bot.command("catalog", async (ctx) => {
  const settings = await getSettings();
  await ctx.reply(BUTTON.menu, {
    reply_markup: mainKeyboard({
      miniAppUrl,
      whatsappPhone: settings.whatsappPhone,
    }),
  });
});

bot.command("contacts", async (ctx) => {
  await ctx.reply(contacts(await getSettings()));
});

bot.command("admin", async (ctx) => {
  const from = ctx.from;
  if (!from || !(await isAdmin(BigInt(from.id)))) {
    // Says nothing about the panel existing.
    await ctx.reply(NOT_ADMIN);
    return;
  }
  const settings = await getSettings();
  await ctx.reply(BUTTON.admin, {
    reply_markup: mainKeyboard({
      miniAppUrl,
      whatsappPhone: settings.whatsappPhone,
      adminUrl: `${miniAppUrl.replace(/\/+$/, "")}/admin`,
    }),
  });
});

bot.callbackQuery("terms", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(terms(await getSettings()));
});

// ── Errors ──────────────────────────────────────────────────────────────────

bot.catch((err) => {
  const e = err.error;
  // Update ids only — an update object contains the user's name and message.
  const where = `update ${err.ctx.update.update_id}`;
  if (e instanceof GrammyError) {
    console.error(`Bot API отклонил запрос (${where}): ${e.method} ${e.error_code} ${e.description}`);
  } else if (e instanceof HttpError) {
    console.error(`Сеть недоступна (${where}) — проверьте TELEGRAM_API_ROOT:`, e.message);
  } else {
    console.error(`Необработанная ошибка (${where}):`, e);
  }
});

// ── Boot ────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  // If a webhook was ever registered, getUpdates returns 409 forever.
  await bot.api.deleteWebhook({ drop_pending_updates: false });

  await bot.api.setMyCommands([
    { command: "start", description: COMMAND_DESCRIPTION.start },
    { command: "catalog", description: COMMAND_DESCRIPTION.catalog },
    { command: "contacts", description: COMMAND_DESCRIPTION.contacts },
  ]);

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
          { command: "start", description: COMMAND_DESCRIPTION.start },
          { command: "catalog", description: COMMAND_DESCRIPTION.catalog },
          { command: "contacts", description: COMMAND_DESCRIPTION.contacts },
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

  const running = bot.start({
    onStart: (me) => console.log(`Бот @${me.username} запущен, long polling через ${clientOptions().apiRoot}`),
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
