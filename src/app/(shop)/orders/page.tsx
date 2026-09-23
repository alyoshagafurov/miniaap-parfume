import type { Metadata } from "next";
import { Suspense } from "react";

import { OrdersScreen } from "@/components/shop/OrdersScreen";
import { getSettings } from "@/server/settings.cached";

export const metadata: Metadata = { title: "Мои заявки" };

/**
 * Past requests.
 *
 * The page supplies only whether prices are shown. Who the buyer is arrives
 * from the client, signed, because the launch string Telegram issues lives in
 * the browser and never reaches the server on its own.
 */
export default function OrdersPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16">
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </main>
  );
}

async function Screen() {
  const settings = await getSettings();
  return <OrdersScreen showPrices={settings.showPrices} />;
}
