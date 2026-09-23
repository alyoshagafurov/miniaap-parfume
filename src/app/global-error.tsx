"use client";

import "./globals.css";

/**
 * The last boundary.
 *
 * Reached only when the root layout itself throws. That layout is what mounts
 * `<html>`, the font variables and the stylesheet link, so this file has to
 * replace the entire document — every other error boundary renders inside a
 * layout that still exists.
 *
 * The stylesheet is imported here explicitly for exactly that reason: without
 * it this route's chunk carries no CSS at all and the page arrives as unstyled
 * black-on-white. With it, the tokens are available and the screen is the same
 * cream, olive and gold as everything else, which is the whole point — the one
 * failure nobody can style around should still look like this business.
 *
 * The typeface is the only thing named inline. `--font-manrope` is set on
 * `<html>` by the root layout through next/font, and the root layout is
 * precisely what is missing here, so `font-sans` would resolve to an undefined
 * variable and fall back to a serif. The system stack is the honest answer.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body
        className="bg-canvas text-ink flex min-h-dvh items-center justify-center px-6 text-center"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        <div className="max-w-sm">
          <p className="text-olive text-2xl leading-none font-semibold">Á</p>

          <h1 className="text-ink mt-6 text-lg font-semibold">
            Каталог временно недоступен
          </h1>

          <hr aria-hidden className="gold-rule mx-auto mt-4 w-16" />

          <p className="text-muted mt-6 text-sm">
            Мы уже знаем о проблеме. Попробуйте через минуту.
          </p>

          {/* Not the shared Button: that component is fine, but importing the
              design system's tree into the boundary that exists for when the
              tree is broken is a way to fail twice. */}
          <button
            type="button"
            onClick={reset}
            className="bg-olive text-surface hover:bg-olive-hover mt-8 inline-flex min-h-11 items-center justify-center rounded-md px-5 font-medium transition-colors"
          >
            Попробовать снова
          </button>

          {error.digest ? (
            // The digest is what ties this screen to a line in the server log,
            // and a buyer reading it out on the phone is how support finds it.
            <p className="text-muted mt-10 font-mono text-xs">код {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
