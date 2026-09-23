import { expect, shot, test } from "../fixtures";

/**
 * The product page: notes, the other formats of the same fragrance, and the
 * one control that matters — adding a pack to the request.
 */

const PRODUCT = "/p/lancome-idole-35ml-arm-1040";

test.describe("Карточка товара", () => {
  test("показывает аромат, ноты и другие форматы", async ({ page }, info) => {
    await page.goto(PRODUCT);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Об аромате" })).toBeVisible();
    // The brief's requirement: the same fragrance in its other volumes.
    await expect(page.getByRole("heading", { name: "Этот аромат в других форматах" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Хлебные крошки" })).toBeVisible();

    await shot(page, info, "06-product");
  });

  test("переключает формат и оказывается на другом товаре", async ({ page }) => {
    await page.goto(PRODUCT);

    const formats = page
      .getByRole("heading", { name: "Этот аромат в других форматах" })
      .locator("xpath=following::a[1]");
    await expect(formats).toBeVisible();

    const href = await formats.getAttribute("href");
    expect(href).toMatch(/^\/p\//);
    expect(href).not.toBe(PRODUCT);

    await formats.click();
    await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("кладёт в заявку кратно упаковке", async ({ page }, info) => {
    await page.goto(PRODUCT);

    const stepper = page.getByRole("group", { name: /^Количество:/ });
    await expect(stepper).toBeVisible();

    // One tap on «Увеличить» adds a whole pack, not one bottle: this catalog
    // is wholesale and the pack is the unit.
    const start = Number(await stepper.locator("output").innerText());
    await stepper.getByRole("button", { name: "Увеличить" }).click();
    const afterOne = Number(await stepper.locator("output").innerText());
    expect(afterOne).toBeGreaterThan(start);

    await page.getByRole("button", { name: "В заявку" }).click();

    // The basket link appears only once there is something in it.
    const cart = page.getByRole("link", { name: /^Заявка, позиций: \d+/ });
    await expect(cart).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem("arumi.cart.v1"));
    const parsed = JSON.parse(stored ?? "{}") as { v: number; lines: { qty: number }[] };
    expect(parsed.v).toBe(1);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0]!.qty).toBe(afterOne);

    await shot(page, info, "07-product-added");
  });

  test("несуществующий товар — объяснённое состояние, а не пустота", async ({ page }, info) => {
    const response = await page.goto("/p/takogo-tovara-net");

    // The status is 200, and that is a consequence of partial prerendering
    // rather than an oversight: the static shell of /p/[slug] is flushed before
    // the lookup runs, so `notFound()` cannot reach back and change the status
    // line. Trading the prerendered shell for a correct status would cost every
    // real product its instant skeleton on a market-floor connection, which is
    // the wrong way round for a catalog read almost entirely inside Telegram.
    // Recorded as a deviation; the remedy belongs to the relay in stage 3.
    expect(response?.status()).toBe(200);

    // What the buyer gets has to be right regardless. Before this pass it was
    // a header, a footer and nothing between them.
    await expect(page.getByRole("heading", { level: 1, name: "Такой страницы нет" })).toBeVisible();
    await expect(page.getByRole("link", { name: "В каталог" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Поиск по каталогу" })).toBeVisible();

    await shot(page, info, "21-product-not-found");
  });

  test("несуществующий адрес вне витрины отвечает 404 и по-русски", async ({ page, audit }) => {
    audit.allow("/takogo-adresa-net", "проверяем именно 404");
    // Chromium also logs the navigation's own status to the console, without
    // the URL in the message.
    audit.allow("status of 404", "тот же самый ожидаемый 404");
    const response = await page.goto("/takogo-adresa-net");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Страница не найдена" })).toBeVisible();
  });
});
