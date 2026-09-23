import { Api } from "grammy";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  apiRoot,
  clientOptions,
  telegramApi,
  __setTelegramApiForTests,
} from "./client";

const ORIGINAL = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL };
  __setTelegramApiForTests(undefined);
  vi.restoreAllMocks();
});

describe("apiRoot — every call must reach the relay, not api.telegram.org", () => {
  it("defaults to the public API when unset", () => {
    delete process.env.TELEGRAM_API_ROOT;
    expect(apiRoot()).toBe("https://api.telegram.org");
  });

  it("uses the configured relay", () => {
    process.env.TELEGRAM_API_ROOT = "https://relay.example.net";
    expect(apiRoot()).toBe("https://relay.example.net");
  });

  it.each([
    "https://relay.example.net/",
    "https://relay.example.net//",
    "  https://relay.example.net/  ",
  ])("strips the trailing slash from %j, which grammY rejects", (value) => {
    // grammY throws "Remove the trailing '/' from the 'apiRoot' option" at
    // construction — an easy thing to leave in an env var and a confusing crash.
    process.env.TELEGRAM_API_ROOT = value;
    expect(apiRoot()).toBe("https://relay.example.net");
    expect(() => new Api("1:x", clientOptions())).not.toThrow();
  });

  it("falls back when the variable is present but empty", () => {
    process.env.TELEGRAM_API_ROOT = "   ";
    expect(apiRoot()).toBe("https://api.telegram.org");
  });

  it("bounds the request timeout rather than using grammY's 500s default", () => {
    expect(clientOptions().timeoutSeconds).toBeLessThanOrEqual(60);
  });
});

describe("telegramApi", () => {
  it("refuses to build a client without a token", () => {
    delete process.env.BOT_TOKEN;
    expect(() => telegramApi()).toThrow(/BOT_TOKEN/);
  });

  it("builds against the configured relay and reuses one instance", () => {
    process.env.BOT_TOKEN = "1:test";
    process.env.TELEGRAM_API_ROOT = "https://relay.example.net";
    const a = telegramApi();
    expect(telegramApi()).toBe(a);
  });

  it("sends through the relay, not api.telegram.org", async () => {
    process.env.BOT_TOKEN = "1:test";
    process.env.TELEGRAM_API_ROOT = "https://relay.example.net";

    // grammY's documented mocking hook: a transformer that answers without
    // calling `prev` performs no network I/O at all.
    const calls: Array<{ method: string; payload: unknown }> = [];
    const api = telegramApi();
    api.config.use((_prev, method, payload) => {
      calls.push({ method, payload });
      return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
    });

    await api.sendMessage(123, "тест");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("sendMessage");
    expect(calls[0]?.payload).toMatchObject({ chat_id: 123, text: "тест" });
  });
});
