"use client";

import Link from "next/link";

import { useCart } from "@/components/shop/CartProvider";

/**
 * The way back to the request, from anywhere.
 *
 * Hidden until there is something in it: an empty basket icon is a permanent
 * invitation to a dead end. The count is the affordance.
 */
export function CartLink() {
  const { count } = useCart();
  if (count === 0) return null;

  return (
    <Link
      href="/cart"
      aria-label={`Заявка, позиций: ${count}`}
      className="bg-olive text-surface hover:bg-olive-hover inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md px-3 text-sm font-medium tabular-nums transition-colors duration-150 ease-out"
    >
      {count}
    </Link>
  );
}
