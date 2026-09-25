import type { AdminRoleName } from "./session";

/**
 * Login decisions.
 *
 * Deliberately pure: every refusal path is decided here from plain facts, with
 * no database, no bot and no clock beyond what is passed in, so each one is
 * directly testable. The orchestration that gathers those facts is thin by
 * design — the part that can be wrong in a way that matters is this part.
 *
 * Two paths, because the administrator works from two places:
 *
 *   Telegram — a signed initData whose telegram id is on the allow-list, plus
 *   the password. Being on the allow-list is necessary and never sufficient:
 *   a Mini App session proves which Telegram account is open, not that the
 *   person holding the phone is its owner.
 *
 *   Browser — the password, then a six-digit code the bot sends to that
 *   administrator's Telegram. The password alone never issues a session.
 */

/** Five minutes, per the brief. */
export const LOGIN_CODE_TTL_SECONDS = 300;

/** Five attempts, matching the CHECK constraint on login_codes.attempts. */
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

/**
 * One message for every failure.
 *
 * Distinguishing "no such administrator" from "wrong password" tells an
 * attacker which Telegram ids are administrators — exactly the list they would
 * need to target.
 */
const GENERIC_FAILURE = "Неверный логин или пароль";

export interface AdminFacts {
  id: string;
  role: AdminRoleName;
  isActive: boolean;
  passwordHash: string;
}

export type LoginOutcome = "SESSION" | "SEND_CODE" | "REJECT" | "RATE_LIMITED";

export interface LoginDecision {
  outcome: LoginOutcome;
  message: string;
  adminId?: string;
  role?: AdminRoleName;
}

export type LoginInput =
  | {
      path: "telegram";
      admin: AdminFacts | null;
      passwordMatches: boolean;
      initDataValid: boolean;
      initDataTelegramId: bigint | null;
      adminTelegramId: bigint | null;
      rateLimited: boolean;
    }
  | {
      path: "browser";
      admin: AdminFacts | null;
      passwordMatches: boolean;
      rateLimited: boolean;
      /**
       * Whether the password alone is enough from a browser.
       *
       * False issues the session on the password; true keeps the code the bot
       * delivers as a second factor. The caller reads it from the environment
       * so the decision is a deployment's to make and can be reversed without
       * a release — see `requireLoginCode()` in authenticate.ts.
       */
      requireCode: boolean;
    };

export function decideLogin(input: LoginInput): LoginDecision {
  // Checked first: a throttled request must cost nothing and reveal nothing.
  if (input.rateLimited) {
    return {
      outcome: "RATE_LIMITED",
      message: "Слишком много попыток входа. Попробуйте позже.",
    };
  }

  const reject: LoginDecision = { outcome: "REJECT", message: GENERIC_FAILURE };

  if (!input.admin || !input.admin.isActive) return reject;
  if (!input.passwordMatches) return reject;

  if (input.path === "telegram") {
    // The signature is what makes the telegram id trustworthy. Without this
    // check the path reduces to "tell me which admin you are".
    if (!input.initDataValid) return reject;
    if (
      input.initDataTelegramId === null ||
      input.adminTelegramId === null ||
      input.initDataTelegramId !== input.adminTelegramId
    ) {
      return reject;
    }
    return {
      outcome: "SESSION",
      message: "Вход выполнен",
      adminId: input.admin.id,
      role: input.admin.role,
    };
  }

  /**
   * Browser: the password, and a code when the deployment asks for one.
   *
   * The code was unconditional, and the argument for it still holds: a browser
   * carries no proof of who is at it, so the second factor was the Telegram
   * account already on the allow-list. The client has asked for the password
   * alone, and it is their panel — but the trade is real and is written down
   * here rather than discovered later. What the password now protects on its
   * own: every price, every published product, and every request with a
   * buyer's name and telephone in it.
   *
   * The Telegram path above is unaffected and still proves identity by
   * signature, so opening the panel from the bot remains the stronger door.
   */
  if (input.requireCode) {
    return {
      outcome: "SEND_CODE",
      message: "Код отправлен в Telegram",
      adminId: input.admin.id,
      role: input.admin.role,
    };
  }

  return {
    outcome: "SESSION",
    message: "Вход выполнен",
    adminId: input.admin.id,
    role: input.admin.role,
  };
}

export interface CodeFacts {
  attempts: number;
  expiresAt: Date;
  usedAt: Date | null;
}

export interface CodeDecision {
  outcome: "SESSION" | "REJECT";
  message: string;
  /**
   * Whether this attempt should be counted. False once the budget is already
   * spent, so the stored counter never runs past the database CHECK.
   */
  consumeAttempt: boolean;
}

export function decideCodeCheck(input: {
  code: CodeFacts | null;
  codeMatches: boolean;
  rateLimited: boolean;
  nowMs?: number;
}): CodeDecision {
  const now = input.nowMs ?? Date.now();
  const reject = (message: string, consumeAttempt = false): CodeDecision => ({
    outcome: "REJECT",
    message,
    consumeAttempt,
  });

  if (input.rateLimited) return reject("Слишком много попыток. Попробуйте позже.");
  if (!input.code) return reject("Код не запрашивался или уже недействителен");
  if (input.code.usedAt !== null) return reject("Этот код уже использован");
  if (input.code.expiresAt.getTime() <= now) return reject("Срок действия кода истёк");
  if (input.code.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
    return reject("Попытки исчерпаны — запросите новый код");
  }
  if (!input.codeMatches) return reject("Неверный код", true);

  return { outcome: "SESSION", message: "Вход выполнен", consumeAttempt: false };
}

/**
 * Spends the same time on a failed lookup as on a real password check.
 *
 * Without it, "no such administrator" returns immediately while "wrong
 * password" costs argon2's ~50 ms, and the difference is a usable oracle for
 * discovering which accounts exist.
 */
export async function constantTimeReject(
  verify: (hash: string, password: string) => Promise<boolean>,
): Promise<void> {
  // A real argon2id hash of a value nobody knows, so the work is genuine.
  const DECOY =
    "$argon2id$v=19$m=19456,t=2,p=1$c29tZS1zdGF0aWMtc2FsdA$" +
    "0000000000000000000000000000000000000000000";
  await verify(DECOY, "no-such-password").catch(() => false);
}
