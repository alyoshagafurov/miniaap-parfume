import { parse, validate } from "@tma.js/init-data-node";

/**
 * Verifying Telegram init data.
 *
 * This is the gate on everything a user can do. Init data is a query string
 * Telegram signs with the bot token and hands to the Mini App; anything the
 * client sends about who it is comes from here and nowhere else.
 *
 * Package note: this uses @tma.js/init-data-node rather than the
 * @telegram-apps/init-data-node named in the brief. The latter is formally
 * deprecated on npm ("This package is not supported anymore") and last shipped
 * 2025-12-05, while @tma.js/init-data-node last shipped 2026-06-20 with the
 * same API. For the one package whose entire job is checking a cryptographic
 * signature, being unmaintained is not acceptable.
 *
 * Failure is always closed. An absent token, an unparseable string and a forged
 * hash are all simply "not verified" — there is no path where a missing
 * configuration is read as "validation disabled".
 */

/**
 * How long a signature stays acceptable. Telegram issues init data once when
 * the Mini App launches and never refreshes it, so this has to cover a whole
 * working session; a buyer may well leave the catalog open for hours. A day
 * matches the library default and is the same window Telegram's own examples
 * use.
 */
const EXPIRES_IN_SECONDS = 86_400;

export interface TelegramIdentity {
  /** BigInt: Telegram ids exceed the range of a 32-bit integer. */
  telegramId: bigint;
  firstName: string;
  lastName: string | undefined;
  username: string | undefined;
  languageCode: string | undefined;
  isPremium: boolean;
}

export type VerifyResult =
  | { ok: true; user: TelegramIdentity; startParam: string | undefined; raw: string }
  | { ok: false; reason: string };

/**
 * Returns the signed-in Telegram user, or a reason it could not be established.
 *
 * The reason is safe to log: it never contains the init data itself, which
 * carries the user's name and id.
 */
export function verifyInitData(
  raw: string | null | undefined,
  botToken: string | null | undefined,
): VerifyResult {
  if (!raw || raw.trim() === "") {
    return { ok: false, reason: "init data отсутствует" };
  }
  if (!botToken || botToken.trim() === "") {
    // Fail closed. A server without a token cannot verify anyone.
    return { ok: false, reason: "BOT_TOKEN не настроен — проверка невозможна" };
  }

  try {
    // Throws on a bad signature, a missing hash, or expired data.
    validate(raw, botToken, { expiresIn: EXPIRES_IN_SECONDS });
  } catch (error) {
    return { ok: false, reason: describe(error) };
  }

  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(raw);
  } catch (error) {
    return { ok: false, reason: describe(error) };
  }

  const user = parsed.user;
  if (!user) {
    // Init data can legitimately lack a user (an inline-mode launch), but every
    // path in this application is about a specific buyer.
    return { ok: false, reason: "в init data нет пользователя" };
  }

  return {
    ok: true,
    raw,
    startParam: parsed.start_param,
    user: {
      telegramId: BigInt(user.id),
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      languageCode: user.language_code,
      isPremium: user.is_premium ?? false,
    },
  };
}

/** Never includes the init data itself — it carries the user's name and id. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.name || error.message;
  return "подпись init data не подтверждена";
}
