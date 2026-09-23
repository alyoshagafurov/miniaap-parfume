import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * A button.
 *
 * Three intents, no more. Every screen in this catalog needs exactly one
 * primary action, a quiet secondary, and an inline text action; a fourth
 * variant would be a decision nobody asked for.
 *
 * The 44px floor comes from globals.css, not from here — this only adds the
 * padding that makes a comfortable target rather than a minimum one.
 */
type Variant = "primary" | "secondary" | "quiet";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-olive text-surface hover:bg-olive-hover active:bg-olive-hover disabled:bg-control",
  secondary:
    "bg-surface text-ink border border-control hover:bg-olive-wash active:bg-olive-wash disabled:text-muted",
  quiet:
    "text-olive underline underline-offset-4 hover:text-olive-hover disabled:text-muted",
};

export function Button({
  variant = "primary",
  fullWidth = false,
  loading = false,
  children,
  className = "",
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}) {
  const shape = variant === "quiet" ? "" : "rounded-md px-5 py-3";
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${VARIANT[variant]} ${shape} ${fullWidth ? "w-full" : ""} inline-flex items-center justify-center gap-2 text-base font-medium transition-colors duration-150 ease-out disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}
