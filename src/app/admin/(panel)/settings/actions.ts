"use server";

import { z } from "zod";

import { parsePriceToKop } from "@/lib/money";
import { requirePermission } from "@/server/auth/roles";
import { CatalogConflict } from "@/server/catalog/mutations/run";
import { saveSettings } from "@/server/catalog/mutations/settings";
import { fromAction } from "@/server/catalog/revalidate";

/**
 * Settings.
 *
 * `settings:write` rather than `catalog:write`: an EDITOR runs the catalog and
 * the requests, which is the day-to-day work, but the contacts and the minimum
 * order are the owner's — they are what every buyer is shown and what every
 * request is judged against.
 */

const Input = z.object({
  companyName: z.string().trim().min(1).max(200),
  address: z.string().trim().max(300),
  phone: z.string().trim().max(40),
  whatsappPhone: z.string().trim().max(40),
  /** Typed in roubles, stored in kopecks — through the import's own parser. */
  minOrder: z.string().trim().max(30),
  showPrices: z.boolean(),
  deliveryTerms: z.string().trim().max(4000),
  botGreeting: z.string().trim().max(4000),
});

export type SettingsResult = { ok: true } | { ok: false; message: string };

export async function updateSettings(input: unknown): Promise<SettingsResult> {
  await requirePermission("settings:write");

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Проверьте заполнение формы" };

  let minOrderKop: number;
  try {
    minOrderKop = parsePriceToKop(parsed.data.minOrder);
  } catch {
    return { ok: false, message: "Минимальный заказ должен быть числом, например 5000" };
  }
  if (minOrderKop < 0) return { ok: false, message: "Минимальный заказ не может быть отрицательным" };

  try {
    await fromAction(
      saveSettings({
        companyName: parsed.data.companyName,
        address: parsed.data.address,
        phone: parsed.data.phone,
        whatsappPhone: parsed.data.whatsappPhone,
        minOrderKop,
        showPrices: parsed.data.showPrices,
        deliveryTerms: parsed.data.deliveryTerms,
        botGreeting: parsed.data.botGreeting,
      }),
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof CatalogConflict) return { ok: false, message: error.message };
    return { ok: false, message: "Не удалось сохранить. Попробуйте ещё раз." };
  }
}
