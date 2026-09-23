import { sign } from "@tma.js/init-data-node";
import { describe, expect, it } from "vitest";

import { verifyInitData } from "./init-data";

/** Not a real token; only ever used to sign fixtures in this file. */
const TOKEN = "7123456789:AAHtest-token-for-signing-fixtures-only";

const user = {
  id: 501234567,
  first_name: "Алишер",
  last_name: "Г.",
  username: "alisher",
  language_code: "ru",
  is_premium: true,
};

function signed(
  at: Date = new Date(),
  overrides: Record<string, unknown> = {},
): string {
  return sign(
    { user, chat_instance: "-1234567890", chat_type: "private", ...overrides },
    TOKEN,
    at,
  );
}

describe("verifyInitData — the gate on everything a user can do", () => {
  it("accepts data Telegram actually signed and returns the user", () => {
    const result = verifyInitData(signed(), TOKEN);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.user.telegramId).toBe(501234567n);
    expect(result.user.firstName).toBe("Алишер");
    expect(result.user.username).toBe("alisher");
  });

  it("carries the deep-link start parameter through", () => {
    const result = verifyInitData(
      signed(new Date(), { start_param: "p_chanel-sauvage-100" }),
      TOKEN,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.startParam).toBe("p_chanel-sauvage-100");
  });

  it("rejects a tampered hash", () => {
    const raw = signed();
    const tampered = raw.replace(
      /hash=([0-9a-f]+)/,
      (_m, h: string) => `hash=${h.slice(0, -1)}${h.at(-1) === "a" ? "b" : "a"}`,
    );
    expect(verifyInitData(tampered, TOKEN).ok).toBe(false);
  });

  it("rejects a tampered payload even though the hash is untouched", () => {
    // The whole point: change who you claim to be, keep Telegram's signature.
    const raw = signed();
    const tampered = raw.replace("501234567", "999999999");
    expect(verifyInitData(tampered, TOKEN).ok).toBe(false);
  });

  it("rejects data signed with a different bot token", () => {
    const other = sign(
      { user },
      "7999999999:AAHsome-other-bot-token-entirely",
      new Date(),
    );
    expect(verifyInitData(other, TOKEN).ok).toBe(false);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["no hash", "user=%7B%22id%22%3A1%7D&auth_date=1700000000"],
    ["garbage", "not-even-query-params"],
    ["only a hash", "hash=deadbeef"],
  ])("rejects %s", (_label, raw) => {
    expect(verifyInitData(raw, TOKEN).ok).toBe(false);
  });

  it("rejects data older than the expiry window", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(verifyInitData(signed(old), TOKEN).ok).toBe(false);
  });

  it("accepts data inside the expiry window", () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000);
    expect(verifyInitData(signed(recent), TOKEN).ok).toBe(true);
  });

  it("refuses to validate when no bot token is configured, rather than passing", () => {
    // A misconfigured server must fail closed: an empty token must never be
    // treated as "validation disabled".
    expect(verifyInitData(signed(), "").ok).toBe(false);
    expect(verifyInitData(signed(), undefined).ok).toBe(false);
  });

  it("reports why it failed, for logging without leaking the payload", () => {
    const result = verifyInitData("", TOKEN);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });
});
