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

export interface NotifyResult {
  managerNotified: boolean;
  buyerNotified: boolean;
  error?: string;
}

/** Telegram answers 403 when the user has blocked the bot. */
function isBlocked(error: unknown): boolean {
  const e = error as { error_code?: number; description?: string };
  return (
    e?.error_code === 403 ||
    /blocked|bot was blocked|deactivated/i.test(e?.description ?? "")
  );
}

export async function notifyNewOrder(
  api: Api,
  deps: NotifyDeps,
  order: OrderNotification,
  settings: { showPrices: boolean },
): Promise<NotifyResult> {
  const result: NotifyResult = { managerNotified: false, buyerNotified: false };

  // The manager first: this is the part the business runs on.
  if (deps.adminChatId) {
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
      result.error = error instanceof Error ? error.message : String(error);
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
      } else if (!result.error) {
        result.error = error instanceof Error ? error.message : String(error);
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
