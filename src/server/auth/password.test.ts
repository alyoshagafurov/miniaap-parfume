import { describe, expect, it } from "vitest";

import { generateLoginCode, hashPassword, hashLoginCode, verifyLoginCode, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("accepts the right password", async () => {
    const hash = await hashPassword("правильный-пароль-123");
    expect(await verifyPassword(hash, "правильный-пароль-123")).toBe(true);
  });

  it("rejects the wrong one", async () => {
    const hash = await hashPassword("правильный-пароль-123");
    expect(await verifyPassword(hash, "неправильный")).toBe(false);
  });

  it("uses argon2id, not argon2i or argon2d", async () => {
    expect(await hashPassword("x")).toMatch(/^\$argon2id\$/);
  });

  it("salts — the same password hashes differently every time", async () => {
    expect(await hashPassword("одинаковый")).not.toBe(await hashPassword("одинаковый"));
  });

  it("returns false rather than throwing on a malformed stored hash", async () => {
    // A corrupted row must not crash the login route.
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword("", "anything")).toBe(false);
  });

  it("handles Cyrillic and long passwords", async () => {
    const pw = "Пароль с пробелами и Ё" + "x".repeat(200);
    expect(await verifyPassword(await hashPassword(pw), pw)).toBe(true);
  });
});

describe("generateLoginCode", () => {
  it("is exactly six digits", () => {
    for (let i = 0; i < 50; i++) expect(generateLoginCode()).toMatch(/^\d{6}$/);
  });

  it("uses the full range, including codes with leading zeros", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(generateLoginCode());
    // With 400 draws from 10^6 collisions are nearly impossible; a generator
    // stuck on a narrow range would show up immediately.
    expect(seen.size).toBeGreaterThan(380);
  });
});

describe("login codes are hashed at rest", () => {
  it("verifies the right code", async () => {
    const hash = await hashLoginCode("123456");
    expect(await verifyLoginCode(hash, "123456")).toBe(true);
  });

  it("rejects the wrong code", async () => {
    const hash = await hashLoginCode("123456");
    expect(await verifyLoginCode(hash, "654321")).toBe(false);
  });

  it("never stores the code itself", async () => {
    expect(await hashLoginCode("123456")).not.toContain("123456");
  });
});
