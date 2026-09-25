import { describe, expect, it, vi } from "vitest";

import {
  LOGIN_CODE_MAX_ATTEMPTS,
  LOGIN_CODE_TTL_SECONDS,
  decideLogin,
  decideCodeCheck,
} from "./login";

/**
 * The decision logic is pure and lives apart from the database and the bot, so
 * every refusal path is directly testable. The orchestration around it is thin.
 */

const admin = {
  id: "a1",
  role: "OWNER" as const,
  isActive: true,
  passwordHash: "$argon2id$x",
};

describe("decideLogin — Telegram path", () => {
  const base = {
    path: "telegram" as const,
    admin,
    passwordMatches: true,
    initDataValid: true,
    initDataTelegramId: 501n,
    adminTelegramId: 501n,
    rateLimited: false,
  };

  it("admits a verified admin with the right password", () => {
    expect(decideLogin(base).outcome).toBe("SESSION");
  });

  it("refuses when the initData signature is not valid", () => {
    // Without this the Telegram path is just "send me any telegram id".
    expect(decideLogin({ ...base, initDataValid: false }).outcome).toBe("REJECT");
  });

  it("refuses when the signed telegram id is not the admin's", () => {
    expect(decideLogin({ ...base, initDataTelegramId: 999n }).outcome).toBe("REJECT");
  });

  it("refuses on a wrong password even with valid initData", () => {
    // Being on the allow-list is necessary, never sufficient.
    expect(decideLogin({ ...base, passwordMatches: false }).outcome).toBe("REJECT");
  });

  it("refuses a deactivated admin", () => {
    expect(decideLogin({ ...base, admin: { ...admin, isActive: false } }).outcome).toBe(
      "REJECT",
    );
  });

  it("refuses an unknown admin", () => {
    expect(decideLogin({ ...base, admin: null }).outcome).toBe("REJECT");
  });

  it("refuses when rate limited, before checking anything else", () => {
    const d = decideLogin({ ...base, rateLimited: true });
    expect(d.outcome).toBe("RATE_LIMITED");
  });

  it("gives the same message whatever the reason", () => {
    // A different message for "no such admin" than for "wrong password" tells
    // an attacker which telegram ids are administrators.
    const a = decideLogin({ ...base, admin: null });
    const b = decideLogin({ ...base, passwordMatches: false });
    const c = decideLogin({ ...base, initDataTelegramId: 999n });
    expect(a.message).toBe(b.message);
    expect(b.message).toBe(c.message);
  });
});

describe("decideLogin — browser path", () => {
  const base = {
    path: "browser" as const,
    admin,
    passwordMatches: true,
    rateLimited: false,
    requireCode: true,
  };

  it("does not issue a session on the password alone", () => {
    // The password is only the first factor; the code is the second.
    expect(decideLogin(base).outcome).toBe("SEND_CODE");
  });

  it("issues the session on the password when the code is switched off", () => {
    // What ADMIN_LOGIN_REQUIRE_CODE=0 buys, and what it costs: this single
    // password is then the whole of the protection on prices, on published
    // products, and on every request carrying a buyer's name and telephone.
    const decision = decideLogin({ ...base, requireCode: false });
    expect(decision.outcome).toBe("SESSION");
    expect(decision.adminId).toBe(admin.id);
    expect(decision.role).toBe(admin.role);
  });

  it("still refuses a wrong password with the code switched off", () => {
    // The obvious way to get this wrong is to treat "no second factor" as
    // "no first factor either".
    expect(
      decideLogin({ ...base, requireCode: false, passwordMatches: false }).outcome,
    ).toBe("REJECT");
  });

  it("still refuses a disabled administrator with the code switched off", () => {
    expect(
      decideLogin({
        ...base,
        requireCode: false,
        admin: { ...admin, isActive: false },
      }).outcome,
    ).toBe("REJECT");
  });

  it("still refuses while rate limited with the code switched off", () => {
    expect(decideLogin({ ...base, requireCode: false, rateLimited: true }).outcome).toBe(
      "RATE_LIMITED",
    );
  });

  it("refuses a wrong password without sending a code", () => {
    // Sending a code on a wrong password would let anyone spam an admin's
    // Telegram with login codes.
    expect(decideLogin({ ...base, passwordMatches: false }).outcome).toBe("REJECT");
  });

  it("refuses an unknown or deactivated admin without sending a code", () => {
    expect(decideLogin({ ...base, admin: null }).outcome).toBe("REJECT");
    expect(decideLogin({ ...base, admin: { ...admin, isActive: false } }).outcome).toBe(
      "REJECT",
    );
  });
});

describe("decideCodeCheck", () => {
  const fresh = {
    code: { attempts: 0, expiresAt: new Date(Date.now() + 60_000), usedAt: null },
    codeMatches: true,
    rateLimited: false,
  };

  it("admits the right code", () => {
    expect(decideCodeCheck(fresh).outcome).toBe("SESSION");
  });

  it("refuses a wrong code and counts the attempt", () => {
    const d = decideCodeCheck({ ...fresh, codeMatches: false });
    expect(d.outcome).toBe("REJECT");
    expect(d.consumeAttempt).toBe(true);
  });

  it("refuses an expired code", () => {
    const d = decideCodeCheck({
      ...fresh,
      code: { ...fresh.code, expiresAt: new Date(Date.now() - 1) },
    });
    expect(d.outcome).toBe("REJECT");
  });

  it("refuses a code that was already used", () => {
    // One-time means one time: a code read over someone's shoulder must not
    // work twice.
    const d = decideCodeCheck({
      ...fresh,
      code: { ...fresh.code, usedAt: new Date() },
    });
    expect(d.outcome).toBe("REJECT");
  });

  it("refuses once the attempts are spent, even for the correct code", () => {
    const d = decideCodeCheck({
      ...fresh,
      code: { ...fresh.code, attempts: LOGIN_CODE_MAX_ATTEMPTS },
    });
    expect(d.outcome).toBe("REJECT");
    // Already exhausted: do not keep incrementing past the CHECK constraint.
    expect(d.consumeAttempt).toBe(false);
  });

  it("refuses when there is no code at all", () => {
    expect(decideCodeCheck({ ...fresh, code: null }).outcome).toBe("REJECT");
  });

  it("uses the five-minute TTL and five attempts the brief specifies", () => {
    expect(LOGIN_CODE_TTL_SECONDS).toBe(300);
    expect(LOGIN_CODE_MAX_ATTEMPTS).toBe(5);
  });
});

describe("timing", () => {
  it("verifies a password even when the admin does not exist", async () => {
    // Otherwise "no such admin" returns instantly and "wrong password" takes
    // ~50ms of argon2, which is a usable oracle for enumerating admins.
    const { constantTimeReject } = await import("./login");
    const spy = vi.fn(async () => false);
    await constantTimeReject(spy);
    expect(spy).toHaveBeenCalled();
  });
});
