import { InputFile, type Context } from "grammy";

import { mainKeyboard } from "@/bot/keyboards/main";
import { greeting } from "@/bot/texts/ru";
import { getSettings, rememberBannerFileId } from "@/server/settings";
import { objectUrl } from "@/server/storage/urls";

/**
 * /start.
 *
 * Sends the greeting banner and the three buttons. The banner is uploaded once
 * and its file_id remembered, so every later /start re-sends it by id — an
 * upload per greeting would be slow through the relay and pointless.
 *
 * A start payload (t.me/<bot>?start=p_<slug>) points the catalog button at that
 * product, which is how a shared link opens on the item that was shared.
 */

export interface StartDeps {
  miniAppUrl: string;
  isAdmin: (telegramId: bigint) => Promise<boolean>;
}

export async function handleStart(ctx: Context, deps: StartDeps): Promise<void> {
  const settings = await getSettings();
  const from = ctx.from;
  if (!from) return;

  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  const url = miniAppUrlFor(deps.miniAppUrl, payload);

  const keyboard = mainKeyboard({
    miniAppUrl: url,
    whatsappPhone: settings.whatsappPhone,
    adminUrl: (await deps.isAdmin(BigInt(from.id)))
      ? joinUrl(deps.miniAppUrl, "/admin")
      : undefined,
  });

  const text = greeting(settings, from.first_name);

  // No banner configured yet: a text greeting is a complete, deliberate state,
  // not a degraded one.
  if (!settings.bannerKey) {
    await ctx.reply(text, { reply_markup: keyboard });
    return;
  }

  if (settings.bannerFileId) {
    await ctx.replyWithPhoto(settings.bannerFileId, { caption: text, reply_markup: keyboard });
    return;
  }

  // First send: upload, then remember the id Telegram gives back. A fresh
  // InputFile per send — stream-backed ones are single-use.
  const message = await ctx.replyWithPhoto(new InputFile(new URL(objectUrl(settings.bannerKey))), {
    caption: text,
    reply_markup: keyboard,
  });
  const fileId = message.photo?.at(-1)?.file_id;
  if (fileId) await rememberBannerFileId(fileId);
}

/**
 * Turns a start payload into a Mini App URL.
 *
 * Only the shapes this product issues are honoured, and the slug is restricted
 * to the characters a slug can contain — a start payload is attacker-controlled
 * and must never be pasted into a URL unchecked.
 */
export function miniAppUrlFor(baseUrl: string, payload: string): string {
  const product = /^p_([a-z0-9-]{1,120})$/.exec(payload);
  if (product) return joinUrl(baseUrl, `/p/${product[1]}`);

  const category = /^c_([a-z0-9-]{1,120})$/.exec(payload);
  if (category) return joinUrl(baseUrl, `/c/${category[1]}`);

  return baseUrl;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}
