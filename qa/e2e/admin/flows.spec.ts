import { join } from "node:path";

import { expect, shot, test } from "../fixtures";
import { OWNER, useAdmin } from "./session";

/**
 * The three admin actions that reach outside the panel.
 *
 * A price edit has to appear on a cached storefront, a photograph from a phone
 * has to land upright, and a file that is not a photograph has to be refused by
 * name rather than by stack trace. Everything else about the panel is covered
 * by unit tests and by the read-only tour; these are the ones that can only be
 * proved by doing them.
 *
 * Serial, and the only project that writes: two of these change the catalog.
 */

const MEDIA = "qa/e2e/media";

test.describe("Админка — действия", () => {
  test.describe.configure({ mode: "serial" });

  test("правка цены в админке доходит до витрины", async ({ page, browser }, info) => {
    await useAdmin(page, OWNER);
    await page.goto("/admin/products?q=ARM-1040");

    // The exact row, not the first match. Searching «ARM-1040» also finds the
    // twenty bulk copies ARM-1040-01…-19, and the first of those is a different
    // product with a different storefront address — editing it would leave this
    // test asserting that one page changed because another one was edited.
    const row = page
      .getByRole("row")
      .filter({ has: page.getByLabel("Выбрать ARM-1040", { exact: true }) });
    await expect(row).toBeVisible({ timeout: 15_000 });
    const cell = row.getByRole("button", { name: /^Изменить цену/ });

    const before = Number((await cell.innerText()).replace(/\D+/g, ""));
    expect(before).toBeGreaterThan(0);

    // The cell shows rubles; the database holds kopecks. Two fixed values that
    // take turns, rather than an increment: an increment walks the price
    // somewhere new on every run and eventually somewhere absurd, and a single
    // fixed value makes the second run assert that an unchanged price is
    // unchanged — which would pass with the invalidation removed.
    const rubles = before === 4321 ? 5432 : 4321;

    await cell.click();
    const field = row.getByRole("textbox", { name: "Цена в рублях" });
    await expect(field).toBeVisible();
    await field.fill(String(rubles));
    await field.press("Enter");

    // Compared as a number: 4 321 ₽ is printed with a thin space between the
    // thousands, so the digits never appear consecutively in the text.
    await expect
      .poll(async () => Number((await cell.innerText()).replace(/\D+/g, "")), {
        message: "цена в таблице не обновилась",
        timeout: 15_000,
      })
      .toBe(rubles);
    await shot(page, info, "34-admin-price-edited");

    // A separate context: no session, no client cache, nothing carried over —
    // the storefront as a buyer meets it. The tag has to have been invalidated
    // after the commit for this to be the new number.
    const shop = await browser.newContext();
    const buyer = await shop.newPage();
    await buyer.goto(
      `${test.info().project.use.baseURL ?? "http://localhost:3100"}/p/lancome-idole-35ml-arm-1040`,
    );
    // Read the price the way the page states it, rather than looking for the
    // digits anywhere on the screen: the related-products rail carries prices
    // too, and a match there would pass without the product's own price moving.
    await expect
      .poll(
        async () =>
          buyer.locator("main").evaluate((main) => {
            for (const span of main.querySelectorAll("span")) {
              if (
                span.children.length === 0 &&
                (span.textContent ?? "").includes("₽")
              ) {
                return Number((span.textContent ?? "").replace(/\D+/g, ""));
              }
            }
            return 0;
          }),
        { message: "витрина осталась со старой ценой", timeout: 15_000 },
      )
      .toBe(rubles);
    await shop.close();
  });

  test("фотография с телефона встаёт вертикально, а не боком", async ({
    page,
  }, info) => {
    await useAdmin(page, OWNER);
    await page.goto("/admin/products?q=ARM-1040");
    await page
      .getByRole("link", { name: /ARM-1040|Idôle/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    const photos = page.getByRole("listitem").filter({ has: page.locator("img") });

    // Read the baseline only once the section has rendered. Counting a list
    // that has not painted yet returns zero, and every later assertion is then
    // measured from a floor that was never true.
    await expect(page.getByText(/JPEG, PNG или WebP, до \d+ МБ/)).toBeVisible();
    const before = await photos.count();

    // Two at once: a failure in one must not cancel the other, and the pair is
    // the case дополнение №4 describes.
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles([join(MEDIA, "phone-portrait.jpg"), join(MEDIA, "upright.jpg")]);

    await expect
      .poll(async () => photos.count(), {
        message: "фотографии не появились",
        timeout: 45_000,
      })
      .toBe(before + 2);

    // 1200×600 with orientation 6 is a portrait photograph. If the metadata was
    // stripped before `.rotate()`, it lands 1200 wide and this is where the
    // catalog goes sideways.
    const shapes = await page
      .getByRole("listitem")
      .locator("img")
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const img = n as HTMLImageElement;
          return { w: img.naturalWidth, h: img.naturalHeight };
        }),
      );
    const portrait = shapes.filter((s) => s.h > s.w);
    expect(
      portrait.length,
      `ни одна фотография не вертикальная: ${JSON.stringify(shapes)}`,
    ).toBeGreaterThan(0);

    await shot(page, info, "35-admin-photos");

    // Put the product back. Without this the fixture grows by two photographs
    // every run, and «выросло на два» is measured against a product that by
    // Friday has thirty pictures of a flat olive rectangle.
    for (let i = 0; i < 2; i += 1) {
      await photos.last().getByRole("button", { name: "Удалить" }).click();
      await expect
        .poll(async () => photos.count(), { timeout: 15_000 })
        .toBe(before + 1 - i);
    }
  });

  test("HEIC и не-картинка отказываются по-человечески, а не пятисоткой", async ({
    page,
    audit,
  }, info) => {
    // Both refusals are 400s on purpose — the point of this test is that they
    // are 400 and not 500. Chromium logs the status to the console without the
    // URL, so the allowance has to cover both shapes.
    audit.allow("/api/admin/images", "загрузка должна ответить отказом, а не успехом");
    audit.allow("status of 400", "тот же самый ожидаемый отказ, глазами консоли");

    await useAdmin(page, OWNER);
    await page.goto("/admin/products?q=ARM-1040");
    await page
      .getByRole("link", { name: /ARM-1040|Idôle/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 15_000,
    });

    const file = page.locator('input[type="file"]').first();

    await file.setInputFiles(join(MEDIA, "iphone.heic"));
    // The named refusal — «сохраните его как JPEG» — not the generic «не
    // удалось прочитать файл», and not a 500. sharp here has no libheif and
    // throws on open, before any format check, so the container has to be
    // recognised first or an iPhone photo becomes a server error.
    await expect(page.getByText(/HEIC.*Сохраните его как JPEG/s)).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, info, "36-admin-heic-refused");

    // No reload between the two. The file input is `sr-only` and its change
    // handler is React's, so setting files on a freshly reloaded page can land
    // before hydration and go nowhere — a race a person cannot have, because
    // the only way to that input is a button whose onClick is React's too. The
    // two refusals read differently, so they can sit on screen together.
    await file.setInputFiles(join(MEDIA, "not-an-image.jpg"));
    await expect(page.getByText(/Нужен JPEG, PNG или WebP/)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("выгрузка и повторная загрузка того же файла — обновление, а не дубли", async ({
    page,
  }, info) => {
    await useAdmin(page, OWNER);
    await page.goto("/admin/import");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // The panel's own export, fed straight back into its own import: the
    // round trip the screen promises in so many words.
    const download = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("link", { name: /Выгрузить|Экспорт/ })
        .first()
        .click(),
    ]).then(([d]) => d);

    // Saved under its real name. The import picks its parser from the file
    // name, and Playwright's own download path is a random temp file with no
    // extension at all — which the route correctly refuses as "neither .xlsx
    // nor .csv", and which says nothing about the round trip.
    const name = download.suggestedFilename();
    expect(name, "выгрузка пришла без имени").toMatch(/\.xlsx$/);
    const path = info.outputPath(name);
    await download.saveAs(path);

    await page.locator('input[type="file"]').first().setInputFiles(path);

    await expect(page.getByText(/Готово к загрузке: \d+ строк/)).toBeVisible({
      timeout: 60_000,
    });
    const summary = await page.getByText(/Готово к загрузке: \d+ строк/).innerText();
    expect(summary, "повторная загрузка собственной выгрузки дала ошибки").not.toMatch(
      /с ошибками: [1-9]/,
    );

    await shot(page, info, "37-admin-import-preview");
  });
});
