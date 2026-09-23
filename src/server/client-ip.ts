import { headers } from "next/headers";

/**
 * Where a request came from, for rate limiting.
 *
 * The naive reading — the leftmost value of `x-forwarded-for` — is correct
 * under exactly one proxy configuration: `proxy_set_header X-Forwarded-For
 * $remote_addr`, which OVERWRITES. nginx's own documented idiom is
 * `$proxy_add_x_forwarded_for`, which APPENDS, and under that the client's
 * forged value stays leftmost while the real address goes last. The failure is
 * silent: no error, nothing in a log, the limiter simply never fires. Anyone
 * can then send `X-Forwarded-For: 10.0.0.<n>` with a fresh n per request and
 * submit orders or guess passwords without limit.
 *
 * So this does not guess. `X-Real-IP` is preferred, because a proxy writes it
 * from `$remote_addr` and a client cannot append to it; `x-forwarded-for` is
 * read only with an explicit hop count, from the RIGHT, where the addresses
 * added by proxies we control are.
 *
 * And it can return null. The previous code collapsed every unresolvable
 * caller into one shared bucket named "unknown", which means a missing header
 * would have put the whole internet on a single five-per-ten-minutes budget and
 * stopped the storefront taking orders. Refusing one request is better than
 * refusing everyone.
 */

/**
 * How many proxies append to x-forwarded-for between the client and this
 * process. 1 for a single relay. Only consulted when X-Real-IP is absent.
 */
function trustedHops(): number {
  const raw = Number(process.env.TRUSTED_PROXY_HOPS ?? "1");
  return Number.isInteger(raw) && raw >= 1 ? raw : 1;
}

export async function clientIp(): Promise<string | null> {
  const h = await headers();

  // Written by the proxy from $remote_addr; a client cannot extend it.
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;

  const chain = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (chain.length === 0) return null;

  // Counted from the right: the last entry was added by the nearest proxy.
  const index = chain.length - trustedHops();
  return index >= 0 ? (chain[index] ?? null) : null;
}
