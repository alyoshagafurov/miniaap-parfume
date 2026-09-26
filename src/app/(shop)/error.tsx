"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/Button";
import { GoldRule } from "@/components/ui/GoldRule";

/**
 * When a storefront screen throws.
 *
 * There was no boundary here at all, which meant a failed query — a database
 * that blinked, an S3 that timed out — put Next's own unstyled error page in
 * front of a buyer, in English, with a reload button and no way back to the
 * catalog. The brief asks that errors look like part of the design, and the
 * reason is commercial rather than aesthetic: this audience is standing on a
 * market floor deciding whether this supplier is serious.
 *
 * Retry first, because most of what reaches here is transient. The catalog
 * second, because the buyer came to buy something and the failure was probably
 * one screen rather than all of them.
 *
 * The message is deliberately not the exception's. `error.message` in
 * production is a digest — «An error occurred in the Server Components render»
 * — which tells a wholesaler nothing and tells an attacker slightly more than
 * nothing. The digest is logged instead, where support can match it.
 */
export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Console, not a service: there is no error reporting in stage 1 and
    // pretending otherwise would hide this until someone went looking.
    console.error("Ошибка витрины", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      <p className="caps text-muted">Не открылось</p>
      <h1 className="font-display text-ink text-h1 mt-3 leading-tight font-semibold">
        Что-то пошло не так
      </h1>
      <GoldRule className="mx-auto mt-4 w-24" />
      <p className="text-muted mx-auto mt-6 max-w-md text-sm">
        Страница не загрузилась. Обычно помогает повторить — если нет, напишите или
        позвоните нам, заявку примем вручную.
      </p>

      <div className="mt-8 flex flex-col items-center gap-4">
        <Button onClick={reset}>Попробовать снова</Button>
        <Link href="/" className="text-primary underline underline-offset-4">
          В каталог
        </Link>
      </div>

      {error.digest ? (
        // The one thing worth showing: the digest is what ties this screen to a
        // line in the server log, and a buyer reading it out on the phone is
        // how support finds that line.
        <p className="text-muted mt-10 font-mono text-xs">код {error.digest}</p>
      ) : null}
    </main>
  );
}
