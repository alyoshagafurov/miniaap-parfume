import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
