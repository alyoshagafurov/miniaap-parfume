import { webhookCallback } from "grammy";

import { createBot } from "@/bot/bot";

export const maxDuration = 30;

type WebhookHandler = (request: Request) => Promise<Response>;

let handler: WebhookHandler | undefined;

function getHandler(): WebhookHandler | Response {
  if (handler) return handler;

  const token = process.env.BOT_TOKEN?.trim();
  const miniAppUrl = process.env.MINI_APP_URL?.trim();
  const secretToken = process.env.BOT_WEBHOOK_SECRET?.trim();

  if (!token || !miniAppUrl || !secretToken) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  if (
    secretToken.length < 32 ||
    secretToken.length > 256 ||
    !/^[A-Za-z0-9_-]+$/.test(secretToken)
  ) {
    return Response.json({ error: "Webhook is not configured" }, { status: 503 });
  }

  const bot = createBot({ token, miniAppUrl });
  handler = webhookCallback(bot, "std/http", {
    secretToken,
    timeoutMilliseconds: 25_000,
  });

  return handler;
}

export async function POST(request: Request): Promise<Response> {
  const callback = getHandler();
  if (callback instanceof Response) return callback;

  try {
    return await callback(request);
  } catch (error) {
    // Do not log the request body or headers: Telegram updates contain personal
    // data, and the secret-token header must never end up in application logs.
    console.error("Не удалось обработать Telegram webhook:", error);
    return Response.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
