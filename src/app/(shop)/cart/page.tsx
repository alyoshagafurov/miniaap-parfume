import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { OrderScreen } from "@/components/shop/OrderScreen";
import { readSettings } from "@/server/settings";

export const metadata: Metadata = { title: "Заявка" };

/**
 * The request screen.
 *
 * Settings are read uncached here, unlike everywhere else on the storefront.
 * The project rule is that anything deciding money, a minimum or a right reads
 * fresh data, and this screen is where the minimum order is decided: if the
 * owner raises it, the next request submitted is judged against the new figure,
 * and a buyer told "you have met the minimum" by an hour-old cache and then
 * refused by the server has been lied to by their own screen.
 */
export default function CartPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16">
      <Suspense fallback={<CartSkeleton />}>
        <Screen />
      </Suspense>
    </main>
  );
}

async function Screen() {
  // `readSettings` is deliberately uncached, so unlike the storefront's other
  // reads it carries no suspension point of its own — and an uncached query is
  // still a query the prerender would issue. This screen has no searchParams
  // and no cookie read to make it dynamic on its own, so without this the
  // build opens a connection here. The skeleton below ships in the shell.
  await io();
  const settings = await readSettings();
  return (
    <OrderScreen
      minOrderKop={settings.minOrderKop}
      showPrices={settings.showPrices}
      pickupAddress={settings.address}
    />
  );
}

function CartSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="bg-surface h-8 w-32 rounded-md" />
      <div className="bg-surface h-24 w-full rounded-md" />
      <div className="bg-surface h-24 w-full rounded-md" />
      <div className="bg-surface mt-4 h-11 w-full rounded-md" />
    </div>
  );
}
