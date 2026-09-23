import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { sign } from "@tma.js/init-data-node";
import sharp from "sharp";
import { test as base, expect, type Page, type TestInfo } from "@playwright/test";

import { SHOTS } from "../../playwright.config";

/**
 * Shared machinery for the stage-1 end-to-end checks.
 *
 * Two things live here that every spec needs and nobody should re-invent: a
 * Telegram environment convincing enough that the real SDK boots inside it,
 * and a watcher that fails a test when the browser logged an error or a request
 * came back 4xx — because "консоль и сеть — 0 ошибок на каждом экране" is a
 * per-screen assertion, and an assertion nobody writes down is not made.
 */

// ── Telegram ─────────────────────────────────────────────────────────────────

/**
 * The bot token the storefront verifies signatures against.
 *
 * Read from the environment because the server reads it from the same place:
 * signing with a different token than the server holds produces init data that
 * fails exactly the way a forgery does, and the test would report a broken
 * feature instead of a broken fixture.
 */
const BOT_TOKEN = process.env.BOT_TOKEN ?? "";

export interface MockUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

/** A buyer. Not any real Telegram account — the id is in the test range. */
export const BUYER: MockUser = {
  id: 700100200,
  first_name: "Марьям",
  last_name: "Тестова",
  username: "maryam_test",
  language_code: "ru",
};

/**
 * A stable but distinct number derived from a string.
 *
 * Deterministic on purpose: a random one would make a failure impossible to
 * reproduce, and these numbers end up in rate-limit buckets and order rows that
 * outlive the run.
 */
function fingerprint(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * A buyer of this test's own.
 *
 * Placing a request is rate-limited per Telegram account and per address — five
 * in ten minutes, which is right for a wholesale catalog and wrong for a suite
 * that submits a dozen. Sharing one identity across tests made them fail in
 * whatever order they happened to run, which is the worst kind of red: it says
 * the checkout broke when what broke was the fixture.
 *
 * So each test gets its own buyer, and the limit itself is covered by a test
 * that deliberately stays in one bucket.
 */
export function buyerFor(title: string): MockUser {
  const id = 700_000_000 + (fingerprint(title) % 90_000_000);
  return { ...BUYER, id, first_name: "Марьям", username: `test_${id}` };
}

/** The seeded owner, whose Telegram id the admin panel knows. */
export const ADMIN_TELEGRAM_ID = 777000333;

/**
 * Signs launch data the way Telegram does.
 *
 * `authDate` is fixed per call rather than defaulted inside the library so a
 * spec can deliberately produce something a day old and watch it be refused.
 */
export function signInitData(user: MockUser, authDate = new Date()): string {
  if (!BOT_TOKEN) {
    throw new Error(
      "BOT_TOKEN не задан — подписать init data нечем. " +
        "Запускайте e2e с тем же .env, что и сервер.",
    );
  }
  return sign(
    { user, chat_instance: "-1234567890", chat_type: "private" },
    BOT_TOKEN,
    authDate,
  );
}

/**
 * Makes the page look like a Telegram Mini App webview.
 *
 * The SDK finds launch parameters in three places and settles for the first
 * that answers: the URL, the navigation timing entry, and session storage.
 * Only the third survives client-side navigation, which is most of what a
 * buyer does here, so that is the one this writes — under the key and in the
 * shape the SDK's own `mockTelegramEnv` uses.
 *
 * The proxy is not decoration. `viewport.mount()` returns a promise that
 * resolves when the client answers `web_app_request_viewport`; with a proxy
 * that only swallows, it never resolves and the CSS variables stay unbound.
 * So this answers the four request events the boot sequence actually sends.
 */
export async function asTelegram(page: Page, initDataRaw: string): Promise<void> {
  await page.addInitScript(
    ({ raw }: { raw: string }) => {
      const params = new URLSearchParams({
        tgWebAppPlatform: "android",
        tgWebAppVersion: "8.0",
        tgWebAppThemeParams: JSON.stringify({
          bg_color: "#ffffff",
          text_color: "#000000",
          hint_color: "#707579",
          link_color: "#00488f",
          button_color: "#2481cc",
          button_text_color: "#ffffff",
          secondary_bg_color: "#f0f0f0",
        }),
      });
      // Appended by hand: tgWebAppData is a query string inside a query
      // string, and URLSearchParams would encode it a second time.
      const query = `${params.toString()}&tgWebAppData=${encodeURIComponent(raw)}`;
      sessionStorage.setItem("tapps/launchParams", JSON.stringify(query));

      const reply = (event: string, data: unknown) => {
        // Asynchronously, as a real client does — synchronous delivery would
        // resolve promises before the SDK has attached its listener.
        setTimeout(() => {
          const w = window as unknown as {
            Telegram?: { WebView?: { receiveEvent?: (e: string, d: unknown) => void } };
          };
          w.Telegram?.WebView?.receiveEvent?.(event, data);
        }, 0);
      };

      (window as unknown as { TelegramWebviewProxy: unknown }).TelegramWebviewProxy = {
        postEvent(event: string) {
          switch (event) {
            case "web_app_request_viewport":
              reply("viewport_changed", {
                height: window.innerHeight,
                width: window.innerWidth,
                is_state_stable: true,
                is_expanded: true,
              });
              break;
            case "web_app_request_theme":
              reply("theme_changed", { theme_params: { bg_color: "#ffffff" } });
              break;
            case "web_app_request_safe_area":
              reply("safe_area_changed", { top: 0, bottom: 0, left: 0, right: 0 });
              break;
            case "web_app_request_content_safe_area":
              reply("content_safe_area_changed", { top: 0, bottom: 0, left: 0, right: 0 });
              break;
            default:
              // Everything else — setHeaderColor, haptics, MainButton — is
              // fire-and-forget in the real client too.
              break;
          }
        },
      };
    },
    { raw: initDataRaw },
  );
}

// ── The basket ───────────────────────────────────────────────────────────────

export interface SeedLine {
  productId: string;
  qty: number;
  seenPriceKop: number;
  seenPackSize: number;
  seenStock: "IN_STOCK" | "LOW" | "OUT" | "PREORDER";
  slug: string;
  title: string;
  brandName: string;
  format: string;
  imageKey: string | null;
}

/**
 * Puts a basket in place before the page loads.
 *
 * Adding items through the interface is the right way to test adding items;
 * it is the wrong way to arrive at the request screen for the twentieth time.
 * The shape is `src/lib/cart.ts`'s, version and all — a mismatch is discarded
 * silently by design, so a wrong fixture would look like an empty basket.
 */
export async function seedCart(page: Page, lines: SeedLine[]): Promise<void> {
  await page.addInitScript((payload: { v: number; lines: SeedLine[] }) => {
    localStorage.setItem("arumi.cart.v1", JSON.stringify(payload));
  }, { v: 1, lines });
}

// ── Console and network ──────────────────────────────────────────────────────

export interface Audit {
  /**
   * Tolerate one expected failure. Takes a substring or pattern matched
   * against the console text or the request URL, plus why it is expected —
   * an unexplained exemption is how a suite stops finding anything.
   */
  allow: (match: string | RegExp, because: string) => void;
  /** What has been seen so far, for a spec that wants to assert on it. */
  problems: () => string[];
}

interface Allowance {
  match: string | RegExp;
  because: string;
}

function matches(allowance: Allowance, text: string): boolean {
  return typeof allowance.match === "string"
    ? text.includes(allowance.match)
    : allowance.match.test(text);
}

/**
 * Screenshot into the stage-1 evidence folder, named by project.
 *
 * `fullPage` deliberately: a 390-wide screen that is correct above the fold
 * and broken below it is a broken screen, and the viewport crop is exactly
 * where that hides.
 */
export async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = join(SHOTS, info.project.name, `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  // Let fonts settle: Cormorant arriving late redraws every heading, and a
  // screenshot taken mid-swap shows the fallback.
  await page.evaluate(() => document.fonts.ready);
  const shot = await page.screenshot({ fullPage: true, animations: "disabled" });

  // Re-encoded to a palette before it is written. These are screenshots of a
  // cream interface with two greens and a gold rule — a few dozen colours, not
  // a few million — and full-colour PNG at a phone's pixel ratio turned the
  // evidence folder into thirty megabytes of a repository that has to be
  // cloned. A palette is lossless for flat interface colour; photographs are
  // placeholders here, and the dithering keeps even those readable.
  await sharp(shot).png({ palette: true, quality: 90, effort: 7 }).toFile(path);
}

export const test = base.extend<{ audit: Audit }>({
  /**
   * Wait out React's streaming placeholders before a test looks at the page.
   *
   * While a Suspense boundary is being swapped in, its content exists twice:
   * once in place and once in a `<div hidden id="S:n">` that an inline script
   * removes a moment later. Both match a text query, so an ordinary
   * `getByText` hits strict mode and the test fails with two copies of exactly
   * the content it was looking for — a flake that reads like a duplicated
   * element on the page.
   *
   * Every assertion could filter for visibility instead, but that is a rule
   * every future spec would have to remember, so it is done once here.
   */
  page: async ({ page }, use) => {
    const navigate = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await navigate(url, options);
      await page
        .waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, {
          timeout: 5_000,
        })
        // A boundary that never resolves is the test's business, not this
        // fixture's: let the assertion report it.
        .catch(() => undefined);
      return response;
    };
    await use(page);
  },

  /**
   * Every test arrives from its own address.
   *
   * `x-real-ip` is exactly what the stage-3 relay will set and overwrite, so
   * this is not a back door the suite invented — it is the header the
   * application is built to read. Without it all of Playwright's workers share
   * 127.0.0.1's bucket and trip a limit meant for one buyer.
   */
  contextOptions: async ({ contextOptions }, use, testInfo) => {
    // The project belongs in the fingerprint. Without it the same test at three
    // viewports arrives from one address, and a spec that submits twice uses
    // six of the five requests a buyer is allowed in ten minutes — so the
    // desktop run passed and the mobile one failed at checkout, which reads
    // like a mobile bug and is not one.
    const n = fingerprint(`${testInfo.project.name} › ${testInfo.titlePath.join(" › ")}`);
    const ip = `10.${(n >> 16) & 0xff}.${(n >> 8) & 0xff}.${(n % 254) + 1}`;
    await use({
      ...contextOptions,
      extraHTTPHeaders: { ...contextOptions.extraHTTPHeaders, "x-real-ip": ip },
    });
  },

  audit: [
    async ({ page }, use) => {
      const allowances: Allowance[] = [];
      const problems: string[] = [];

      const record = (text: string) => {
        if (allowances.some((a) => matches(a, text))) return;
        problems.push(text);
      };

      page.on("console", (message) => {
        if (message.type() !== "error") return;
        record(`console: ${message.text()}`);
      });

      // An exception that reaches the top is an error even when nothing in the
      // page logged it.
      page.on("pageerror", (error) => record(`pageerror: ${error.message}`));

      page.on("requestfailed", (request) => {
        const failure = request.failure()?.errorText ?? "неизвестно";
        // A navigation the test itself cancelled is not a defect.
        if (failure.includes("net::ERR_ABORTED")) return;
        record(`requestfailed: ${request.url()} — ${failure}`);
      });

      page.on("response", (response) => {
        if (response.status() < 400) return;
        record(`http ${response.status()}: ${response.url()}`);
      });

      await use({
        allow: (match, because) => allowances.push({ match, because }),
        problems: () => [...problems],
      });

      expect(problems, "консоль и сеть должны быть чистыми").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * How many products a listing says it found.
 *
 * Scoped to what is visible, because React's streaming leaves the pre-swap
 * copy of a Suspense boundary in the document inside a `hidden` div until its
 * inline script runs. A plain text match hits both and fails strict mode about
 * one run in three — a flake that says nothing about the catalog.
 */
export async function foundCount(page: Page): Promise<number> {
  const label = page.getByText(/Найдено: \d+/).filter({ visible: true }).first();
  await expect(label).toBeVisible();
  return Number((await label.innerText()).replace(/\D+/g, ""));
}
