/**
 * Registers the deployed Vercel endpoint with Telegram.
 *
 *   pnpm bot:webhook:set
 *
 * Reads BOT_TOKEN, BOT_WEBHOOK_SECRET, MINI_APP_URL, and DATABASE_URL from
 * .env.production (or ENV_FILE) and .env. The webhook secret is never printed.
 */

import { Api } from "grammy";

import { BUTTON, COMMAND_DESCRIPTION } from "@/bot/texts/ru";
import { loadDotEnv } from "@/lib/env";
import { prisma } from "@/server/db";
import { clientOptions } from "@/server/telegram/client";

loadDotEnv(process.env.ENV_FILE ?? ".env.production");
loadDotEnv(".env");

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} не задан`);
  return value;
}

async function main(): Promise<void> {
  const token = required("BOT_TOKEN");
  const secretToken = required("BOT_WEBHOOK_SECRET");
  const miniAppUrl = required("MINI_APP_URL").replace(/\/+$/, "");
  required("DATABASE_URL");

  if (
    secretToken.length < 32 ||
    secretToken.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(secretToken)
  ) {
    throw new Error("BOT_WEBHOOK_SECRET должен содержать 32–256 символов: A–Z, a–z, 0–9, _ или -");
  }

  const origin = new URL(miniAppUrl);
  if (origin.protocol !== "https:") {
    throw new Error("MINI_APP_URL должен быть HTTPS-адресом production deployment");
  }

  const api = new Api(token, clientOptions());
  const configured = await api.setWebhook(`${origin.origin}/api/telegram/webhook`, {
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    drop_pending_updates: false,
  });
  if (!configured) throw new Error("Telegram не подтвердил установку webhook");
  const webhookUrl = `${origin.origin}/api/telegram/webhook`;

  await api.setMyCommands([
    { command: "start", description: COMMAND_DESCRIPTION.start },
    { command: "catalog", description: COMMAND_DESCRIPTION.catalog },
    { command: "contacts", description: COMMAND_DESCRIPTION.contacts },
  ]);
  await api.setChatMenuButton({
    menu_button: {
      type: "web_app",
      text: BUTTON.menu,
      web_app: { url: origin.origin },
    },
  });

  const admins = await prisma.adminUser.findMany({
    where: { isActive: true },
    select: { telegramId: true },
  });
  const chatIds = new Set(
    admins
      .map((admin) => Number(admin.telegramId))
      .filter((chatId) => Number.isSafeInteger(chatId) && chatId > 0),
  );

  // ADMIN_CHAT_ID is often the owner's private chat, but it may also be a
  // group. Telegram only supports per-chat menu buttons in private chats, so
  // add it when it is a positive Telegram user ID. This also covers owners who
  // have not been added to AdminUser yet.
  const adminChatId = process.env.ADMIN_CHAT_ID?.trim();
  const adminChatIdNumber = adminChatId ? Number(adminChatId) : undefined;
  if (
    adminChatIdNumber !== undefined &&
    Number.isSafeInteger(adminChatIdNumber) &&
    adminChatIdNumber > 0
  ) {
    chatIds.add(adminChatIdNumber);
  }

  let privateMenusVerified = 0;
  for (const chatId of chatIds) {
    try {
      await api.setMyCommands(
        [
          { command: "start", description: COMMAND_DESCRIPTION.start },
          { command: "catalog", description: COMMAND_DESCRIPTION.catalog },
          { command: "contacts", description: COMMAND_DESCRIPTION.contacts },
          { command: "admin", description: COMMAND_DESCRIPTION.admin },
        ],
        { scope: { type: "chat", chat_id: chatId } },
      );
      // A chat-specific button overrides the bot-wide default. Older
      // deployments may have left Railway's URL on an administrator chat, so
      // explicitly point each active admin's button at the current deployment.
      await api.setChatMenuButton({
        chat_id: chatId,
        menu_button: {
          type: "web_app",
          text: BUTTON.menu,
          web_app: { url: origin.origin },
        },
      });
      const currentMenu = await api.getChatMenuButton({ chat_id: chatId });
      if (
        currentMenu.type !== "web_app" ||
        currentMenu.web_app.url !== origin.origin
      ) {
        throw new Error("Telegram не подтвердил адрес личной кнопки меню");
      }
      privateMenusVerified += 1;
    } catch (error) {
      if (chatId === adminChatIdNumber) {
        throw new Error(
          "Не удалось установить личную кнопку меню владельца. Проверьте, что владелец нажал /start в этом боте.",
          { cause: error },
        );
      }
      // Telegram cannot assign per-chat commands or a menu until that admin
      // has started the bot. The commands remain usable by typing them directly.
      console.error("Не удалось установить личную кнопку меню одному из администраторов");
    }
  }

  const globalMenu = await api.getChatMenuButton({});
  if (globalMenu.type !== "web_app" || globalMenu.web_app.url !== origin.origin) {
    throw new Error("Telegram не подтвердил адрес общей кнопки меню");
  }

  const currentWebhook = await api.getWebhookInfo();
  if (currentWebhook.url !== webhookUrl) {
    throw new Error("Telegram изменил адрес webhook во время настройки");
  }

  console.log(`Webhook настроен: ${webhookUrl}`);
  console.log(
    `Кнопка меню Telegram проверена: ${origin.origin} (${privateMenusVerified} личных чата)`,
  );
  await prisma.$disconnect();
}

void main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  if (process.env.DATABASE_URL) {
    await prisma.$disconnect().catch(() => undefined);
  }
  process.exit(1);
});
