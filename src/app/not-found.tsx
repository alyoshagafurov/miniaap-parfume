import Link from "next/link";

/**
 * Anything outside the storefront and the panel.
 *
 * The storefront has its own, rendered inside the shop chrome. This one catches
 * everything else — a mistyped /admin path, a stale link to a route that was
 * never there — and exists so that no address in this project can answer in
 * English with a bare «404 | This page could not be found».
 *
 * Deliberately without the shop header: it is reached from addresses that have
 * nothing to do with the catalog, and dressing it as the catalog would suggest
 * the buyer is somewhere they are not.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center px-4 py-16 text-center">
      <p className="font-display text-olive text-4xl leading-none font-semibold">Á</p>
      <h1 className="font-display text-ink text-h1 mt-6 leading-tight font-semibold">
        Страница не найдена
      </h1>
      <p className="text-muted mt-4 max-w-md text-sm">
        Проверьте адрес — или откройте каталог.
      </p>
      <Link href="/" className="text-olive mt-8 underline underline-offset-4">
        В каталог
      </Link>
    </main>
  );
}
