import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { CartProvider } from "@/components/shop/CartProvider";
import { CartLink } from "@/components/shop/CartLink";
import { SearchField } from "@/components/shop/SearchField";
import { TelegramProvider } from "@/components/telegram/provider";
import { GoldRule } from "@/components/ui/GoldRule";
import { formatRub } from "@/lib/money";
import { getSettings } from "@/server/settings.cached";

/**
 * The storefront shell.
 *
 * Search sits here rather than on each screen so it is in the same place
 * everywhere — a buyer who has learned where it is should not have to look
 * again after tapping into a category.
 *
 * SearchField and CartLink read the URL and localStorage, so each is wrapped in
 * its own Suspense boundary. useSearchParams outside one builds fine in
 * development and fails `next build`.
 */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const settings = await getSettings();

  return (
    <TelegramProvider>
      <CartProvider>
        <div
          className="flex min-h-dvh flex-col"
          style={{
            paddingTop: "var(--tg-safe-top)",
            paddingBottom: "var(--tg-safe-bottom)",
          }}
        >
          <header className="bg-canvas sticky top-0 z-20">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
              <Link
                href="/"
                className="font-display text-olive inline-flex min-h-11 items-center shrink-0 text-2xl leading-none font-semibold"
              >
                ÁRUMI
              </Link>
              <div className="min-w-0 flex-1">
                <Suspense
                  fallback={
                    <div className="bg-surface border-control h-12 rounded-md border" />
                  }
                >
                  <SearchField />
                </Suspense>
              </div>
              <Suspense fallback={null}>
                <CartLink />
              </Suspense>
            </div>
            <GoldRule />
          </header>

          <div className="flex-1">{children}</div>

          <footer className="border-rule mt-16 border-t">
            <div className="text-muted mx-auto w-full max-w-3xl px-4 py-8 text-sm">
              <p className="text-ink">{settings.companyName}</p>
              {settings.address ? <p className="mt-1">{settings.address}</p> : null}
              <p className="mt-1">
                Минимальный заказ {formatRub(settings.minOrderKop)}
              </p>
              {settings.phone ? (
                <p className="mt-3">
                  <a
                    href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}
                    className="text-olive inline-flex min-h-11 items-center underline underline-offset-4"
                  >
                    {settings.phone}
                  </a>
                </p>
              ) : null}
            </div>
          </footer>
        </div>
      </CartProvider>
    </TelegramProvider>
  );
}
