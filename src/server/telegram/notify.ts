import type { Api } from "grammy";

import { orderKeyboard } from "@/bot/keyboards/main";
import {
  loginCode as loginCodeText,
  orderAccepted,
  orderForManager,
} from "@/bot/texts/ru";

/**
 * Telling people about a request.
 *
 * Nothing here is allowed to fail a submission. By the time these run the
 * request is already recorded and the buyer has been told it went through —
 * losing it because a relay was briefly unreachable would be the worst possible
 * trade. Every failure is caught and reported in the return value; the admin
 * panel remains the system of record either way.
 *
 * Reported, not logged, here: the caller knows the order number, which is what
 * makes a log line useful, and this module knows only what it was handed.
 */

export interface NotifyDeps {
  /** Telegram chat that receives new requests. Null disables the notification. */
  adminChatId: string | null;
  adminOrderUrl: (orderId: string) => string;
  /** Records that a user has blocked the bot, so future sends skip them. */
  markBlocked: (telegramId: bigint) => Promise<void>;
}

export interface OrderNotification {
  orderId: string;
  number: string;
  name: string;
  phone: string;
  city: string;
  delivery: string;
  comment: string | null;
  totalKop: number;
  username: string | null;
  /** Null for a web buyer, who has no Telegram to be written to. */
  telegramId: bigint | null;
  lines: Array<{ title: string; sku: string; qty: number; lineTotalKop: number }>;
}

/**
 * What happened, with the reasons in words safe to log.
 *
 * The manager's and the buyer's outcomes are reported apart. They used to share
 * one `error`, which held whichever failed first — so a log line built from it
 * could blame the manager's chat for the buyer's problem, or the other way round.
 */
export interface NotifyResult {
  managerNotified: boolean;
  buyerNotified: boolean;
  /** Why the manager was not told. Set whenever managerNotified is false. */
  managerError?: string;
  /** Why the buyer was not told, when it was not simply that they blocked the bot. */
  buyerError?: string;
}

/** Telegram answers 403 when the user has blocked the bot. */
function isBlocked(error: unknown): boolean {
  const e = error as { error_code?: number; description?: string };
  return (
    e?.error_code === 403 ||
    /blocked|bot was blocked|deactivated/i.test(e?.description ?? "")
  );
}

/**
 * An error, reduced to text that can go to a log.
 *
 * Only the message, never the error object. A GrammyError carries the request
 * it failed on as `payload` — the chat id and the whole notification, with the
 * buyer's name, phone and basket — and a logger that prints the object prints
 * all of it. The message itself is grammY's «Call to 'sendMessage' failed!
 * (400: Bad Request: chat not found)» or «Network request for 'sendMessage'
 * failed!», which names a method and Telegram's reason and nobody at all.
 */
function loggable(error: unknown): string {
  return error instanceof Error ? error.message : "неизвестная ошибка";
}

/**
 * The manager's failure, with the fix when the cause is the usual one.
 *
 * «chat not found» and a 403 are what a wrong ADMIN_CHAT_ID produces, and also
 * a right one whose owner has never pressed /start — a bot may not write first
 * to anyone. Both are fixed by a person, not by a retry, so the log says which
 * person and what to press.
 */
function describeManagerFailure(error: unknown): string {
  const e = error as { error_code?: number; description?: string };
  const recipient =
    e?.error_code === 403 || /chat not found/i.test(e?.description ?? "");
  return recipient
    ? `${loggable(error)}. Проверьте ADMIN_CHAT_ID: получатель должен нажать /start ` +
        "в боте, а в группе должен быть сам бот"
    : loggable(error);
}

export async function notifyNewOrder(
  api: Api,
  deps: NotifyDeps,
  order: OrderNotification,
  settings: { showPrices: boolean },
): Promise<NotifyResult> {
  const result: NotifyResult = { managerNotified: false, buyerNotified: false };

  // The manager first: this is the part the business runs on.
  if (!deps.adminChatId) {
    result.managerError = "ADMIN_CHAT_ID не задан, новые заявки видны только в админке";
  } else {
    try {
      await api.sendMessage(
        deps.adminChatId,
        orderForManager({
          number: order.number,
          name: order.name,
          phone: order.phone,
          city: order.city,
          delivery: order.delivery,
          comment: order.comment,
          totalKop: order.totalKop,
          showPrices: settings.showPrices,
          lines: order.lines,
          username: order.username,
        }),
        { reply_markup: orderKeyboard(deps.adminOrderUrl(order.orderId)) },
      );
      result.managerNotified = true;
    } catch (error) {
      result.managerError = describeManagerFailure(error);
    }
  }

  // Then the buyer, if Telegram vouched for who they are.
  if (order.telegramId !== null) {
    try {
      await api.sendMessage(
        String(order.telegramId),
        orderAccepted(order.number, order.totalKop, settings.showPrices),
      );
      result.buyerNotified = true;
    } catch (error) {
      if (isBlocked(error)) {
        // Cheaper to learn it here than to keep retrying on every future send.
        await deps.markBlocked(order.telegramId).catch(() => undefined);
      } else {
        result.buyerError = loggable(error);
      }
    }
  }

  return result;
}

/**
 * Sends an administrator their one-time login code.
 *
 * Returns whether it arrived, so the login screen can say "we could not reach
 * your Telegram" rather than leaving someone waiting for a message that is
 * never coming.
 */
export async function sendLoginCode(
  api: Api,
  telegramId: bigint,
  code: string,
  ttlMinutes: number,
): Promise<boolean> {
  try {
    await api.sendMessage(String(telegramId), loginCodeText(code, ttlMinutes));
    return true;
  } catch {
    // The code itself must never reach a log.
    return false;
  }
}
