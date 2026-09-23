"use server";

import { headers } from "next/headers";

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
  const h = await headers();

  // Behind a proxy the socket address is the proxy's. The first entry of
  // x-forwarded-for is the client — spoofable in principle, which is why it is
  // only ever used for rate limiting and never for a decision about the order.
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "unknown";

  const payload = input as { initDataRaw?: unknown } | null;
  const initDataRaw =
    payload && typeof payload.initDataRaw === "string" ? payload.initDataRaw : null;

  return createOrder(input, { initDataRaw, ip });
}
