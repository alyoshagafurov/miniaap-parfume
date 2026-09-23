import { Suspense } from "react";

import { SettingsForm } from "@/components/admin/SettingsForm";
import { kopToField } from "@/lib/money";
import { requireAdminPage } from "@/server/auth/roles";
import { readSettings } from "@/server/settings";

export const metadata = { title: "Настройки" };

export default function SettingsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-h2 leading-tight font-semibold">Настройки</h1>
      <p className="text-muted mt-2 text-sm">
        Всё, что меняется без перевыпуска: контакты, минимальный заказ, тексты и баннер
        бота. Ничего из этого не зашито в код.
      </p>
      <div className="mt-6">
        <Suspense fallback={<div aria-hidden className="bg-surface h-96 w-full rounded-md" />}>
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
