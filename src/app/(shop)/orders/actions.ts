"use server";

import { z } from "zod";

import {
  listOrdersFor,
  repeatOrderFor,
  type HistoryOrder,
  type RepeatResult,
} from "@/server/orders/history";
import { verifyInitData } from "@/server/telegram/init-data";

/**
 * A buyer's own requests.
 *
 * Both actions establish the identity from the signed launch string and nothing
 * else. A Server Action is a public endpoint: an id in the arguments is a claim,
 * not a fact, so the Telegram id never comes from the payload — it comes from
 * the signature, and the query is scoped by it.
 *
 * Failure is uniform. "Not verified" and "no such order" return the same empty
 * answer, so the action cannot be used to learn whether an order id exists.
 */

const InitData = z.object({ initDataRaw: z.string().min(1).max(4096) });

function identify(input: unknown): bigint | null {
  const parsed = InitData.safeParse(input);
  if (!parsed.success) return null;
  const result = verifyInitData(parsed.data.initDataRaw, process.env.BOT_TOKEN);
  // The reason is deliberately not returned and not logged: it is of no use to
  // the buyer, and the string it came from carries their name and id.
  return result.ok ? result.user.telegramId : null;
}

export async function listMyOrders(input: unknown): Promise<HistoryOrder[]> {
  const telegramId = identify(input);
  if (!telegramId) return [];
  return listOrdersFor(telegramId);
}

const RepeatInput = InitData.extend({ orderId: z.string().min(1).max(64) });

export async function repeatOrder(input: unknown): Promise<RepeatResult> {
  const telegramId = identify(input);
  const parsed = RepeatInput.safeParse(input);
  if (!telegramId || !parsed.success) return { lines: [], unavailable: [] };

  const result = await repeatOrderFor(parsed.data.orderId, telegramId);
  return result ?? { lines: [], unavailable: [] };
}
