import Redis from "ioredis";

/**
 * A clean slate for the rate limiter before every run.
 *
 * Placing a request is limited to five in ten minutes per address and per
 * Telegram account, which is right for a wholesale catalog and fatal for a
 * suite that is run repeatedly while it is being written. Each test arrives
 * from its own derived address, but that address is derived from the test's
 * title and is therefore the same on the next run — so the fourth run in an
 * afternoon started failing at checkout, and the failure pointed at the
 * checkout rather than at the bucket.
 *
 * This clears only the limiter's own keys, and only those: order counters,
 * login attempts, code requests. The limiter is not being disabled anywhere —
 * one spec deliberately stays in a single bucket and asserts that the sixth
 * request is refused.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("REDIS_URL не задан — лимиты не очищены, повторные прогоны могут упираться в них");
    return;
  }

  const redis = new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
  try {
    await redis.connect();
    let cursor = "0";
    let removed = 0;
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", "rl:*", "COUNT", 500);
      cursor = next;
      if (keys.length > 0) removed += await redis.del(...keys);
    } while (cursor !== "0");
    if (removed > 0) console.log(`Очищено счётчиков лимитов: ${removed}`);
  } catch (error) {
    // Not fatal. Without Redis the limiter fails open in development, and the
    // suite is about the catalog, not about the limiter's storage.
    console.warn(`Не удалось очистить лимиты: ${error instanceof Error ? error.message : error}`);
  } finally {
    redis.disconnect();
  }
}
