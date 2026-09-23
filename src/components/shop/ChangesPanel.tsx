import { formatRub } from "@/lib/money";
import type { LineChange } from "@/server/orders/reconcile";

const STOCK_LABEL: Record<string, string> = {
  IN_STOCK: "в наличии",
  LOW: "мало",
  OUT: "нет в наличии",
  PREORDER: "под заказ",
};

/**
 * What moved in the catalog while the buyer was assembling the request.
 *
 * Every change is stated as было → стало, on its own line, with the total at the
 * bottom in the same form. The buyer is not asked to accept a difference they
 * have to work out: a request is money, and a total they never saw is not one
 * they agreed to.
 *
 * Deliberately a server-renderable component with no state — it only displays
 * what createOrder sent back, and the decision belongs to the screen around it.
 */
export function ChangesPanel({
  changes,
  totalKop,
  previousTotalKop,
  showPrices,
}: {
  changes: readonly LineChange[];
  totalKop: number;
  previousTotalKop: number;
  showPrices: boolean;
}) {
  return (
    <div className="border-danger bg-danger-wash rounded-md border p-4">
      <h2 className="text-ink text-base font-semibold">Каталог изменился</h2>
      <p className="text-muted mt-1 text-sm">
        Пока вы собирали заявку, склад обновил данные. Проверьте — и отправим.
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {changes.map((change, i) => (
          <li key={`${change.productId}-${change.kind}-${i}`} className="text-sm">
            <span className="text-ink block font-medium">
              {change.title || "Позиция"}
            </span>
            <span className="text-muted">{describe(change, showPrices)}</span>
          </li>
        ))}
      </ul>

      {showPrices && previousTotalKop !== totalKop ? (
        <p className="border-rule text-ink mt-4 border-t pt-3 text-sm">
          Сумма:{" "}
          <s className="text-muted tabular-nums">{formatRub(previousTotalKop)}</s>{" "}
          <span aria-hidden>→</span>{" "}
          <span className="font-semibold tabular-nums">{formatRub(totalKop)}</span>
        </p>
      ) : null}
    </div>
  );
}

function describe(change: LineChange, showPrices: boolean): string {
  switch (change.kind) {
    case "PRICE":
      // With prices hidden there was no number on screen to have changed, so
      // this branch should not be reachable — but saying "было 0 ₽" if it ever
      // is would be worse than saying nothing about the number.
      return showPrices
        ? `Цена: ${formatRub(change.fromKop)} → ${formatRub(change.toKop)}`
        : "Цена изменилась";
    case "STOCK":
      return `Наличие: ${STOCK_LABEL[change.from] ?? change.from} → ${
        STOCK_LABEL[change.to] ?? change.to
      }`;
    case "PACK_SIZE":
      return `Кратность: ${change.from} → ${change.to}, количество ${change.qtyFrom} → ${change.qtyTo}`;
    case "GONE":
      return "Больше не продаётся — уберём из заявки";
  }
}
