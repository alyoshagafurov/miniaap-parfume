"use server";

import { clientIp } from "@/server/client-ip";
import { createOrder, type CreateOrderResult } from "@/server/orders/create";

/**
 * Submitting a request.
 *
 * A thin edge: it establishes who is asking and from where, and hands the rest
 * to createOrder, which is where every rule lives and where everything is
 * tested. Nothing is validated twice in two places, because two places drift.
 *
 * The whole payload arrives as `unknown` on purpose. A Server Action is a
 * public endpoint reachable with any body, and the schema inside createOrder is
 * the only thing that decides what a request is.
 */
export async function submitOrder(input: unknown): Promise<CreateOrderResult> {
  const ip = await clientIp();

  // No address, no submission. The alternative — one shared bucket called
  // "unknown" — would put every caller on a single five-per-ten-minutes budget
  // the moment a header went missing, and quietly stop the shop taking orders.
  if (!ip) {
    return {
      ok: false,
      reason: "RATE_LIMITED",
      message: "Сервис временно недоступен. Попробуйте через минуту.",
    };
  }

  const payload = input as { initDataRaw?: unknown } | null;
  const initDataRaw =
    payload && typeof payload.initDataRaw === "string" ? payload.initDataRaw : null;

  return createOrder(input, { initDataRaw, ip });
}
