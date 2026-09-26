import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test } from "../fixtures";
import { OWNER, useAdmin } from "./session";

/**
 * The pictures in docs/HANDOFF.md.
 *
 * Generated rather than taken by hand, because a handover document illustrated
 * with screenshots of a version nobody runs any more is worse than one with no
 * pictures at all — the reader trusts the picture and stops reading the text.
 * These come from the same build the suite runs against, so they cannot drift
 * without the suite drifting with them.
 *
 * Numbered to match the order of the document, not the order of the panel.
 *
 * Deliberately not `shot()` from the fixtures: that writes into
 * `qa/final/screens/<project>/` for the viewport matrix, and these belong in
 * one flat folder a Markdown file can point at from a stable path.
 */

const OUT = "qa/final/handoff";

async function shot(page: import("@playwright/test").Page, name: string) {
  const path = join(OUT, `${name}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  // Not fullPage: this is read, not studied. One screen per illustration is
  // clearer than a page nine thousand pixels tall.
  await page.screenshot({ path, animations: "disabled" });
}

test.describe("Иллюстрации для HANDOFF.md", () => {
  test.describe.configure({ mode: "serial" });

  // The document describes production, and production signs in on the
  // password alone. Taken against the default build, the first picture showed
  // «Получить код» and a promise of a Telegram code the client would never
  // receive — and every ordinary run rewrote nine committed images for
  // nothing. So these are taken only on purpose, the way production runs:
  //
  //   ADMIN_LOGIN_REQUIRE_CODE=0 pnpm test:e2e qa/e2e/admin/handoff.spec.ts
  //
  // (with no server already running on the port, so the one Playwright starts
  // inherits the switch).
  test.skip(
    (process.env.ADMIN_LOGIN_REQUIRE_CODE ?? "1").trim() !== "0",
    "HANDOFF.md показывает прод: вход только по паролю",
  );

  test("снимает экраны, на которые ссылается документ", async ({ page }) => {
    // The login screen, before there is a session.
    await page.goto("/admin/login");
    await expect(page.getByLabel("Логин")).toBeVisible();
    await shot(page, "01-login");

    await useAdmin(page, OWNER);

    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "02-products");

    await page.goto("/admin/products/new");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "03-product-form");

    await page.goto("/admin/fragrances/new");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "04-fragrance-form");

    // A product that exists, for the photographs section.
    await page.goto("/admin/products?q=ARM-1040");
    const row = page
      .getByRole("row")
      .filter({ has: page.getByLabel("Выбрать ARM-1040", { exact: true }) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.getByRole("link").first().click();
    const hint = page.getByText(/JPEG, PNG или WebP/);
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await hint.scrollIntoViewIfNeeded();
    await shot(page, "05-photos");

    await page.goto("/admin/import");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "06-import");

    await page.goto("/admin/orders");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "07-orders");

    // The first request in the list, whichever it is.
    const firstOrder = page.locator('main a[href^="/admin/orders/"]').first();
    if (await firstOrder.isVisible().catch(() => false)) {
      await firstOrder.click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
        timeout: 15_000,
      });
      await shot(page, "08-order");
    }

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await shot(page, "09-settings");
  });
});
