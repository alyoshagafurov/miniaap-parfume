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
};

export default nextConfig;
