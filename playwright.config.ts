import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks for stage 1.
 *
 * Three viewports, because the brief names three: a desktop admin at 1440, a
 * tablet, and the phone inside Telegram at 390×844 — which is where nine out
 * of ten buyers are and therefore the one that decides whether this works.
 *
 * Everything runs against the production build rather than `next dev`. Under
 * cacheComponents the two are genuinely different programs: dev re-renders on
 * every request and prints its own overlay, so "no console errors" measured
 * there would be measured on code the buyer never runs. `pnpm start` also
 * exercises the cache the storefront depends on, which is the part most likely
 * to serve a stale price.
 *
 * Only Chromium. The Telegram in-app browser is Chromium on Android and
 * WKWebView on iOS; Playwright's WebKit is a close stand-in for the latter but
 * not the same engine, and installing it to draw a conclusion it cannot support
 * would be worse than saying plainly that iOS was checked by hand.
 */

// The same .env the server reads. The Telegram fixtures sign init data with
// BOT_TOKEN, and signing with a different token than the server verifies
// against fails exactly the way a forgery does — a broken fixture would read
// as a broken feature.
try {
  process.loadEnvFile(".env");
} catch {
  // Absent .env: the specs that need a token say so by name when they run.
}

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

/**
 * Where the evidence goes.
 *
 * `qa/final` rather than `qa/stage-1`: these are the screens as delivered, and
 * the stage-1 set is kept where it is as the before-picture of the visual pass.
 */
export const SHOTS = "qa/final/screens";

export default defineConfig({
  testDir: "qa/e2e",
  globalSetup: "./qa/e2e/global-setup.ts",
  outputDir: "qa/final/test-results",
  // Storefront specs are read-only and safe together; the admin specs write to
  // the same catalog, so they declare their own serial mode.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // The database is one shared resource. More workers than this and the admin
  // suite's edits start overlapping the storefront's reads.
  workers: 4,
  reporter: [
    ["list"],
    ["html", { outputFolder: "qa/final/playwright-report", open: "never" }],
    ["json", { outputFile: "qa/final/playwright-results.json" }],
  ],
  expect: {
    // A cold production server compiles nothing but does hit Postgres; the
    // first listing after a restart is slower than the rest.
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    trace: "retain-on-failure",
    video: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "desktop",
      testMatch: /shop\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet",
      testMatch: /shop\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
    {
      name: "mobile",
      testMatch: /shop\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      // The admin panel at the desk. This is the only project that writes to
      // the catalog, and it runs alone.
      name: "admin",
      testMatch: /admin\/.*\.spec\.ts/,
      workers: 1,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // The same panel on a phone — the warehouse manager adding a photo while
      // standing at the shelf. Read-only: it looks, it does not edit.
      name: "admin-mobile",
      testMatch: /admin\/view\.spec\.ts/,
      workers: 1,
      // After the desk project, never beside it: both sign in as the owner, and
      // two codes in flight for one Telegram account are two codes either
      // login could pick up.
      dependencies: ["admin"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
