/**
 * Public URLs for stored objects.
 *
 * In src/lib and not src/server, because this runs in three places: a server
 * component, the bot process, and — the one that is easy to miss — a client
 * component. A product grid that grows by a Server Action renders its new cards
 * in the browser, and those cards need image URLs there.
 *
 * Hence NEXT_PUBLIC_. The bucket's base URL is not a secret: it is in the `src`
 * of every image on the site. What would be a mistake is leaving it
 * server-only, because `process.env.SOMETHING` is simply `undefined` in the
 * browser — no error, no warning, just every image on a client-rendered card
 * pointing at a path with the origin missing.
 */
export function objectUrl(key: string): string {
  const base = (process.env.NEXT_PUBLIC_S3_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const clean = key.replace(/^\/+/, "");
  return `${base}/${clean}`;
}
