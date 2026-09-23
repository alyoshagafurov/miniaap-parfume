"use client";

import { useState } from "react";

import { useCart, useCartQty } from "@/components/shop/CartProvider";
import { useHaptics } from "@/components/telegram/provider";
import { Button } from "@/components/ui/Button";
import { Stepper } from "@/components/ui/Stepper";
import type { CartLine } from "@/lib/cart";
import { roundToPack } from "@/lib/cart";

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
}: {
  /** Everything the basket needs, including what the storefront displayed. */
  line: Omit<CartLine, "qty">;
  disabled?: boolean;
}) {
  const { add, setQuantity } = useCart();
  const inCart = useCartQty(line.productId);
  const haptics = useHaptics();
  const [draft, setDraft] = useState(() => roundToPack(1, line.seenPackSize));

  if (disabled) {
    return (
      <p className="text-muted text-sm">
        Нет в наличии. Спросите менеджера — возможно, есть под заказ.
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
          onChange={(next) => {
            haptics.tap();
            setQuantity(line.productId, next);
          }}
        />
        <p className="text-muted text-sm">В заявке</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Stepper qty={draft} packSize={line.seenPackSize} label={line.title} onChange={setDraft} />
      <Button
        onClick={() => {
          if (draft <= 0) return;
          haptics.tap();
          add({ ...line, qty: draft });
        }}
        disabled={draft <= 0}
      >
        В заявку
      </Button>
    </div>
  );
}
