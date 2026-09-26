import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * A filter chip.
 *
 * The one place the direction allows a full radius — everything else is 10px.
 * Selected state is carried by colour AND by aria-pressed, never by colour
 * alone.
 */
export function Chip({
  selected = false,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={`${
        selected
          ? "bg-primary text-surface border-primary"
          : "bg-surface text-ink border-control hover:bg-primary-wash"
      } inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors duration-150 ease-out ${className}`}
    >
      {children}
    </button>
  );
}
