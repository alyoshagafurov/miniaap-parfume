import { Bot, GrammyError, HttpError } from "grammy";
import type { UserFromGetMe } from "grammy/types";

import { handleStart } from "@/bot/handlers/start";
import { mainKeyboard } from "@/bot/keyboards/main";
import { BUTTON, NOT_ADMIN, contacts, terms } from "@/bot/texts/ru";
import { prisma } from "@/server/db";
import { readSettings } from "@/server/settings";
import { clientOptions, installAutoRetry } from "@/server/telegram/client";

/**
 * Builds the bot with every handler attached.
 *
 * Deliberately free of side effects: it reads no environment, starts no
 * polling, and never calls process.exit. Everything it needs arrives as an
 * argument. That is what lets the smoke test stand a bot up in plain Node —
 * no Next runtime, no network — and drive real updates through it.
 *
 * NOTHING in this file, or in anything it imports, may import from `next/*`.
 * This process has no request context, so a `'use cache'` function throws the
 * moment it runs. That already happened once: getSettings carried the directive
 * and would have crashed /start, /catalog, /contacts, /admin and the terms
 * button alike. An eslint rule and the smoke test now both guard it.
 */

export interface BotDeps {
  token: string;
  miniAppUrl: string;
  /**
   * Supplying this makes grammY skip its getMe call at startup, which is what
   * allows a test to run with no network at all.
   */
  botInfo?: UserFromGetMe;
}

export function createBot({ token, miniAppUrl, botInfo }: BotDeps): Bot {
  const bot = botInfo
    ? new Bot(token, { client: clientOptions(), botInfo })
    : new Bot(token, { client: clientOptions() });

  installAutoRetry(bot.api);

  // ── Identity ──────────────────────────────────────────────────────────────

  /**
   * Per-process, and short-lived.
   *
   * It had no expiry, so an administrator deactivated in the panel kept their
   * «Админ-панель» button until the bot process restarted. What leaks is only
   * the existence of the panel and its URL — the panel itself re-reads
   * `isActive` on every request — but to somebody who was an administrator
   * until a minute ago, which is exactly the person the deactivation was about.
   *
   * A minute is short enough that the revocation is effectively immediate and
   * long enough that a burst of messages from one person is still one query.
   */
  const ADMIN_CACHE_TTL_MS = 60_000;
  const adminCache = new Map<string, { value: boolean; at: number }>();

  async function isAdmin(telegramId: bigint): Promise<boolean> {
    const key = telegramId.toString();
    const cached = adminCache.get(key);
    if (cached && Date.now() - cached.at < ADMIN_CACHE_TTL_MS) return cached.value;

    const row = await prisma.adminUser.findFirst({
      where: { telegramId, isActive: true },
      select: { id: true },
    });
    const result = row !== null;
    adminCache.set(key, { value: result, at: Date.now() });
    return result;
  }

  /**
   * Every update refreshes the sender, so the catalog knows who is active and
   * the notifier knows who has blocked the bot. Nothing beyond what Telegram
   * already sends is stored, and none of it is logged.
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
   * than discovering it from a 403 the next time a request is notified.
   */
  bot.on("my_chat_member", async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    const blocked = status === "kicked" || status === "left";
    await prisma.telegramUser.updateMany({
      where: { telegramId: BigInt(ctx.from.id) },
      data: { botBlocked: blocked },
    });
  });

  // ── Commands ──────────────────────────────────────────────────────────────

  bot.command("start", (ctx) => handleStart(ctx, { miniAppUrl, isAdmin }));

  bot.command("catalog", async (ctx) => {
    const settings = await readSettings();
    await ctx.reply(BUTTON.menu, {
      reply_markup: mainKeyboard({
        miniAppUrl,
        whatsappPhone: settings.whatsappPhone,
      }),
    });
  });

  bot.command("contacts", async (ctx) => {
    await ctx.reply(contacts(await readSettings()));
  });

  bot.command("admin", async (ctx) => {
    const from = ctx.from;
    if (!from || !(await isAdmin(BigInt(from.id)))) {
      // Says nothing about the panel existing.
      await ctx.reply(NOT_ADMIN);
      return;
    }
    const settings = await readSettings();
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
    await ctx.reply(terms(await readSettings()));
  });

  // ── Errors ────────────────────────────────────────────────────────────────

  bot.catch((err) => {
    const e = err.error;
    // Update ids only — an update object carries the user's name and message.
    const where = `update ${err.ctx.update.update_id}`;
    if (e instanceof GrammyError) {
      console.error(
        `Bot API отклонил запрос (${where}): ${e.method} ${e.error_code} ${e.description}`,
      );
    } else if (e instanceof HttpError) {
      console.error(
        `Сеть недоступна (${where}) — проверьте TELEGRAM_API_ROOT:`,
        e.message,
      );
    } else {
      console.error(`Необработанная ошибка (${where}):`, e);
    }
  });

  return bot;
}
