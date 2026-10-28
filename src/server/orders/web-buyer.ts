import { createHash, randomBytes } from "node:crypto";

import { cookies } from "next/headers";

/**
 * Who a buyer is outside Telegram.
 *
 * Inside the Mini App a buyer is their signed Telegram id. In an ordinary
 * browser there was nothing at all, so «Мои заявки» on the site could only ever
 * say «откройте в Telegram» — a buyer who ordered from the site never saw their
 * order again.
 *
 * Now the browser carries a random key in an httpOnly cookie, created with the
 * first request it sends. Orders store the key's SHA-256, never the key: a read
 * of the database cannot be turned into anybody's history. It is a device, not
 * an account — the same buyer on another phone starts a new list — and that is
 * the honest limit of having no login.
 *
 * Next-only on purpose (cookies()); the bot never imports this.
 */

const COOKIE = "arumi_buyer";
/** Two years: a wholesale buyer reorders across seasons. */
const MAX_AGE = 60 * 60 * 24 * 365 * 2;

export function hashBuyerKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

const looksLikeKey = (v: string | undefined): v is string =>
  typeof v === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(v);

/** The hash for this browser, or null when it has never placed a request. */
export async function currentBuyerHash(): Promise<string | null> {
  const key = (await cookies()).get(COOKIE)?.value;
  return looksLikeKey(key) ? hashBuyerKey(key) : null;
}

/** The hash for this browser, issuing the cookie first if there is none. */
export async function ensureBuyerHash(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE)?.value;
  if (looksLikeKey(existing)) return hashBuyerKey(existing);

  const key = randomBytes(32).toString("base64url");
  store.set(COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return hashBuyerKey(key);
}
