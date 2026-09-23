import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Storefront reads are cached with 'use cache' and invalidated by tag from
  // the admin Server Actions. Without this flag those directives are inert and
  // the catalog is baked in at build time — the build output said
  // "prerendered as static content" for a page that reads the database.
  // Top-level in Next 16: experimental.dynamicIO and experimental.useCache were
  // removed, and experimental.ppr is now implied by this.
  cacheComponents: true,

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
   * Only the ones that cannot break a Mini App. Telegram Desktop loads a Mini
   * App inside an iframe, so `X-Frame-Options: DENY` would blank the catalog
   * for every desktop user — the clickjacking defence has to be
   * `frame-ancestors` naming Telegram instead, which is both stricter and
   * correct here.
   *
   * `nosniff` matters more than usual: this application serves files an
   * administrator uploaded, and although they are decoded and re-encoded by
   * sharp before storage, a browser that sniffs a response body for a type is
   * one bad content-type away from executing it.
   *
   * Deliberately NOT here, and recorded as stage-3 work at the reverse proxy:
   * a full Content-Security-Policy, which needs a nonce and middleware and
   * would be tuned against the real Telegram webview rather than guessed at;
   * and Strict-Transport-Security, which is meaningless until there is HTTPS
   * and dangerous to set from an application that might be served over http.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
          },
        ],
      },
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
