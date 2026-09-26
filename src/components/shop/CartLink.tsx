"use client";

import Link from "next/link";

import { useCart } from "@/components/shop/CartProvider";

/**
 * The way back to the request, from anywhere.
 *
 * Hidden until there is something in it: an empty basket icon is a permanent
 * invitation to a dead end. The count is the affordance.
 *
 * A capsule like every other thing you press, with a bag drawn in the rule's
 * stroke weight rather than taken from an icon set — one icon does not earn a
 * library, and a glyph would carry somebody else's line.
 */
export function CartLink() {
  const { count } = useCart();
  if (count === 0) return null;

  return (
    <Link
      href="/cart"
      aria-label={`Заявка, позиций: ${count}`}
      className="bg-primary text-on-night hover:bg-primary-hover inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold tabular-nums transition-colors duration-150 ease-out"
    >
      <svg aria-hidden viewBox="0 0 18 20" className="h-4 w-3.5">
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5h13l-1 12h-11z" />
          <path d="M6 8.5V5a3 3 0 0 1 6 0v3.5" />
        </g>
      </svg>
      {count}
    </Link>
  );
}
