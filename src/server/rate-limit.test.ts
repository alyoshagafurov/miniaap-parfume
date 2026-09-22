import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeRedis, rateLimit, resetLimit } from "./rate-limit";

const reachable = Boolean(process.env.REDIS_URL);

// Unique per run so a re-run never inherits the previous run's counters.
const ns = () => `test:${Math.random().toString(36).slice(2, 10)}`;

afterAll(async () => {
  if (reachable) await closeRedis();
});

describe.skipIf(!reachable)("rateLimit", () => {
  let key: string;
  beforeEach(() => {
    key = ns();
  });

  it("allows up to the limit and then refuses", async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await rateLimit(key, { limit: 5, windowSeconds: 600 });
      expect(r.allowed, `attempt ${i}`).toBe(true);
      expect(r.remaining).toBe(5 - i);
    }
    const blocked = await rateLimit(key, { limit: 5, windowSeconds: 600 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("tells the caller how long to wait", async () => {
    await rateLimit(key, { limit: 1, windowSeconds: 600 });
    const blocked = await rateLimit(key, { limit: 1, windowSeconds: 600 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(600);
  });

  it("does not consume the budget once it is already exhausted", async () => {
    await rateLimit(key, { limit: 1, windowSeconds: 600 });
    const a = await rateLimit(key, { limit: 1, windowSeconds: 600 });
    const b = await rateLimit(key, { limit: 1, windowSeconds: 600 });
    // A refused attempt must not extend the window, or an attacker hammering
    // the endpoint would lock the real user out indefinitely.
    expect(b.retryAfterSeconds).toBeLessThanOrEqual(a.retryAfterSeconds);
  });

  it("keeps separate keys separate", async () => {
    const other = ns();
    await rateLimit(key, { limit: 1, windowSeconds: 600 });
    const r = await rateLimit(other, { limit: 1, windowSeconds: 600 });
    expect(r.allowed).toBe(true);
  });

  it("forgets attempts once they fall out of the window", async () => {
    // A one-second window: the first attempt is outside it almost immediately.
    await rateLimit(key, { limit: 1, windowSeconds: 1 });
    expect((await rateLimit(key, { limit: 1, windowSeconds: 1 })).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await rateLimit(key, { limit: 1, windowSeconds: 1 })).allowed).toBe(true);
  });

  it("is a sliding window, not a fixed one", async () => {
    // A fixed window resets on a clock boundary, which lets 2x the limit
    // through across it. Four attempts spread over a 2s window must still
    // refuse the fifth regardless of where the boundary would have fallen.
    for (let i = 0; i < 4; i++) {
      await rateLimit(key, { limit: 4, windowSeconds: 2 });
      await new Promise((r) => setTimeout(r, 120));
    }
    expect((await rateLimit(key, { limit: 4, windowSeconds: 2 })).allowed).toBe(false);
  });

  it("resetLimit clears a key, for use after a successful login", async () => {
    await rateLimit(key, { limit: 1, windowSeconds: 600 });
    expect((await rateLimit(key, { limit: 1, windowSeconds: 600 })).allowed).toBe(false);
    await resetLimit(key);
    expect((await rateLimit(key, { limit: 1, windowSeconds: 600 })).allowed).toBe(true);
  });

  it("fails CLOSED when Redis is unreachable", async () => {
    // A rate limiter that fails open is not a rate limiter. If the store is
    // down, the login and order endpoints it protects must refuse rather than
    // become unlimited.
    const { rateLimitWith } = await import("./rate-limit");
    const broken = {
      eval: () => Promise.reject(new Error("ECONNREFUSED")),
    } as unknown as Parameters<typeof rateLimitWith>[0];
    const r = await rateLimitWith(broken, key, { limit: 5, windowSeconds: 600 });
    expect(r.allowed).toBe(false);
    expect(r.storeUnavailable).toBe(true);
  });
});
