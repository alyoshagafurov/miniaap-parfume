"use client";

import { roundToPack } from "@/lib/cart";

/**
 * Quantity, in whole packs.
 *
 * Wholesale is sold by the pack, so the buttons step by the pack rather than by
 * one — a stepper that moves in ones when the pack is six makes five of every
 * six taps do nothing visible, which reads as broken.
 *
 * The pack size is stated next to the control rather than left to be inferred
 * from the jump.
 */
export function Stepper({
  qty,
  packSize,
  onChange,
  disabled = false,
  label,
}: {
  qty: number;
  packSize: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const step = Math.max(1, packSize);
  const decrease = () => onChange(Math.max(0, roundToPack(qty - step, step)));
  const increase = () => onChange(roundToPack(qty + step, step));

  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={`Количество: ${label}`}>
      <button
        type="button"
        onClick={decrease}
        disabled={disabled || qty <= 0}
        aria-label="Уменьшить"
        className="border-control text-ink hover:bg-olive-wash disabled:text-muted h-11 w-11 rounded-md border text-lg transition-colors duration-150 ease-out disabled:cursor-not-allowed"
      >
        −
      </button>
      <output
        aria-live="polite"
        className="text-ink w-12 text-center text-base font-medium tabular-nums"
      >
        {qty}
      </output>
      <button
        type="button"
        onClick={increase}
        disabled={disabled}
        aria-label="Увеличить"
        className="border-control text-ink hover:bg-olive-wash disabled:text-muted h-11 w-11 rounded-md border text-lg transition-colors duration-150 ease-out disabled:cursor-not-allowed"
      >
        +
      </button>
    </div>
  );
}
