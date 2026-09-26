import type { Settings } from "@prisma/client";

import { plural } from "@/lib/format";
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
  return lines
    .filter((l) => l !== "" || true)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * /contacts.
 *
 * The phone and WhatsApp are two fields in Settings, and the WhatsApp one is
 * the number the «Написать в WhatsApp» button actually opens. This used to
 * print the phone as «Телефон и WhatsApp» and ignore the other field, so the
 * day the client moved WhatsApp to a second number, /contacts would have sent
 * buyers to the wrong one. They share a line only when they are the same
 * number; otherwise each gets its own, and WhatsApp is shown exactly as the
 * button dials it.
 */
export function contacts(settings: Settings): string {
  const phoneDigits = settings.phone.replace(/\D/g, "");
  const whatsappDigits = settings.whatsappPhone.replace(/\D/g, "");
  const sameNumber = phoneDigits !== "" && phoneDigits === whatsappDigits;

  const lines = [
    settings.companyName,
    settings.address ? `Адрес: ${settings.address}` : "",
    settings.phone
      ? `${sameNumber ? "Телефон и WhatsApp" : "Телефон"}: ${settings.phone}`
      : "",
    whatsappDigits && !sameNumber ? `WhatsApp: +${whatsappDigits}` : "",
    `Минимальный заказ: ${formatRub(settings.minOrderKop)}`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * /id in a private chat.
 *
 * Nothing in Telegram's own interface shows a person their numeric id, and two
 * things are keyed by it: an administrator's row in the panel, and ADMIN_CHAT_ID,
 * the chat new requests are sent to.
 */
export function yourTelegramId(id: string): string {
  return (
    `Ваш Telegram ID: ${id}\n\n` +
    "Он нужен, чтобы открыть вам админ-панель или присылать вам новые заявки."
  );
}

/** /id in a group: the number ADMIN_CHAT_ID takes for requests to land there. */
export function chatTelegramId(id: string, kind: "group" | "channel"): string {
  const where = kind === "channel" ? "этого канала" : "этой группы";
  return (
    `ID ${where}: ${id}\n\n` +
    "Чтобы новые заявки приходили сюда, это число указывают в ADMIN_CHAT_ID."
  );
}

/** Sent to the buyer once their request is recorded. */
export function orderAccepted(
  number: string,
  totalKop: number,
  showPrices: boolean,
): string {
  const total = showPrices ? `\nСумма: ${formatRub(totalKop)}` : "";
  return (
    `Заявка ${number} принята.${total}\n\n` +
    "Менеджер свяжется с вами, чтобы подтвердить наличие и сроки отправки."
  );
}

/**
 * Telegram refuses a longer message outright, with 400 «message is too long».
 * Counted in UTF-16 units here, which is never fewer than Telegram's own count,
 * so staying under it here means staying under it there.
 */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

const POSITIONS = ["позиция", "позиции", "позиций"] as const;

/**
 * Sent to the manager's chat when a request arrives.
 *
 * A request may carry up to 200 lines, and at seventy-odd characters a line
 * the whole list passes Telegram's limit at around fifty. Past it the send
 * fails as a whole, so the largest requests — the ones that matter most — were
 * the ones the manager would never hear about. The list is cut from the end
 * until the message fits, and says how many lines are left for the panel,
 * which the button under the message opens. The contacts are never cut.
 */
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
  const rows = params.lines.map((l) => {
    const sum = params.showPrices ? ` — ${formatRub(l.lineTotalKop)}` : "";
    return `• ${l.title} (${l.sku}) × ${l.qty}${sum}`;
  });

  const total = params.showPrices ? `\nИтого: ${formatRub(params.totalKop)}` : "";
  const from = params.username ? `\nTelegram: @${params.username}` : "";

  const head = `Новая заявка ${params.number}\n\n`;
  const tail =
    `${total}\n\n` +
    `Имя: ${params.name}\n` +
    `Телефон: ${params.phone}\n` +
    `Город: ${params.city}\n` +
    `Доставка: ${params.delivery}${from}` +
    (params.comment ? `\n\nКомментарий: ${params.comment}` : "");

  const compose = (shown: number): string => {
    const rest = rows.length - shown;
    const items = rows.slice(0, shown);
    if (rest > 0) {
      items.push(`…и ещё ${rest} ${plural(rest, POSITIONS)} — полностью в админке`);
    }
    return head + items.join("\n") + tail;
  };

  let shown = rows.length;
  let text = compose(shown);
  while (text.length > TELEGRAM_MESSAGE_LIMIT && shown > 0) {
    shown--;
    text = compose(shown);
  }
  return text;
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
