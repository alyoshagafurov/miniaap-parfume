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

export const DELIVERY_LABELS: Record<string, string> = {
  CDEK: "СДЭК",
  RUSSIAN_POST: "Почта России",
  TRANSPORT_COMPANY: "Транспортная компания",
  PICKUP: "Самовывоз",
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value)
  );
}
