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
  for (const admin of admins) {
    try {
      await api.setMyCommands(
        [
          { command: "start", description: COMMAND_DESCRIPTION.start },
          { command: "catalog", description: COMMAND_DESCRIPTION.catalog },
          { command: "contacts", description: COMMAND_DESCRIPTION.contacts },
          { command: "admin", description: COMMAND_DESCRIPTION.admin },
        ],
        { scope: { type: "chat", chat_id: Number(admin.telegramId) } },
      );
      // A chat-specific button overrides the bot-wide default. Older
      // deployments may have left Railway's URL on an administrator chat, so
      // explicitly point each active admin's button at the current deployment.
      await api.setChatMenuButton({
        chat_id: Number(admin.telegramId),
        menu_button: {
          type: "web_app",
          text: BUTTON.menu,
          web_app: { url: origin.origin },
        },
      });
    } catch {
      // Telegram cannot assign per-chat commands or a menu until that admin
      // has started the bot. The commands remain usable by typing them directly.
    }
  }

  console.log(`Webhook настроен: ${origin.origin}/api/telegram/webhook`);
  await prisma.$disconnect();
}

void main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  if (process.env.DATABASE_URL) {
    await prisma.$disconnect().catch(() => undefined);
  }
  process.exit(1);
});
