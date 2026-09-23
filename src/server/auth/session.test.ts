import { describe, expect, it } from "vitest";

import {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  signSession,
  verifySession,
} from "./session";

const SECRET = "test-secret-at-least-32-characters-long!!";
const OTHER = "another-secret-at-least-32-characters!!!!";

const payload = { adminId: "adm_1", role: "OWNER" as const };

describe("signSession / verifySession", () => {
  it("round-trips an admin", () => {
    const token = signSession(payload, SECRET);
    const s = verifySession(token, SECRET);
    expect(s).not.toBeNull();
    expect(s?.adminId).toBe("adm_1");
    expect(s?.role).toBe("OWNER");
  });

  it("rejects a token signed with a different secret", () => {
    // Rotating AUTH_SECRET must log everyone out, not silently keep them in.
    expect(verifySession(signSession(payload, OTHER), SECRET)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const token = signSession({ adminId: "adm_1", role: "EDITOR" }, SECRET);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        adminId: "adm_1",
        role: "OWNER",
        exp: Date.now() / 1000 + 100,
        iat: 1,
      }),
    ).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, SECRET)).toBeNull();
    expect(body).toBeTruthy();
  });

  it.each([
    ["empty", ""],
    ["no dot", "abcdef"],
    ["two dots", "a.b.c"],
    ["garbage body", "!!!!.zzzz"],
    ["empty signature", "eyJhIjoxfQ."],
    ["not json", `${Buffer.from("hello").toString("base64url")}.zzz`],
  ])("rejects %s", (_label, token) => {
    expect(verifySession(token, SECRET)).toBeNull();
  });

  it("rejects an expired session", () => {
    const token = signSession(payload, SECRET, { nowSeconds: 1_000_000 });
    // 12h later plus a second.
    expect(
      verifySession(token, SECRET, { nowSeconds: 1_000_000 + SESSION_TTL_SECONDS + 1 }),
    ).toBeNull();
  });

  it("accepts a session inside its window", () => {
    const token = signSession(payload, SECRET, { nowSeconds: 1_000_000 });
    expect(verifySession(token, SECRET, { nowSeconds: 1_000_000 + 60 })).not.toBeNull();
  });

  it("refuses to sign with a weak secret", () => {
    expect(() => signSession(payload, "short")).toThrow(/AUTH_SECRET/);
  });

  it("lasts 12 hours, as specified", () => {
    expect(SESSION_TTL_SECONDS).toBe(12 * 60 * 60);
  });
});

describe("sessionCookieOptions", () => {
  it("is httpOnly, SameSite=Lax and scoped to the whole site", () => {
    const o = sessionCookieOptions(true);
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(SESSION_TTL_SECONDS);
  });

  it("is Secure in production", () => {
    expect(sessionCookieOptions(true).secure).toBe(true);
  });

  it("is not Secure on plain-http localhost, or the cookie would never be set", () => {
    expect(sessionCookieOptions(false).secure).toBe(false);
  });

  it("uses a host-scoped cookie name", () => {
    expect(COOKIE_NAME).toMatch(/^[a-z0-9_-]+$/i);
  });
});
