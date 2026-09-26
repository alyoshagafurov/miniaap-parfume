import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/**
 * A labelled form control.
 *
 * The label is always a real <label>, never a placeholder: a placeholder
 * disappears the moment someone types, and this form is filled on a phone by
 * people who are interrupted.
 *
 * Errors are tied to the control with aria-describedby and marked
 * aria-invalid, so they are announced rather than only coloured.
 */
export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="caps text-muted">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "bg-surface text-ink border-control placeholder:text-muted focus-visible:border-primary w-full rounded-md border px-3 py-3 text-base transition-colors duration-150 ease-out";

export function TextInput({
  invalid = false,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      {...rest}
      aria-invalid={invalid || undefined}
      className={`${CONTROL} ${invalid ? "border-danger" : ""} ${className}`}
    />
  );
}

export function TextArea({
  invalid = false,
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      {...rest}
      aria-invalid={invalid || undefined}
      className={`${CONTROL} min-h-24 ${invalid ? "border-danger" : ""} ${className}`}
    />
  );
}
