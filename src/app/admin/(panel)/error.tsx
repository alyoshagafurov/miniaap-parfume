"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/Button";

/**
 * When a panel screen throws.
 *
 * Separate from the storefront's because the reader is different and so is the
 * useful response. A buyer is offered the catalog; an administrator is offered
 * the digest, because they are the one who will forward it, and the panel's own
 * navigation, because whatever broke is usually one section.
 *
 * Deliberately blunt about what happened. The storefront softens a failure
 * because a buyer is a guest; the person running the warehouse is better served
 * by being told plainly that the server refused, so they know to stop retrying
 * and call someone.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Ошибка админки", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="py-16 text-center">
      <h1 className="text-ink text-lg font-semibold">Раздел не открылся</h1>
      <p className="text-muted mx-auto mt-3 max-w-md text-sm">
        Сервер вернул ошибку. Данные не пострадали — ничего не сохранялось. Повторите;
        если повторяется, передайте код ниже тому, кто поддерживает систему.
      </p>

      <div className="mt-8 flex flex-col items-center gap-4">
        <Button onClick={reset}>Повторить</Button>
        <Link href="/admin" className="text-primary underline underline-offset-4">
          На главную панели
        </Link>
      </div>

      {error.digest ? (
        <p className="text-muted mt-10 font-mono text-xs">код {error.digest}</p>
      ) : null}
    </div>
  );
}
