import type { Update } from "grammy/types";
import { beforeAll, describe, expect, it } from "vitest";

import { createBot } from "./bot";

/**
 * The bot, stood up in plain Node.
 *
 * No Next runtime, no request context, no network. This is the exact condition
 * under which `pnpm bot` runs in production, and the condition a `'use cache'`
 * directive anywhere in the reachable graph breaks — which already happened
 * once, silently, to five separate handlers.
 *
 * `pnpm check:bot-boundary` catches that statically by walking the import
 * graph. This catches it dynamically: every command actually runs, so a module
 * that throws on import or on first call fails the test rather than failing a
 * customer.
 *
 * Network is replaced by grammY's documented mocking hook — a transformer that
 * answers without calling `prev` performs no I/O at all — so what is exercised
 * is the real handler stack and the real payload it would have sent.
 */

const hasDb = Boolean(process.env.DATABASE_URL);

const BOT_INFO = {
  id: 90_000_000,
  is_bot: true as const,
  first_name: "ARUMI test",
  username: "arumi_test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  // Bot API 10.x additions; grammY 1.46 types require the full shape.
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

const MINI_APP_URL = "https://arumi.example.ru";

/** A Telegram id that cannot collide with seeded demo data. */
const USER_ID = 90_000_001;

function harness() {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const bot = createBot({
    token: "1:test",
    miniAppUrl: MINI_APP_URL,
    botInfo: BOT_INFO,
  });
  bot.api.config.use((_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
  });
  return { bot, calls };
}

let updateId = 1;

function messageUpdate(text: string): Update {
  return {
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: 1_800_000_000,
      chat: { id: USER_ID, type: "private", first_name: "Тест" },
      from: { id: USER_ID, is_bot: false, first_name: "Тест", username: "tester" },
      text,
      entities: text.startsWith("/")
        ? [{ type: "bot_command", offset: 0, length: text.split(" ")[0]!.length }]
        : undefined,
    },
  } as Update;
}

function callbackUpdate(data: string): Update {
  return {
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from: { id: USER_ID, is_bot: false, first_name: "Тест", username: "tester" },
      chat_instance: "-1",
      data,
      message: {
        message_id: updateId,
        date: 1_800_000_000,
        chat: { id: USER_ID, type: "private", first_name: "Тест" },
        text: "prev",
      },
    },
  } as Update;
}

describe.skipIf(!hasDb)(
  "the bot runs in plain Node, with no Next and no network",
  () => {
    beforeAll(async () => {
      // A settings row must exist; the handlers read it.
      const { ensureSettings } = await import("@/server/settings");
      await ensureSettings();
    });

    it("builds without touching the network", async () => {
      // botInfo supplied means grammY skips getMe entirely.
      const { bot, calls } = harness();
      await bot.init();
      expect(calls).toHaveLength(0);
    });

    it("answers /start", async () => {
      const { bot, calls } = harness();
      await bot.init();
      await bot.handleUpdate(messageUpdate("/start"));

      // No banner is configured, so the greeting is text — a complete state.
      const sent = calls.find(
        (c) => c.method === "sendMessage" || c.method === "sendPhoto",
      );
      expect(sent, JSON.stringify(calls)).toBeDefined();
      const markup = sent?.payload.reply_markup as
        { inline_keyboard: Array<Array<{ text: string }>> } | undefined;
      expect(markup?.inline_keyboard.flat().map((b) => b.text)).toContain(
        "Открыть каталог",
      );
    });

    it("answers /catalog with a Mini App button", async () => {
      const { bot, calls } = harness();
      await bot.init();
      await bot.handleUpdate(messageUpdate("/catalog"));

      const sent = calls.find((c) => c.method === "sendMessage");
      expect(sent).toBeDefined();
      const markup = sent?.payload.reply_markup as
        | { inline_keyboard: Array<Array<{ text: string; web_app?: { url: string } }>> }
        | undefined;
      const button = markup?.inline_keyboard.flat().find((b) => b.web_app);
      expect(button?.web_app?.url).toBe(MINI_APP_URL);
    });

    it("answers /contacts from Settings, not from a literal", async () => {
      const { bot, calls } = harness();
      const { readSettings } = await import("@/server/settings");
      const settings = await readSettings();

      await bot.init();
      await bot.handleUpdate(messageUpdate("/contacts"));

      const text = String(
        calls.find((c) => c.method === "sendMessage")?.payload.text ?? "",
      );
      expect(text).toContain(settings.companyName);
    });

    it("refuses /admin to someone who is not an administrator", async () => {
      const { bot, calls } = harness();
      await bot.init();
      await bot.handleUpdate(messageUpdate("/admin"));

      const text = String(
        calls.find((c) => c.method === "sendMessage")?.payload.text ?? "",
      );
      expect(text).toContain("администратор");
      // It must not link to the panel, or its existence is confirmed anyway.
      expect(JSON.stringify(calls)).not.toContain("/admin");
    });

    it("answers the «Условия и доставка» callback", async () => {
      const { bot, calls } = harness();
      await bot.init();
      await bot.handleUpdate(callbackUpdate("terms"));

      // The callback must be acknowledged, or Telegram shows a spinner forever.
      expect(calls.some((c) => c.method === "answerCallbackQuery")).toBe(true);
      expect(calls.some((c) => c.method === "sendMessage")).toBe(true);
    });

    it("records the sender, so the notifier knows who is reachable", async () => {
      const { bot } = harness();
      const { prisma } = await import("@/server/db");
      await bot.init();
      await bot.handleUpdate(messageUpdate("/start"));

      const user = await prisma.telegramUser.findUnique({
        where: { telegramId: BigInt(USER_ID) },
        select: { firstName: true, botBlocked: true },
      });
      expect(user?.firstName).toBe("Тест");
      expect(user?.botBlocked).toBe(false);
    });

    it("uses no emoji in anything it says", async () => {
      const { bot, calls } = harness();
      await bot.init();
      for (const command of ["/start", "/catalog", "/contacts", "/admin"]) {
        await bot.handleUpdate(messageUpdate(command));
      }
      await bot.handleUpdate(callbackUpdate("terms"));

      expect(/\p{Extended_Pictographic}/u.test(JSON.stringify(calls))).toBe(false);
    });
  },
);
