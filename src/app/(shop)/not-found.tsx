import Link from "next/link";

import { GoldRule } from "@/components/ui/GoldRule";

/**
 * A product, category or brand that is not there.
 *
 * This screen exists because of how buyers reach this catalog. Links are
 * forwarded inside Telegram chats and sit there for months, and an article
 * number that has been withdrawn from the range still has its old address
 * circulating. Without this file Next renders its own bare English page —
 * «404 | This page could not be found» — on a Russian wholesale catalog; and
 * inside the shop layout it rendered nothing at all, leaving a header, a footer
 * and empty space between them.
 *
 * The way out is a search field's worth of intent rather than a back button:
 * somebody who arrived here wanted a specific bottle, and the catalog probably
 * has it under a different article number.
 */
export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      <p className="caps text-muted">Ничего не нашлось</p>
      <h1 className="font-display text-ink text-h1 mt-3 leading-tight font-semibold">
        Такой страницы нет
      </h1>
      <GoldRule className="mx-auto mt-4 w-24" />
      <p className="text-muted mx-auto mt-6 max-w-md text-sm">
        Возможно, товар сняли с продажи или ссылка устарела. Посмотрите каталог или найдите
        нужное по названию либо артикулу.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link href="/" className="text-olive underline underline-offset-4">
          В каталог
        </Link>
        <Link href="/search" className="text-olive underline underline-offset-4">
          Поиск по каталогу
        </Link>
      </div>
    </main>
  );
}
