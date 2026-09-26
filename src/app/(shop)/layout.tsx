import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { CartProvider } from "@/components/shop/CartProvider";
import { CartLink } from "@/components/shop/CartLink";
import { MainMenu } from "@/components/shop/MainMenu";
import { SearchField } from "@/components/shop/SearchField";
import { TelegramProvider } from "@/components/telegram/provider";
import { GoldRule } from "@/components/ui/GoldRule";
import { formatRub } from "@/lib/money";
import { getCategories } from "@/server/catalog/queries";
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
 *
 * ── Why the layout itself reads nothing ──
 *
 * It used to await `getSettings()` in its own body for the footer. A layout
 * wraps every route beneath it, so one call there put a database read in front
 * of every storefront screen's shell — the whole page waited on the footer.
 *
 * The footer is the only thing that wanted the data, so the footer is what
 * streams, behind a skeleton of its own height.
 *
 * The boundary alone did NOT make `next build` independent of the database,
 * and this comment once claimed it did. Under `cacheComponents` a prerender
 * executes `'use cache'` functions to fill their entries, and a boundary
 * decides where a result lands, not whether it is computed at build.
 *
 * What does make the build independent of the database is the `io()` that
 * `getSettings` now awaits before the cached read — a suspension point ahead
 * of the query rather than around it. See src/server/catalog/queries.ts for
 * the full reasoning; the effect here is that this skeleton is what the build
 * emits, and the footer's text arrives on the first real request.
 */
export default function ShopLayout({ children }: { children: ReactNode }) {
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
          {/*
            Two rows, not one.

            Wordmark, search and basket shared a single row, and on a 390px
            screen the field that everything else was competing with ended up
            about half the width — too narrow to read a typed article number
            back. Adding a menu button to that row would have taken another
            44px from it. So the controls keep the top row and the field gets
            one of its own, full width, which is also where a thumb reaches it.
          */}
          <header className="bg-canvas sticky top-0 z-20">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pt-3">
              <Suspense
                fallback={<span aria-hidden className="h-11 w-11 shrink-0" />}
              >
                <Menu />
              </Suspense>
              <Link
                href="/"
                className="font-wordmark text-wordmark inline-flex min-h-11 flex-1 items-center text-2xl leading-none font-semibold"
              >
                ÁRUMI
              </Link>
              <Suspense fallback={null}>
                <CartLink />
              </Suspense>
            </div>
            <div className="mx-auto w-full max-w-3xl px-4 pt-2 pb-3">
              <Suspense
                fallback={
                  <div className="bg-surface border-control h-12 rounded-md border" />
                }
              >
                <SearchField />
              </Suspense>
            </div>
            <GoldRule />
          </header>

          <div className="flex-1">{children}</div>

          <Suspense fallback={<FooterSkeleton />}>
            <Footer />
          </Suspense>
        </div>
      </CartProvider>
    </TelegramProvider>
  );
}

/**
 * The categories the menu lists.
 *
 * Its own boundary in the header, so the shell — wordmark, basket, search —
 * ships without waiting on a database read. The button holds its 44px while
 * the list arrives, so nothing beside it moves when it does.
 */
async function Menu() {
  const categories = await getCategories();
  return (
    <MainMenu
      categories={categories.map((c) => ({
        name: c.name,
        slug: c.slug,
        productCount: c.productCount,
      }))}
    />
  );
}

/**
 * The footer: who this is, where, on what terms, and the number to call.
 *
 * Streamed rather than prerendered — see the note on the layout. Its skeleton
 * holds the same height so the page does not grow a footer's worth of pixels
 * under the buyer's thumb as it arrives.
 *
 * It closes the page in the same voice as the rest: the name in heavy capitals,
 * the minimum in amber because it is money, the telephone as a capsule because
 * it is the thing to press. It used to be a hairline and a column of plain
 * lines with an underlined number — the one part of the storefront still
 * speaking the direction this replaced.
 */
async function Footer() {
  const settings = await getSettings();

  return (
    <footer className="mt-16">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-10">
        <p className="display-caps text-ink text-lg">{settings.companyName}</p>
        {settings.address ? (
          <p className="text-muted mt-3 text-sm leading-snug">{settings.address}</p>
        ) : null}
        <p className="text-muted mt-1 text-sm">
          Минимальный заказ{" "}
          <span className="text-price font-bold tabular-nums">
            {formatRub(settings.minOrderKop)}
          </span>
        </p>
        {settings.phone ? (
          <a
            href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`}
            className="border-control text-ink hover:bg-primary-wash mt-5 inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold tabular-nums transition-colors"
          >
            {settings.phone}
          </a>
        ) : null}
      </div>
    </footer>
  );
}

function FooterSkeleton() {
  return (
    <footer aria-hidden className="mt-16">
      <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-10">
        <div className="bg-primary-wash h-5 w-48 rounded-md" />
        <div className="bg-primary-wash mt-3 h-4 w-64 rounded-md" />
        <div className="bg-primary-wash mt-2 h-4 w-44 rounded-md" />
        <div className="bg-primary-wash mt-5 h-11 w-40 rounded-full" />
      </div>
    </footer>
  );
}
