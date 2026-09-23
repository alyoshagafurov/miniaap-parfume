"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  addLine,
  cartCount,
  cartTotalKop,
  readCart,
  removeLine,
  setQty,
  writeCart,
  type CartLine,
} from "@/lib/cart";

/**
 * The basket, shared across screens.
 *
 * Like the Telegram provider, this reads a module-level store through
 * useSyncExternalStore rather than holding component state. The basket lives in
 * localStorage, which is external to React, and the server snapshot is an empty
 * basket — so the server-rendered paint shows no count and the real one arrives
 * on hydration, instead of flashing a wrong number.
 *
 * All the logic is in src/lib/cart.ts. This only holds the current value and
 * tells React when it changes.
 */

interface CartApi {
  lines: CartLine[];
  count: number;
  /** What the buyer currently sees. Display only; the server reprices. */
  totalKop: number;
  add: (line: CartLine) => void;
  setQuantity: (productId: string, qty: number) => void;
  remove: (productId: string) => void;
  replace: (lines: CartLine[]) => void;
  clear: () => void;
}

/** Stable empty array: a fresh one per render would loop useSyncExternalStore. */
const EMPTY: CartLine[] = [];

let lines: CartLine[] = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  if (!hydrated) {
    hydrated = true;
    lines = readCart();
  }
  listeners.add(onChange);

  // Another tab is the same buyer with the same basket. Keeping them in step
  // costs one listener and avoids submitting a request built from a basket
  // they already emptied somewhere else.
  const onStorage = () => {
    lines = readCart();
    emit();
  };
  globalThis.addEventListener?.("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    globalThis.removeEventListener?.("storage", onStorage);
  };
}

function commit(next: CartLine[]) {
  lines = next;
  writeCart(next);
  emit();
}

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const current = useSyncExternalStore(
    subscribe,
    () => lines,
    () => EMPTY,
  );

  const add = useCallback((line: CartLine) => commit(addLine(lines, line)), []);
  const setQuantity = useCallback(
    (productId: string, qty: number) => commit(setQty(lines, productId, qty)),
    [],
  );
  const remove = useCallback(
    (productId: string) => commit(removeLine(lines, productId)),
    [],
  );
  const replace = useCallback((next: CartLine[]) => commit(next), []);
  const clear = useCallback(() => commit([]), []);

  const value = useMemo<CartApi>(
    () => ({
      lines: current,
      count: cartCount(current),
      totalKop: cartTotalKop(current),
      add,
      setQuantity,
      remove,
      replace,
      clear,
    }),
    [current, add, setQuantity, remove, replace, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart используется вне CartProvider");
  return ctx;
}

/** How many of one product are already in the basket. */
export function useCartQty(productId: string): number {
  const { lines: current } = useCart();
  return current.find((l) => l.productId === productId)?.qty ?? 0;
}
