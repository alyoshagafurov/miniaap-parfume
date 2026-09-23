import { afterEach, describe, expect, it } from "vitest";

import { env } from "./env";

/**
 * The one thing worth asserting about the environment loader: that a key
 * written as empty is treated as absent.
 *
 * `.env.example` documents every optional key with nothing after the `=`, so a
 * copied file has `BOT_USERNAME=` in it. Zod's `.optional()` accepts undefined
 * and refuses "", which made the entire environment fail to parse over a
 * variable nobody needed — and every caller of env() threw, including the S3
 * client, whose upload then reported "хранилище недоступно" while the bucket
 * was perfectly fine.
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

afterEach(() => {
  process.env = { ...saved };
});

describe("env", () => {
  it("accepts optional keys written as empty", () => {
    process.env = {
      ...saved,
      ...REQUIRED,
      BOT_USERNAME: "",
      MINI_APP_URL: "",
      ADMIN_CHAT_ID: "  ",
    };
    // Cached after the first successful call in this process, so this asserts
    // the parse rather than the cache — the suite runs in its own worker.
    expect(() => env()).not.toThrow();
    expect(env().BOT_USERNAME).toBeUndefined();
    expect(env().MINI_APP_URL).toBeUndefined();
  });
});
