/**
 * Public URLs for stored objects.
 *
 * Kept separate from the S3 client so that anything only needing to render a
 * URL — the bot, a server component — does not pull in the AWS SDK.
 */
export function objectUrl(key: string): string {
  const base = (process.env.S3_PUBLIC_URL ?? "").replace(/\/+$/, "");
  const clean = key.replace(/^\/+/, "");
  return `${base}/${clean}`;
}
