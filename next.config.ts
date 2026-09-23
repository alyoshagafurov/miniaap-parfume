import type { NextConfig } from "next";

/**
 * The origin product photographs are served from.
 *
 * Read here rather than hard-coded because it differs per environment — MinIO
 * on a laptop, an S3 bucket or a CDN in production — and a Content-Security
 * -Policy that does not name it blocks every picture in the catalog.
 */
function imageOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_S3_PUBLIC_URL;
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    // A malformed value is the deploy check's business, not the build's. An
    // empty string here simply omits it from the policy, and the missing images
    // are then visible immediately rather than after a confusing green build.
    return "";
  }
}

/**
 * Yandex Metrica, when it is switched on.
 *
 * Off entirely when the counter id is unset, so the policy does not name a
 * third party the deployment is not talking to.
 */
const METRICA_ENABLED = Boolean(process.env.NEXT_PUBLIC_YANDEX_METRICA_ID);
const METRICA_ORIGINS = ["https://mc.yandex.ru", "https://mc.yandex.com"];

/**
 * The Content-Security-Policy, in enforce mode.
 *
 * ── Why `script-src` carries 'unsafe-inline' ──
 *
 * React streams the RSC payload as a sequence of inline `<script>` elements
 * baked into the HTML at build time for every prerendered shell. Allowing them
 * takes either a per-request nonce or 'unsafe-inline', and a nonce has to be
 * generated in middleware — which makes every response dynamic and gives up the
 * prerendered shell this storefront's Performance 99 is built on.
 *
 * So the trade is stated rather than hidden. What makes it defensible here:
 * there is no user-generated HTML anywhere in this product, not one
 * `dangerouslySetInnerHTML` in the tree, and React escapes every interpolation.
 * What makes it still worth having: `object-src 'none'`, `base-uri 'self'` and
 * `form-action 'self'` block the escalations that turn a hypothetical injection
 * into a stolen session or an exfiltrated request, and `frame-ancestors` is the
 * clickjacking defence `X-Frame-Options` cannot express here.
 *
 * Revisit when Next can attach a nonce to a prerendered shell.
 *
 * ── Why `frame-ancestors` names Telegram ──
 *
 * Telegram Desktop opens a Mini App in an iframe on web.telegram.org, so
 * `X-Frame-Options: DENY` would blank the catalog for every desktop buyer. The
 * named ancestors are both stricter and correct.
 */
function contentSecurityPolicy(): string {
  const images = imageOrigin();
  const metrica = METRICA_ENABLED ? METRICA_ORIGINS : [];

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // See above. 'unsafe-eval' is deliberately absent — nothing here needs it.
    "script-src": ["'self'", "'unsafe-inline'", ...metrica],
    // next/font emits an inline <style> for the @font-face block, and React
    // sets style attributes for the image blur placeholders.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", images, ...metrica].filter(Boolean),
    "font-src": ["'self'"],
    // Server Actions post to the same origin. The object store is listed for
    // the admin's direct uploads.
    "connect-src": ["'self'", images, ...metrica].filter(Boolean),
    // Telegram's own client frames us; we frame nobody.
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'", "https://web.telegram.org", "https://*.telegram.org"],
    // Behind Caddy everything is already HTTPS; this catches a stale http://
    // asset URL left in the database rather than letting it load mixed.
    "upgrade-insecure-requests": [],
  };

  return Object.entries(directives)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

/**
 * Report-only, for the first deploy.
 *
 * A policy this long has one honest way to be introduced: watch what it would
 * have blocked on the real Telegram webview for a day, then enforce. Set
 * CSP_REPORT_ONLY=true for that day. Enforcing is the default, so forgetting to
 * unset it is the mistake that leaves you *more* protected, not less.
 */
const CSP_HEADER = process.env.CSP_REPORT_ONLY
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

const nextConfig: NextConfig = {
  // Storefront reads are cached with 'use cache' and invalidated by tag from
  // the admin Server Actions. Without this flag those directives are inert and
  // the catalog is baked in at build time — the build output said
  // "prerendered as static content" for a page that reads the database.
  // Top-level in Next 16: experimental.dynamicIO and experimental.useCache were
  // removed, and experimental.ppr is now implied by this.
  cacheComponents: true,

  // Everything the container needs in one directory, so the production image
  // does not ship node_modules. Without it the image is roughly a gigabyte.
  output: "standalone",

  // Fail the production build on a type error rather than shipping it. Next 16
  // removed the eslint key along with `next lint`, so linting is its own step
  // in `pnpm verify` and in CI.
  typescript: { ignoreBuildErrors: false },

  images: {
    // Product images are pre-rendered to AVIF/WebP at three widths by sharp on
    // upload, so Next's optimiser has nothing left to do and would only add a
    // second cache to keep warm on a small VPS. Sizes are known at render time
    // from ProductImage, so this costs no layout stability.
    unoptimized: true,
  },

  // The catalog must stay usable if Telegram is unreachable, so nothing here
  // may depend on a Telegram-only origin.
  poweredByHeader: false,
  reactStrictMode: true,

  /**
   * Response headers.
   *
   * `nosniff` covers what Next serves. It does NOT cover the product
   * photographs: those come from the object store on its own origin, and these
   * headers do not reach it. The same header belongs on the bucket — see
   * docs/DEPLOY.md, which sets it there.
   */
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
      { key: CSP_HEADER, value: contentSecurityPolicy() },
    ];

    // HSTS only when asked for, and asked for only once the certificate is
    // known good. Setting it from an application that might still be reached
    // over http locks a browser out of the site for the whole max-age.
    if (process.env.ENABLE_HSTS) {
      security.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains",
      });
    }

    return [
      { source: "/:path*", headers: security },
      {
        // The back office has no business in an index, header as well as meta:
        // a crawler that ignores one may respect the other.
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
