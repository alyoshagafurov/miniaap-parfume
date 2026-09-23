import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `env()` caches its parse after the first success, which is right in
 * production and makes these order-dependent — so each case imports a fresh
 * copy of the module rather than weakening the cache for the sake of a test.
 */
const REQUIRED = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  REDIS_URL: "redis://localhost:6379",
  AUTH_SECRET: "x".repeat(32),
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "bucket",
  S3_ACCESS_KEY: "key",
  S3_SECRET_KEY: "secret",
  NEXT_PUBLIC_S3_PUBLIC_URL: "http://localhost:9000/bucket",
};

const saved = { ...process.env };

async function freshEnv(overrides: Record<string, string>) {
  process.env = { ...saved, ...REQUIRED, ...overrides };
  vi.resetModules();
  return import("./env");
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  process.env = { ...saved };
});

describe("env", () => {
  it("accepts optional keys written as empty", async () => {
    // .env.example documents every optional key with nothing after the `=`, so
    // a copied file has BOT_USERNAME= in it. Zod's .optional() admits undefined
    // and refuses "", which made the whole environment fail to parse over a
    // variable nobody needed.
    const { env } = await freshEnv({
      BOT_USERNAME: "",
      MINI_APP_URL: "",
      ADMIN_CHAT_ID: "  ",
    });
    expect(() => env()).not.toThrow();
    expect(env().BOT_USERNAME).toBeUndefined();
    expect(env().MINI_APP_URL).toBeUndefined();
  });

  it("throws an EnvError, so a caller can tell configuration from an outage", async () => {
    // The afternoon this closes: env() is lazy, so a missing variable first
    // surfaced inside the S3 client and was reported as «хранилище недоступно»
    // while the bucket was perfectly healthy.
    const { env, EnvError } = await freshEnv({ S3_BUCKET: "" });
    let caught: unknown;
    try {
      env();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvError);
    expect((caught as InstanceType<typeof EnvError>).variables).toEqual(["S3_BUCKET"]);
  });
});

describe("checkEnv", () => {
  it("names every faulty variable rather than only the first", async () => {
    const { checkEnv } = await freshEnv({ DATABASE_URL: "", AUTH_SECRET: "short" });
    const result = checkEnv();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.variables).toContain("DATABASE_URL");
    expect(result.variables).toContain("AUTH_SECRET");
  });

  it("is quiet when the environment is complete", async () => {
    const { checkEnv } = await freshEnv({});
    expect(checkEnv()).toEqual({ ok: true });
  });
});
