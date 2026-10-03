"use client";

import { useState } from "react";

import { useCart, useCartQty } from "@/components/shop/CartProvider";
import { useHaptics } from "@/components/telegram/provider";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";
import type { CartLine } from "@/lib/cart";
import { roundToPack } from "@/lib/cart";
import { formatQty, maxOrderableQty } from "@/lib/stock";

/**
 * The stepper and the button that puts a product into the request.
 *
 * Two states, not one. Before anything is added, the control is a quantity and
 * a verb — the buyer chooses how many and commits. Afterwards the same place
 * shows what is already in the request and edits it directly, because a second
 * «В заявку» on a line already there raises the obvious question of whether it
 * added twice.
 *
 * The quantity is held locally until it is committed, so a buyer who is still
 * deciding has not yet changed the request in the header.
 */
export function AddToCart({
  line,
  disabled = false,
  disabledReason,
  tone = "light",
}: {
  /** Everything the basket needs, including what the storefront displayed. */
  line: Omit<CartLine, "qty">;
  disabled?: boolean;
  /**
   * Why it cannot be added, when that is not simply «нет в наличии» — a count
   * smaller than one pack, say. A disabled control with no reason beside it
   * reads as broken.
   */
  disabledReason?: string | undefined;
  /** `dark` inside the request bar on a phone. */
  tone?: "light" | "dark";
}) {
  const quiet = tone === "dark" ? "text-on-night-muted" : "text-muted";
  const { add, setQuantity } = useCart();
  const inCart = useCartQty(line.productId);
  const haptics = useHaptics();
  const [draft, setDraft] = useState(() => roundToPack(1, line.seenPackSize));

  // What the shelf holds, in whole packs; unlimited when nothing is counted.
  const stockQty = line.seenStockQty ?? null;
  const max = maxOrderableQty({
    stock: line.seenStock,
    stockQty,
    packSize: line.seenPackSize,
  });
  const step = Math.max(1, line.seenPackSize);
  const note = (qty: number) =>
    stockQty !== null && Number.isFinite(max) && qty + step > max
      ? stockQty === max
        ? `Это весь остаток — ${formatQty(max)} шт`
        : `Максимум ${formatQty(max)} шт, кратно ${step} — на складе ${formatQty(stockQty)}`
      : null;

  if (disabled) {
    return (
      <p className={`${quiet} text-sm`}>
        {disabledReason ??
          "Нет в наличии. Спросите менеджера — возможно, есть под заказ."}
      </p>
    );
  }

  if (inCart > 0) {
    return (
      <div className="flex flex-wrap items-center gap-4">
        <Stepper
          qty={inCart}
          packSize={line.seenPackSize}
          label={line.title}
          tone={tone}
          max={max}
          onChange={(next) => {
            haptics.tap();
            setQuantity(line.productId, next);
          }}
        />
        <p className={`${quiet} text-sm font-semibold`}>В заявке</p>
        {note(inCart) ? (
          <p className={`${quiet} w-full text-sm`}>{note(inCart)}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Stepper
        qty={draft}
        packSize={line.seenPackSize}
        label={line.title}
        tone={tone}
        max={max}
        onChange={setDraft}
      />
      <Button
        variant={tone === "dark" ? "inverse" : "primary"}
        className="flex-1"
        onClick={() => {
          if (draft <= 0) return;
          haptics.tap();
          add({ ...line, qty: draft });
        }}
        disabled={draft <= 0}
      >
        В заявку
      </Button>
      {note(draft) ? <p className={`${quiet} w-full text-sm`}>{note(draft)}</p> : null}
    </div>
  );
}
