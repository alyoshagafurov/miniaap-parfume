"use server";

import { z } from "zod";

import {
  listOrdersFor,
  repeatOrderFor,
  type BuyerIdentity,
  type HistoryOrder,
  type RepeatResult,
} from "@/server/orders/history";
import { currentBuyerHash } from "@/server/orders/web-buyer";
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

// Optional: a buyer in an ordinary browser has no launch string at all.
const InitData = z.object({ initDataRaw: z.string().min(1).max(4096).optional() });

/**
 * Both identities, each proven its own way: the Telegram id from the signature,
 * the browser key from an httpOnly cookie the buyer's own browser holds. Neither
 * ever comes from the payload.
 */
async function identify(input: unknown): Promise<BuyerIdentity> {
  const parsed = InitData.safeParse(input ?? {});
  const raw = parsed.success ? parsed.data.initDataRaw : undefined;
  const result = raw ? verifyInitData(raw, process.env.BOT_TOKEN) : null;
  // The reason is deliberately not returned and not logged: it is of no use to
  // the buyer, and the string it came from carries their name and id.
  return {
    telegramId: result?.ok ? result.user.telegramId : null,
    webBuyerHash: await currentBuyerHash(),
  };
}

export async function listMyOrders(input: unknown): Promise<HistoryOrder[]> {
  return listOrdersFor(await identify(input));
}

const RepeatInput = z.object({ orderId: z.string().min(1).max(64) });

export async function repeatOrder(input: unknown): Promise<RepeatResult> {
  const parsed = RepeatInput.safeParse(input);
  if (!parsed.success) return { lines: [], unavailable: [] };

  const result = await repeatOrderFor(parsed.data.orderId, await identify(input));
  return result ?? { lines: [], unavailable: [] };
}
