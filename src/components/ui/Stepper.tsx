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
  tone = "light",
}: {
  qty: number;
  packSize: number;
  onChange: (next: number) => void;
  disabled?: boolean;
  label: string;
  /** The ground it sits on. `dark` only inside the request bar. */
  tone?: "light" | "dark";
}) {
  const step = Math.max(1, packSize);
  const decrease = () => onChange(Math.max(0, roundToPack(qty - step, step)));
  const increase = () => onChange(roundToPack(qty + step, step));

  // Capsules, like everything else pressed. On the request bar the edge and
  // the mark take the night ground's own light rather than the field colour,
  // which would vanish against it.
  const control =
    tone === "dark"
      ? "border-on-night-muted text-on-night hover:bg-on-night/10 disabled:text-on-night-muted inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50"
      : "border-control text-ink hover:bg-primary-wash disabled:text-muted inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-150 ease-out disabled:cursor-not-allowed";

  return (
    <div
      className="inline-flex items-center gap-1"
      role="group"
      aria-label={`Количество: ${label}`}
    >
      <button
        type="button"
        onClick={decrease}
        disabled={disabled || qty <= 0}
        aria-label="Уменьшить"
        className={control}
      >
        <Stroke d="M4 10h12" />
      </button>
      <output
        aria-live="polite"
        className={`${tone === "dark" ? "text-on-night" : "text-ink"} w-12 text-center text-base font-bold tabular-nums`}
      >
        {qty}
      </output>
      <button
        type="button"
        onClick={increase}
        disabled={disabled}
        aria-label="Увеличить"
        className={control}
      >
        <Stroke d="M4 10h12M10 4v12" />
      </button>
    </div>
  );
}

/**
 * The minus and the plus, drawn.
 *
 * They were the characters «−» and «+», which render in whatever the text face
 * does with them — a different weight and position from every other mark here.
 * Two strokes at the rule's weight match the back arrow, the bag and the menu.
 */
function Stroke({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
