import type { Settings } from "@prisma/client";

import { formatRub } from "@/lib/money";

/**
 * Every word the bot says.
 *
 * Kept in one file so the client can be shown exactly what their bot says
 * without reading handlers, and so nothing is written inline at a call site
 * where it would escape review.
 *
 * Two rules from the design direction hold here as much as in the interface:
 * no emoji anywhere, and no contact detail is hardcoded — the address, the
 * phone and the delivery terms all come from Settings, which the client edits
 * in the admin panel without a deploy.
 */

export function greeting(settings: Settings, firstName?: string): string {
  const hello = firstName ? `${firstName}, здравствуйте.` : "Здравствуйте.";
  const body = settings.botGreeting.trim();
  return body ? `${hello}\n\n${body}` : hello;
}

export function terms(settings: Settings): string {
  const lines = [
    settings.companyName,
    "",
    settings.address ? `Адрес: ${settings.address}` : "",
    settings.phone ? `Телефон: ${settings.phone}` : "",
    `Минимальный заказ: ${formatRub(settings.minOrderKop)}`,
    "",
    settings.deliveryTerms.trim(),
  ];
  return lines.filter((l) => l !== "" || true).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function contacts(settings: Settings): string {
  const lines = [
    settings.companyName,
    settings.address ? `Адрес: ${settings.address}` : "",
    settings.phone ? `Телефон и WhatsApp: ${settings.phone}` : "",
    `Минимальный заказ: ${formatRub(settings.minOrderKop)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/** Sent to the buyer once their request is recorded. */
export function orderAccepted(number: string, totalKop: number, showPrices: boolean): string {
  const total = showPrices ? `\nСумма: ${formatRub(totalKop)}` : "";
  return (
    `Заявка ${number} принята.${total}\n\n` +
    "Менеджер свяжется с вами, чтобы подтвердить наличие и сроки отправки."
  );
}

/** Sent to the manager's chat when a request arrives. */
export function orderForManager(params: {
  number: string;
  name: string;
  phone: string;
  city: string;
  delivery: string;
  comment: string | null;
  totalKop: number;
  showPrices: boolean;
  lines: Array<{ title: string; sku: string; qty: number; lineTotalKop: number }>;
  username: string | null;
}): string {
  const items = params.lines
    .map((l) => {
      const sum = params.showPrices ? ` — ${formatRub(l.lineTotalKop)}` : "";
      return `• ${l.title} (${l.sku}) × ${l.qty}${sum}`;
    })
    .join("\n");

  const total = params.showPrices ? `\nИтого: ${formatRub(params.totalKop)}` : "";
  const from = params.username ? `\nTelegram: @${params.username}` : "";

  return (
    `Новая заявка ${params.number}\n\n` +
    `${items}${total}\n\n` +
    `Имя: ${params.name}\n` +
    `Телефон: ${params.phone}\n` +
    `Город: ${params.city}\n` +
    `Доставка: ${params.delivery}${from}` +
    (params.comment ? `\n\nКомментарий: ${params.comment}` : "")
  );
}

/** The one-time code an administrator needs to sign in from a browser. */
export function loginCode(code: string, ttlMinutes: number): string {
  return (
    `Код для входа в админ-панель: ${code}\n\n` +
    `Действует ${ttlMinutes} минут. Если вы не запрашивали вход — просто не вводите код ` +
    "и сообщите владельцу."
  );
}

export const BUTTON = {
  catalog: "Открыть каталог",
  terms: "Условия и доставка",
  whatsapp: "Написать в WhatsApp",
  admin: "Админ-панель",
  menu: "Каталог",
} as const;

export const COMMAND_DESCRIPTION = {
  start: "Начать и открыть каталог",
  catalog: "Каталог товаров",
  contacts: "Адрес, телефон, условия",
  admin: "Админ-панель",
} as const;

export const NOT_ADMIN = "Эта команда доступна только администраторам.";
