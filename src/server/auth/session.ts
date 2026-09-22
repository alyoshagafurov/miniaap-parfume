import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Admin sessions.
 *
 * A signed cookie rather than a library. The two login paths here are unusual —
 * inside Telegram it is a verified initData signature plus a password, in a
 * browser it is a password plus a code the bot sends — and neither maps onto an
 * email/password primitive. There are no email addresses anywhere in this
 * product. The pieces a session library would have supplied are already built
 * and tested: one-time codes with TTL and an attempt counter live in the
 * LoginCode table behind a database CHECK, and the sliding-window limiter is in
 * src/server/rate-limit.ts. What remains is this file.
 *
 * The token is `base64url(payload).base64url(HMAC-SHA256)`. It carries no
 * secret: an attacker learns only which admin id and role the holder has, which
 * they already know if they hold the cookie. What they cannot do is change it,
 * because they cannot produce the signature.
 */

export const COOKIE_NAME = "arumi_admin";

/** 12 hours, per the brief. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

/**
 * Anything shorter is not a key. 32 characters is what
 * `openssl rand -base64 32` produces, which is what .env.example tells the
 * operator to run.
 */
const MIN_SECRET_LENGTH = 32;

export type AdminRoleName = "OWNER" | "EDITOR";

export interface SessionPayload {
  adminId: string;
  role: AdminRoleName;
}

interface StoredSession extends SessionPayload {
  /** Issued at, Unix seconds. */
  iat: number;
  /** Expires at, Unix seconds. */
  exp: number;
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function signSession(
  payload: SessionPayload,
  secret: string,
  options: { nowSeconds?: number } = {},
): string {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET должен быть не короче ${MIN_SECRET_LENGTH} символов — ` +
        "сгенерируйте: openssl rand -base64 32",
    );
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const stored: StoredSession = {
    adminId: payload.adminId,
    role: payload.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const body = Buffer.from(JSON.stringify(stored)).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

/**
 * Returns the session, or null for anything that is not a currently valid one.
 *
 * Null covers every failure — wrong signature, tampered body, expired, garbage
 * — deliberately. The caller's only correct response to any of them is the
 * same: treat the request as unauthenticated.
 */
export function verifySession(
  token: string | undefined | null,
  secret: string,
  options: { nowSeconds?: number } = {},
): SessionPayload | null {
  if (!token || !secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = sign(body, secret);
  // Constant-time: a length-dependent or early-exit comparison leaks how much
  // of a guessed signature was correct.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const s = parsed as Partial<StoredSession>;
  if (typeof s.adminId !== "string" || s.adminId === "") return null;
  if (s.role !== "OWNER" && s.role !== "EDITOR") return null;
  if (typeof s.exp !== "number") return null;

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (now >= s.exp) return null;

  return { adminId: s.adminId, role: s.role };
}

export interface SessionCookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

/**
 * Cookie attributes.
 *
 * SameSite=Lax rather than Strict: the administrator arrives from a Telegram
 * link, and Strict would drop the cookie on that first cross-site navigation
 * and bounce them back to the login screen.
 *
 * `secure` is conditional only because a Secure cookie is discarded over plain
 * http, which would make local development impossible. It is always on in
 * production.
 */
export function sessionCookieOptions(secure: boolean): SessionCookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
