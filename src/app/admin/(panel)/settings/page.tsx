import { Suspense } from "react";

import { SettingsForm } from "@/components/admin/SettingsForm";
import { kopToField } from "@/lib/money";
import { requireAdminPage } from "@/server/auth/roles";
import { readSettings } from "@/server/settings";

export const metadata = { title: "Настройки" };

export default function SettingsPage() {
  return (
    <>
      <h1 className="display-caps text-ink text-h1">Настройки</h1>
      <p className="text-muted mt-3 text-sm leading-snug">
        Контакты, минимальный заказ и тексты бота. Витрина и бот берут их отсюда.
      </p>
      <div className="mt-6">
        <Suspense fallback={<div aria-hidden className="stage h-96 w-full" />}>
          <Form />
        </Suspense>
      </div>
    </>
  );
}

async function Form() {
  await requireAdminPage("settings:write");
  // readSettings, not the cached wrapper: this screen is where the figures are
  // changed, and showing an hour-old copy of what you just saved is the one
  // thing it must not do.
  const settings = await readSettings();

  return (
    <SettingsForm
      bannerKey={settings.bannerKey}
      initial={{
        companyName: settings.companyName,
        address: settings.address,
        phone: settings.phone,
        whatsappPhone: settings.whatsappPhone,
        minOrder: kopToField(settings.minOrderKop),
        showPrices: settings.showPrices,
        deliveryTerms: settings.deliveryTerms,
        botGreeting: settings.botGreeting,
      }}
    />
  );
}
