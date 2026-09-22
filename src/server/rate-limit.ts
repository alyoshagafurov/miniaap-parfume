import Redis from "ioredis";

/**
 * Rate limiting.
 *
 * Protects the two places where repetition is the attack: admin login
 * (5 per 15 minutes) and order submission (5 per 10 minutes, per user and per
 * IP separately).
 *
 * A sliding window, not a fixed one. A fixed window resets on a clock boundary,
 * which lets twice the limit through by straddling it — 10 password attempts
 * instead of 5. The window here is a sorted set of attempt timestamps: old
 * entries are dropped, the rest counted, and a new one added only if the
 * attempt is allowed. At these limits the set holds a handful of members, so
 * the cost is trivial.
 *
 * It fails CLOSED. A rate limiter that fails open is not a rate limiter: if
 * Redis is down, the endpoints it guards must refuse rather than become
 * unlimited.
 */

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the oldest attempt leaves the window. 0 when allowed. */
  retryAfterSeconds: number;
  /** True when this was a fail-closed refusal rather than a real count. */
  storeUnavailable: boolean;
}

/**
 * Sliding-window check, as one atomic script.
 *
 * Atomicity matters: read-then-write from the application would let two
 * concurrent requests both observe "4 used" and both proceed.
 *
 * A refused attempt is deliberately NOT recorded. Recording it would let
 * someone hammering the endpoint keep the window permanently full and lock the
 * legitimate user out for as long as they cared to continue.
 */
const SLIDING_WINDOW = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local cutoff = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)
local used = redis.call('ZCARD', key)

if used >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry = 0
  if oldest[2] then
    retry = math.ceil((tonumber(oldest[2]) + window - now) / 1000)
    if retry < 1 then retry = 1 end
  end
  return {0, 0, retry}
end

redis.call('ZADD', key, now, now .. '-' .. math.random(100000))
redis.call('PEXPIRE', key, window)
return {1, limit - used - 1, 0}
`;

/** The subset of a Redis client this module needs, so tests can substitute one. */
export interface EvalCapable {
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
}

let client: Redis | undefined;

function redis(): Redis {
  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL не задан — проверьте .env");
    client = new Redis(url, {
      // Fail fast rather than queueing behind a dead server: a login page that
      // hangs is worse than one that says the service is unavailable.
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      // The offline queue stays ON, deliberately. With it off, the very first
      // command after process start is rejected because the connection is not
      // ready yet — which this module turns into a fail-closed refusal, so the
      // first real login after every deploy would be denied. The tests caught
      // exactly that. A genuinely unreachable Redis still fails, via
      // connectTimeout, and still fails closed.
      enableOfflineQueue: true,
    });
    // Without a listener ioredis emits an unhandled 'error' event and takes the
    // process down. Connection failures surface at the call site instead.
    client.on("error", () => {});
  }
  return client;
}

export async function rateLimitWith(
  store: EvalCapable,
  key: string,
  { limit, windowSeconds }: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  try {
    const raw = (await store.eval(
      SLIDING_WINDOW,
      1,
      `rl:${key}`,
      now,
      windowSeconds * 1000,
      limit,
    )) as [number, number, number];

    return {
      allowed: raw[0] === 1,
      remaining: raw[1],
      retryAfterSeconds: raw[2],
      storeUnavailable: false,
    };
  } catch {
    // Fail closed. The caller decides how to phrase it; what matters is that an
    // unreachable limiter never becomes an absent one.
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: windowSeconds,
      storeUnavailable: true,
    };
  }
}

export function rateLimit(
  key: string,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  let store: EvalCapable;
  try {
    store = redis();
  } catch {
    return Promise.resolve({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: options.windowSeconds,
      storeUnavailable: true,
    });
  }
  return rateLimitWith(store, key, options);
}

/**
 * Clears a key. Called after a successful login, so someone who mistyped their
 * password four times is not still throttled afterwards.
 */
export async function resetLimit(key: string): Promise<void> {
  try {
    await redis().del(`rl:${key}`);
  } catch {
    // Nothing to clear if the store is unreachable.
  }
}

/** Tests and the bot's graceful shutdown close the connection explicitly. */
export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => undefined);
    client = undefined;
  }
}
