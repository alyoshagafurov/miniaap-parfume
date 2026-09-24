/**
 * Public URLs for stored objects.
 *
 * In src/lib and not src/server, because this runs in three places: a server
 * component, the bot process, and — the one that is easy to miss — a client
 * component. A product grid that grows by a Server Action renders its new cards
 * in the browser, and those cards need image URLs there.
 *
 * ── Two ways a photograph can be reachable ──
 *
 * **A public bucket.** Yandex Object Storage, MinIO in development, any S3 with
 * anonymous read. `NEXT_PUBLIC_S3_PUBLIC_URL` is its origin, the browser
 * fetches straight from it, and the application never sees the bytes. This is
 * the path the VPS deployment uses.
 *
 * **A private bucket, proxied.** Railway Buckets are S3-compatible and cannot
 * be made public — their own documentation says so — so there is no origin to
 * point an `<img>` at. Everything then goes through `/api/media/…`, which reads
 * the object with the bucket's credentials and answers with an immutable cache
 * header.
 *
 * Presigned URLs were the other option and are the wrong one here. They expire,
 * and this catalog puts image URLs in two places that outlive any expiry: HTML
 * held by `'use cache'` for hours, and a basket kept in a buyer's localStorage
 * for days. A link that works when it is written and 404s when it is read is
 * worse than a proxy.
 *
 * Which of the two is in force is decided by one variable being set or not, so
 * moving between them is configuration rather than code.
 */

/** Where the proxy lives. Relative on purpose — it works in a browser too. */
const PROXY_PREFIX = "/api/media/";

function publicBase(): string {
  return (process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? "").replace(/\/+$/, "");
}

export function objectUrl(key: string): string {
  const clean = key.replace(/^\/+/, "");
  const base = publicBase();
  // NEXT_PUBLIC_ is inlined at build, so this branch is decided then and the
  // unused one costs nothing at runtime.
  return base ? `${base}/${clean}` : `${PROXY_PREFIX}${clean}`;
}

/**
 * The same object, as an address something outside the browser can fetch.
 *
 * Telegram is handed a URL and fetches the banner itself, so a relative path is
 * useless to it. `origin` is the storefront's own address — MINI_APP_URL in the
 * bot — and is ignored entirely when the bucket is public, because then the
 * object already has an absolute address of its own.
 */
export function absoluteObjectUrl(key: string, origin: string): string {
  const url = objectUrl(key);
  if (/^https?:\/\//i.test(url)) return url;
  return `${origin.replace(/\/+$/, "")}${url}`;
}
