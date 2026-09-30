/**
 * The vocabulary of a request.
 *
 * Client-safe, and that is the whole reason it exists. The statuses and their
 * labels are needed by a chip a manager taps and by the server module that
 * writes them; putting them in the server module drags `next/headers` — by way
 * of the permission guards — into the browser bundle, where Next reports it as
 * a Pages Router error and sends you looking in the wrong place entirely.
 *
 * Same split as src/lib/list-url.ts, for the same reason.
 */

export const ORDER_STATUSES = ["NEW", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
};

/**
 * The ways a new request may be shipped, in the order the form shows them.
 *
 * One list for both ends: the order form draws its choices from it and the
 * server refuses anything outside it. CDEK and Russian Post were dropped when
 * the client moved to Ozon; a form cached in someone's Mini App from before
 * that is refused rather than recorded with a carrier the warehouse no longer
 * uses.
 */
export const OFFERED_DELIVERY = ["OZON", "TRANSPORT_COMPANY", "PICKUP"] as const;
export type OfferedDelivery = (typeof OFFERED_DELIVERY)[number];

/**
 * What every delivery value is called — the offered ones and the retired ones.
 *
 * CDEK and Russian Post stay here on purpose: requests placed with them are
 * still in the panel and in buyers' «Мои заявки», and must keep saying how
 * they were sent.
 */
export const DELIVERY_LABELS: Record<string, string> = {
  OZON: "OZON",
  TRANSPORT_COMPANY: "Транспортная компания",
  PICKUP: "Самовывоз",
  CDEK: "СДЭК",
  RUSSIAN_POST: "Почта России",
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value)
  );
}
