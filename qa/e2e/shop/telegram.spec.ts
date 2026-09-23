import {
  asTelegram,
  buyerFor,
  expect,
  foundCount,
  seedCart,
  shot,
  signInitData,
  test,
} from "../fixtures";

/**
 * The storefront as a Mini App.
 *
 * The same pages as the browser specs, so this only covers what differs: that
 * the SDK boots without throwing, that a signed launch string is what the
 * server believes about who is asking, and that history — which exists only
 * inside Telegram — returns this buyer's own requests and nobody else's.
 */

/** Basket, form, submit — returns the request number the buyer is shown. */
async function placeOrder(
  page: import("@playwright/test").Page,
  name: string,
): Promise<string> {
  await page.goto("/p/dior-homme-intense-35ml-arm-1038");
  const stepper = page.getByRole("group", { name: /^Количество:/ });
  for (let i = 0; i < 12; i += 1) {
    await stepper.getByRole("button", { name: "Увеличить" }).click();
  }
  await page.getByRole("button", { name: "В заявку" }).click();

  await page.goto("/cart");
  await page.getByLabel("Имя").fill(name);
  await page.getByLabel("Телефон").fill("9287776655");
  await page.getByLabel("Город").fill("Хасавюрт");
  await page.getByRole("radio", { name: "Самовывоз с рынка" }).check();
  await page.getByLabel(/Согласен на обработку/).check();
  await page.getByRole("button", { name: /^Оформить/ }).click();

  await expect(page.getByRole("heading", { name: "Заявка принята" })).toBeVisible({
    timeout: 15_000,
  });
  return (await page.getByText(/^№ /).innerText()).replace("№ ", "").trim();
}

test.describe("Внутри Telegram", () => {
  // A buyer per test: placing a request is rate-limited per Telegram account,
  // and «Мои заявки» must show this buyer's own orders and nobody else's —
  // which a shared identity could not tell apart.
  test.beforeEach(async ({ page }, info) => {
    await asTelegram(
      page,
      signInitData(buyerFor(`${info.project.name} › ${info.titlePath.join(" › ")}`)),
    );
  });

  test("проходит путь каталог → карточка → заявка", async ({ page }, info) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /Парфюм 35 мл/ })
      .first()
      .click();
    // Wait for the address, not for a heading: the home screen has an h1 too,
    // so asserting on one passes without ever leaving the page.
    await expect(page).toHaveURL(/\/c\//);
    await expect(
      page.getByRole("heading", { level: 1, name: /Парфюм 35 мл/ }),
    ).toBeVisible();

    // Wait for the listing's own count before reaching into the list. The App
    // Router keeps the previous screen mounted while the next one streams, so
    // for a moment `main` still holds the home page's lanes — and the first
    // product link in it belongs to a card that is scrolled out of its rail and
    // about to be detached. Clicking that is a thirty-second timeout on an
    // element that was never on this page.
    expect(await foundCount(page)).toBeGreaterThan(0);

    await page.locator('main a[href^="/p/"]').first().click();
    await expect(page.getByRole("group", { name: /^Количество:/ })).toBeVisible();

    await shot(page, info, "17-telegram-product");
  });

  test("оформляет заявку и находит её в «Мои заявки»", async ({ page }, info) => {
    const number = await placeOrder(page, "Марьям из Telegram");
    expect(number).not.toBe("");

    // History is scoped by the signature, not by anything the client sends.
    await page.goto("/orders");
    await expect(
      page.getByRole("heading", { level: 1, name: "Мои заявки" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: `№ ${number}` })).toBeVisible({
      timeout: 15_000,
    });

    await shot(page, info, "18-telegram-orders");
  });

  test("«Повторить» переносит состав в новую заявку", async ({ page }) => {
    // Its own order first: each test signs in as its own buyer, so there is no
    // history here that another test left behind — which is the point.
    await placeOrder(page, "Марьям повторяет");

    await page.goto("/orders");
    const repeat = page.getByRole("button", { name: "Повторить" }).first();
    await expect(repeat).toBeVisible({ timeout: 15_000 });
    await repeat.click();

    await expect(page).toHaveURL(/\/cart/);
    await expect(page.getByRole("heading", { level: 1, name: "Заявка" })).toBeVisible();
    // The basket really carries the lines, not just the screen.
    await expect(page.getByRole("button", { name: /^Оформить/ })).toBeVisible();
  });

  test("в обычном браузере история не притворяется пустой — она объясняет", async ({
    page,
  }, info) => {
    // Deliberately not in Telegram: the beforeEach mock is per-page, and this
    // one opens a page without it.
    const plain = await page.context().browser()!.newContext();
    const fresh = await plain.newPage();
    await fresh.goto(
      `${test.info().project.use.baseURL ?? "http://localhost:3100"}/orders`,
    );
    await expect(fresh.getByText("Заявки хранятся в Telegram")).toBeVisible();
    await shot(fresh, info, "19-orders-browser");
    await plain.close();
  });

  test("подделанная подпись не открывает чужую историю", async ({ page }) => {
    // Same buyer id, hash from a different token: this is exactly the attack
    // the signature exists to stop, and it must produce an empty history
    // rather than an error that confirms the id is real.
    await page.addInitScript(() => {
      const raw = sessionStorage.getItem("tapps/launchParams");
      if (!raw) return;
      sessionStorage.setItem(
        "tapps/launchParams",
        JSON.parse(raw).replace(/hash%3D[0-9a-f]+/i, "hash%3D" + "0".repeat(64)),
      );
    });
    await page.goto("/orders");
    await expect(
      page.getByText(/Заявок пока нет|Заявки хранятся в Telegram/),
    ).toBeVisible({
      timeout: 15_000,
    });
  });

  test("заявка без корзины не отправляется, даже с подписью", async ({ page }) => {
    await seedCart(page, []);
    await page.goto("/cart");
    await expect(
      page.getByRole("heading", { name: "В заявке пока пусто" }),
    ).toBeVisible();
  });
});
