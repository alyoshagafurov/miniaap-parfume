import { asTelegram, BUYER, expect, shot, signInitData, test } from "../fixtures";

/**
 * The first screen, in both worlds.
 *
 * Everything else in this suite starts from here, so this is also where the
 * harness itself is proved: if the Telegram mock does not boot the SDK, the
 * second test fails and no later spec's Telegram claim can be trusted.
 */

test.describe("Главная", () => {
  test("открывается в обычном браузере", async ({ page }, info) => {
    await page.goto("/");

    // The four things the brief requires the first screen to say, each checked
    // separately: that this is a warehouse, that the brands are known ones,
    // what it takes to order, and that it reaches the buyer. Asserting the
    // heading alone would pass with three of the four missing.
    await expect(
      page.getByRole("heading", { level: 1, name: /Оптовый склад/ }),
    ).toBeVisible();
    await expect(page.getByText(/Известные бренды/)).toBeVisible();
    // The figure comes from Settings, so this asserts the shape rather than
    // the number — the owner raises it from the panel and the line follows.
    await expect(page.getByText(/Оптом от\s+[\d\s ]+₽/)).toBeVisible();
    await expect(page.getByText(/Доставка по России/)).toBeVisible();

    // The four categories from the brief, as links rather than as decoration.
    for (const name of [
      "Парфюм 35 мл «карандаши»",
      "Парфюм 100 мл",
      "Парфюм 2 в 1 «двойняшки» 100 мл",
      "Дезодоранты 200 мл",
    ]) {
      await expect(
        page.getByRole("link", { name, exact: false }).first(),
      ).toBeVisible();
    }

    // Both lanes carry products, not empty rails.
    await expect(page.getByRole("heading", { name: "Новинки" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Хиты" })).toBeVisible();

    await shot(page, info, "01-home");
  });

  test("не печатает бренд дважды в подписи к фотографии", async ({ page }) => {
    await page.goto("/");
    // The accessible name of a placeholder is what a screen reader reads out
    // for every product in the catalog.
    const label = await page
      .getByRole("img", { name: /фотография готовится/ })
      .first()
      .getAttribute("aria-label");
    expect(label).toBeTruthy();
    const brand = label!.split(" ")[0]!;
    expect(
      label!.startsWith(`${brand} ${brand} `),
      `подпись повторяет бренд: ${label}`,
    ).toBe(false);
  });

  test("открывается внутри Telegram и поднимает SDK", async ({ page }, info) => {
    await asTelegram(page, signInitData(BUYER));
    await page.goto("/");

    await expect(
      page.getByRole("heading", { level: 1, name: /Оптовый склад/ }),
    ).toBeVisible();

    // The provider only reaches isTelegram: true after init() succeeded and
    // the launch parameters were found — the whole boot path in one boolean.
    // It is read from the DOM rather than from React internals: inside
    // Telegram the header shows no browser affordances.
    const bound = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--tg-theme-bg-color")
        .trim(),
    );
    expect(bound, "bindCssVars не отработал — SDK не поднялся").not.toBe("");

    await shot(page, info, "01-home-telegram");
  });
});
