import { InlineKeyboard } from "grammy";

import { BUTTON } from "@/bot/texts/ru";

/**
 * The greeting keyboard.
 *
 * Three buttons, in the order a buyer needs them: open the catalog, read the
 * terms, or reach a human. The admin panel is a fourth button that only
 * administrators are ever sent — clients never see that it exists.
 */

export interface MainKeyboardOptions {
  miniAppUrl: string;
  whatsappPhone: string;
  /** Only passed for administrators. */
  adminUrl?: string | undefined;
}

export function mainKeyboard({
  miniAppUrl,
  whatsappPhone,
  adminUrl,
}: MainKeyboardOptions): InlineKeyboard {
  const kb = new InlineKeyboard()
    .webApp(BUTTON.catalog, miniAppUrl)
    .row()
    .text(BUTTON.terms, "terms")
    .row();

  if (whatsappPhone) {
    kb.url(BUTTON.whatsapp, `https://wa.me/${whatsappPhone.replace(/\D/g, "")}`).row();
  }
  if (adminUrl) {
    kb.webApp(BUTTON.admin, adminUrl);
  }
  return kb;
}

/** Sent with a manager's order notification. */
export function orderKeyboard(adminOrderUrl: string): InlineKeyboard {
  return new InlineKeyboard().url("Открыть в админке", adminOrderUrl);
}
