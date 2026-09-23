import { cookies } from "next/headers";

import { prisma } from "@/server/db";
import { rateLimit, resetLimit } from "@/server/rate-limit";
import { telegramApi } from "@/server/telegram/client";
import { verifyInitData } from "@/server/telegram/init-data";
import { sendLoginCode } from "@/server/telegram/notify";

import {
  constantTimeReject,
  decideCodeCheck,
  decideLogin,
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_TTL_SECONDS,
  type LoginDecision,
} from "./login";
import {
  generateLoginCode,
  hashLoginCode,
  verifyLoginCode,
  verifyPassword,
} from "./password";
import {
  COOKIE_NAME,
  sessionCookieOptions,
  signSession,
  type SessionPayload,
} from "./session";

/**
 * Signing in.
 *
 * The decisions live in login.ts and are pure and tested; this file only
 * gathers the facts they need and carries out what they decide. Nothing here
 * chooses whether to admit anyone — if this file ever contains an `if` about
 * permission, the split has failed.
 */

/**
 * Two buckets, and they are not the same kind of thing.
 *
 * The per-address one refuses outright: an attacker changing accounts from one
 * place is still one place.
 *
 * The per-login one is consumed only by a FAILED attempt. Refusing on it up
 * front was an account-lockout lever — ten bad guesses every ten minutes, from
 * anywhere, and the owner is locked out of their own back office indefinitely
 * for the cost of a request a minute. Now a correct password always gets
 * through, and only wrong ones burn the budget.
 */
const LOGIN_LIMIT = { limit: 10, windowSeconds: 600 } as const;
const CODE_LIMIT = { limit: 10, windowSeconds: 600 } as const;

export interface LoginResult {
  outcome: "SESSION" | "SEND_CODE" | "REJECT" | "RATE_LIMITED";
  message: string;
}

async function findAdmin(login: string) {
  return prisma.adminUser.findUnique({
    where: { login: login.trim().toLowerCase() },
    select: {
      id: true,
      role: true,
      isActive: true,
      passwordHash: true,
      telegramId: true,
    },
  });
}

async function throttled(
  keys: readonly string[],
  config: typeof LOGIN_LIMIT,
): Promise<boolean> {
  for (const key of keys) {
    const result = await rateLimit(key, config);
    if (!result.allowed) return true;
  }
  return false;
}

/**
 * Charges a failed attempt to the login, and slows the next one down.
 *
 * Consumed only by failures, and it never refuses. That is the whole design:
 * an exhausted budget delays the answer instead of rejecting it, so an attacker
 * rotating addresses against one account loses throughput while the owner, who
 * types the right password, is never made to wait at all.
 */
const LOCKOUT_DELAY_MS = 1000;

async function chargeFailure(login: string): Promise<void> {
  const result = await rateLimit(`login:id:${login.trim().toLowerCase()}`, LOGIN_LIMIT);
  if (!result.allowed) {
    await new Promise((resolve) => setTimeout(resolve, LOCKOUT_DELAY_MS));
  }
}

async function issueSession(payload: SessionPayload): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET не задан");
  const token = signSession(payload, secret);
  const store = await cookies();
  store.set(
    COOKIE_NAME,
    token,
    sessionCookieOptions(process.env.NODE_ENV === "production"),
  );
}

/**
 * Inside Telegram: the signed launch string plus the password.
 *
 * Being on the allow-list is necessary and never sufficient. A Mini App session
 * proves which Telegram account is open, not that the person holding the phone
 * is its owner — a phone left on a counter is exactly the case this guards.
 */
export async function loginFromTelegram(input: {
  login: string;
  password: string;
  initDataRaw: string;
  ip: string;
}): Promise<LoginResult> {
  const rateLimited = await throttled([`login:ip:${input.ip}`], LOGIN_LIMIT);

  const admin = rateLimited ? null : await findAdmin(input.login);
  const identity = verifyInitData(input.initDataRaw, process.env.BOT_TOKEN);

  // Always spend the argon2 time, even when there is no such administrator:
  // an immediate "no" for an unknown login and a slow "no" for a wrong password
  // is a usable oracle for which accounts exist.
  const passwordMatches = admin
    ? await verifyPassword(admin.passwordHash, input.password)
    : (await constantTimeReject(verifyPassword), false);

  const decision = decideLogin({
    path: "telegram",
    admin: admin
      ? {
          id: admin.id,
          role: admin.role,
          isActive: admin.isActive,
          passwordHash: admin.passwordHash,
        }
      : null,
    passwordMatches,
    initDataValid: identity.ok,
    initDataTelegramId: identity.ok ? identity.user.telegramId : null,
    adminTelegramId: admin?.telegramId ?? null,
    rateLimited,
  });

  if (decision.outcome === "REJECT") await chargeFailure(input.login);
  return finish(decision, admin?.telegramId ?? null, input.login);
}

/**
 * From a browser: the password, then a code the bot delivers.
 *
 * The password alone never issues a session, because a browser carries no proof
 * of who is at it. The second factor is the Telegram account already on the
 * allow-list, which the administrator has by definition.
 */
export async function loginFromBrowser(input: {
  login: string;
  password: string;
  ip: string;
}): Promise<LoginResult> {
  const rateLimited = await throttled([`login:ip:${input.ip}`], LOGIN_LIMIT);

  const admin = rateLimited ? null : await findAdmin(input.login);
  const passwordMatches = admin
    ? await verifyPassword(admin.passwordHash, input.password)
    : (await constantTimeReject(verifyPassword), false);

  const decision = decideLogin({
    path: "browser",
    admin: admin
      ? {
          id: admin.id,
          role: admin.role,
          isActive: admin.isActive,
          passwordHash: admin.passwordHash,
        }
      : null,
    passwordMatches,
    rateLimited,
  });

  if (decision.outcome === "REJECT") await chargeFailure(input.login);
  return finish(decision, admin?.telegramId ?? null, input.login);
}

async function finish(
  decision: LoginDecision,
  telegramId: bigint | null,
  loginName?: string,
): Promise<LoginResult> {
  if (decision.outcome === "SESSION" && decision.adminId && decision.role) {
    await issueSession({ adminId: decision.adminId, role: decision.role });
    // Clear the failure budget: four mistyped passwords should not follow
    // somebody around for the rest of the window once they have got in.
    if (loginName) await resetLimit(`login:id:${loginName.trim().toLowerCase()}`);
    return { outcome: "SESSION", message: decision.message };
  }

  if (decision.outcome === "SEND_CODE" && decision.adminId && telegramId !== null) {
    // Built before the code is written, and its failure is not this action's
    // failure. telegramApi() throws when BOT_TOKEN is unset — which is exactly
    // the state a fresh deployment is in — and letting that escape would turn a
    // correct password into "проверьте связь", which is both wrong and
    // unactionable. No row is written for a code that cannot be delivered.
    let api: ReturnType<typeof telegramApi>;
    try {
      api = telegramApi();
    } catch {
      return {
        outcome: "REJECT",
        message:
          "Вход из браузера недоступен: бот не настроен. Войдите через Telegram.",
      };
    }

    const code = generateLoginCode();
    await prisma.loginCode.create({
      data: {
        adminId: decision.adminId,
        codeHash: await hashLoginCode(code),
        expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_SECONDS * 1000),
      },
    });

    const sent = await sendLoginCode(
      api,
      telegramId,
      code,
      Math.round(LOGIN_CODE_TTL_SECONDS / 60),
    ).catch(() => false);

    if (!sent) {
      // The code exists but never arrived. Saying so is not a disclosure —
      // whoever is typing has already proved they know the password.
      return {
        outcome: "REJECT",
        message:
          "Не удалось отправить код в Telegram. Напишите боту /start и повторите.",
      };
    }
    return { outcome: "SEND_CODE", message: decision.message };
  }

  return { outcome: decision.outcome, message: decision.message };
}

export interface CodeResult {
  outcome: "SESSION" | "REJECT";
  message: string;
}

/**
 * The second factor.
 *
 * The identifier is retyped rather than carried in a cookie between the two
 * steps: a half-authenticated cookie is a credential, and one that says "this
 * browser is partway through signing in as X" is worth stealing.
 */
export async function confirmLoginCode(input: {
  login: string;
  code: string;
  ip: string;
}): Promise<CodeResult> {
  const rateLimited = await throttled(
    [`code:ip:${input.ip}`, `code:id:${input.login.trim().toLowerCase()}`],
    CODE_LIMIT,
  );

  const admin = rateLimited ? null : await findAdmin(input.login);

  // The newest unused code for this administrator. Requesting a second code
  // does not invalidate the first here — it simply stops being the newest, and
  // it expires on its own.
  const stored = admin
    ? await prisma.loginCode.findFirst({
        where: { adminId: admin.id, usedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          codeHash: true,
          expiresAt: true,
          attempts: true,
          usedAt: true,
        },
      })
    : null;

  const codeMatches = stored
    ? await verifyLoginCode(stored.codeHash, input.code)
    : false;

  const decision = decideCodeCheck({
    code: stored
      ? {
          attempts: stored.attempts,
          expiresAt: stored.expiresAt,
          usedAt: stored.usedAt,
        }
      : null,
    codeMatches,
    rateLimited,
  });

  if (decision.consumeAttempt && stored) {
    // Atomic, and conditional on still being under the budget. The previous
    // version read `attempts` in one query and wrote `attempts + 1` in another,
    // so ten concurrent guesses all read the same number and all wrote the same
    // N+1 — five attempts meant five *sequential* attempts. The WHERE clause is
    // what makes the budget real, and it also keeps the counter inside the
    // CHECK constraint without clamping.
    const bumped = await prisma.loginCode.updateMany({
      where: {
        id: stored.id,
        usedAt: null,
        attempts: { lt: LOGIN_CODE_MAX_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count === 0) {
      return { outcome: "REJECT", message: "Попытки исчерпаны — запросите новый код" };
    }
  }

  if (decision.outcome === "SESSION" && admin && stored) {
    // Marked used before the session is issued, and only from unused: two
    // browsers racing the same code must not both get in.
    const spent = await prisma.loginCode.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (spent.count === 0) {
      return { outcome: "REJECT", message: "Этот код уже использован" };
    }
    await issueSession({ adminId: admin.id, role: admin.role });
    return { outcome: "SESSION", message: decision.message };
  }

  return { outcome: "REJECT", message: decision.message };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
