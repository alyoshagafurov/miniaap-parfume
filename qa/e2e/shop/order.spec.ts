import { expect, shot, test } from "../fixtures";
import type { Page } from "@playwright/test";

/**
 * The request, which is the only thing on the storefront that writes anything.
 *
 * Three claims from the brief are checked here and nowhere else: the minimum
 * order is enforced against the server's number rather than the browser's, the
 * form keeps what the buyer typed when the submission comes back rejected, and
 * a catalog that moved underneath them produces a reviewable diff instead of a
 * silent change of price.
 */

const PRODUCT = "/p/dior-homme-intense-35ml-arm-1038";

/** Adds enough of one product to clear the 5 000 ₽ minimum. */
async function fillBasket(page: Page, taps: number): Promise<void> {
  await page.goto(PRODUCT);
  const stepper = page.getByRole("group", { name: /^Количество:/ });
  for (let i = 0; i < taps; i += 1) {
    await stepper.getByRole("button", { name: "Увеличить" }).click();
  }
  await page.getByRole("button", { name: "В заявку" }).click();
  await expect(page.getByRole("link", { name: /^Заявка, позиций:/ })).toBeVisible();
}

async function fillForm(page: Page): Promise<void> {
  await page.getByLabel("Имя").fill("Марьям Тестова");
  await page.getByLabel("Телефон").fill("9281112233");
  await page.getByLabel("Город").fill("Махачкала");
  await page.getByRole("radio", { name: "Самовывоз с рынка" }).check();
  await page.getByLabel(/Согласен на обработку/).check();
}

test.describe("Заявка", () => {
  test("пустая заявка — это состояние с выходом", async ({ page }, info) => {
    await page.goto("/cart");
    await expect(
      page.getByRole("heading", { name: "В заявке пока пусто" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "В каталог" })).toBeVisible();
    await shot(page, info, "11-cart-empty");
  });

  test("показывает, сколько не хватает до минимума, и не даёт отправить", async ({
    page,
  }, info) => {
    await fillBasket(page, 1);
    await page.goto("/cart");

    await expect(
      page.getByRole("progressbar", { name: "Прогресс до минимального заказа" }),
    ).toBeVisible();
    await expect(page.getByText(/До минимального заказа .* не хватает/)).toBeVisible();

    await fillForm(page);

    // The control names its own blocker. A disabled button reading «Оформить ·
    // 890 ₽» states what it will not do and hides why, and the shortfall was
    // then printed three times on one screen to make up for it.
    const submit = page.getByRole("button", { name: /^Ещё .* до минимума$/ });
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Оформить/ })).toBeHidden();

    await shot(page, info, "12-cart-below-minimum");
  });

  test("набранная сумма открывает оформление и заявка уходит", async ({
    page,
  }, info) => {
    // 445 ₽ apiece: twelve clears 5 000 ₽ with room to spare.
    await fillBasket(page, 12);
    await page.goto("/cart");

    await expect(page.getByText(/Минимальный заказ .* — набран/)).toBeVisible();
    await shot(page, info, "13-cart-ready");

    await fillForm(page);
    const submit = page.getByRole("button", { name: /^Оформить/ });
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByRole("heading", { name: "Заявка принята" })).toBeVisible({
      timeout: 15_000,
    });
    // The number is what the buyer quotes on the phone, so it has to be shown.
    await expect(page.getByText(/^№ /)).toBeVisible();

    // And the basket is empty afterwards — a second tap must not send it twice.
    const stored = await page.evaluate(() => localStorage.getItem("arumi.cart.v1"));
    const parsed = JSON.parse(stored ?? '{"lines":[]}') as { lines: unknown[] };
    expect(parsed.lines).toHaveLength(0);

    await shot(page, info, "14-order-accepted");
  });

  test("требует телефон и согласие, и говорит об этом в поле", async ({ page }) => {
    await fillBasket(page, 12);
    await page.goto("/cart");

    await page.getByLabel("Имя").fill("Марьям");
    await page.getByRole("radio", { name: "Самовывоз с рынка" }).check();
    // No phone, no consent.
    await page.getByRole("button", { name: /^Оформить/ }).click();

    await expect(page.getByRole("alert").first()).toBeVisible();
    // Nothing was sent.
    await expect(page.getByRole("heading", { name: "Заявка принята" })).toBeHidden();
  });

  test("цена изменилась — показывает разницу, поля остаются, повторная отправка уходит", async ({
    page,
  }, info) => {
    await fillBasket(page, 12);

    // Make the basket stale the way a day-old tab is stale: the buyer was
    // shown a lower price than the catalog now holds. Editing storage rather
    // than the catalog keeps this test from disturbing what other specs read.
    await page.evaluate(() => {
      const raw = localStorage.getItem("arumi.cart.v1");
      if (!raw) throw new Error("корзина пуста — нечего устаревать");
      const cart = JSON.parse(raw) as { v: number; lines: { seenPriceKop: number }[] };
      for (const line of cart.lines)
        line.seenPriceKop = Math.max(1, line.seenPriceKop - 5000);
      localStorage.setItem("arumi.cart.v1", JSON.stringify(cart));
    });

    await page.goto("/cart");
    await fillForm(page);
    await page.getByLabel("Комментарий").fill("Позвоните после 18:00");
    await page.getByRole("button", { name: /^Оформить/ }).click();

    // The diff, not a silent correction.
    await expect(page.getByRole("button", { name: "Принять и отправить" })).toBeVisible(
      {
        // The server reprices every line against the catalog before it can
        // answer, and four workers share one Postgres.
        timeout: 25_000,
      },
    );
    await shot(page, info, "15-cart-changed");

    // React schedules a form reset before the action runs, unconditionally.
    // If the values were not carried back into defaultValue, everything the
    // buyer typed is gone by now — which is the defect this test exists for.
    await expect(page.getByLabel("Имя")).toHaveValue("Марьям Тестова");
    await expect(page.getByLabel("Город")).toHaveValue("Махачкала");
    await expect(page.getByLabel("Комментарий")).toHaveValue("Позвоните после 18:00");
    await expect(page.getByLabel(/Согласен на обработку/)).toBeChecked();

    await page.getByRole("button", { name: "Принять и отправить" }).click();
    await expect(page.getByRole("heading", { name: "Заявка принята" })).toBeVisible({
      timeout: 15_000,
    });

    await shot(page, info, "16-order-accepted-after-change");
  });

  test("шестая заявка подряд с одного адреса не проходит", async ({ browser }) => {
    // Everywhere else in this suite each test arrives from its own address, so
    // that the limit never decides whether checkout works. Here it is the
    // subject: one address, six requests, and the sixth has to be refused —
    // otherwise a script could fill the manager's chat overnight.
    const context = await browser.newContext({
      extraHTTPHeaders: { "x-real-ip": "10.77.77.77" },
    });
    const repeat = await context.newPage();
    const base = test.info().project.use.baseURL ?? "http://localhost:3100";

    let refused = false;
    for (let attempt = 1; attempt <= 6 && !refused; attempt += 1) {
      await repeat.goto(`${base}${PRODUCT}`);
      const stepper = repeat.getByRole("group", { name: /^Количество:/ });
      for (let i = 0; i < 12; i += 1) {
        await stepper.getByRole("button", { name: "Увеличить" }).click();
      }
      await repeat.getByRole("button", { name: "В заявку" }).click();

      await repeat.goto(`${base}/cart`);
      await repeat.getByLabel("Имя").fill(`Настойчивый ${attempt}`);
      await repeat.getByLabel("Телефон").fill("9280000001");
      await repeat.getByLabel("Город").fill("Хасавюрт");
      await repeat.getByRole("radio", { name: "Самовывоз с рынка" }).check();
      await repeat.getByLabel(/Согласен на обработку/).check();
      await repeat.getByRole("button", { name: /^Оформить/ }).click();

      const accepted = repeat.getByRole("heading", { name: "Заявка принята" });
      const rejected = repeat.getByText(/Слишком много заявок подряд/);
      await expect(accepted.or(rejected).first()).toBeVisible({ timeout: 20_000 });
      refused = await rejected.isVisible();
    }

    expect(refused, "лимит заявок не сработал за шесть попыток").toBe(true);
    await context.close();
  });
});
