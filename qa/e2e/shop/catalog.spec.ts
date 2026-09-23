import { expect, foundCount, shot, test } from "../fixtures";

/**
 * The category listing: filters, sorting, and the URL that remembers them.
 *
 * The URL is the point. A wholesaler who has narrowed to «женский · Chanel ·
 * в наличии» and sends that link to a colleague must be sending the list, not
 * the category — so every assertion here is made twice, once against the screen
 * and once against the address bar.
 */

const CATEGORY = "/c/parfyum-35-ml";

test.describe("Каталог", () => {
  test("показывает категорию и считает найденное", async ({ page }, info) => {
    await page.goto(CATEGORY);

    await expect(
      page.getByRole("heading", { level: 1, name: "Парфюм 35 мл «карандаши»" }),
    ).toBeVisible();
    expect(await foundCount(page)).toBeGreaterThan(0);

    await shot(page, info, "02-category");
  });

  test("фильтрует по полу и бренду, и складывает это в адрес", async ({
    page,
  }, info) => {
    await page.goto(CATEGORY);

    const before = await foundCount(page);
    expect(before).toBeGreaterThan(0);

    await page.getByRole("button", { name: /^Фильтры/ }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await shot(page, info, "03-filters-open");

    // Chanel and «женский», exactly the pair the brief's buyer chooses.
    await sheet.getByRole("button", { name: /^Chanel/ }).click();
    await sheet.getByRole("button", { name: /^Женский/ }).click();
    await sheet.getByRole("button", { name: "Показать" }).click();

    await expect(sheet).toBeHidden();

    // The address is the shareable state, not a side effect of it.
    await expect(page).toHaveURL(/brand=chanel/);
    await expect(page).toHaveURL(/gender=FEMALE/);

    const after = await foundCount(page);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(0);

    // And the chosen filters are visible as something removable, not only in
    // the URL.
    await expect(page.getByRole("list", { name: "Выбранные фильтры" })).toBeVisible();

    await shot(page, info, "04-category-filtered");
  });

  test("переживает перезагрузку по ссылке с фильтрами", async ({ page }) => {
    await page.goto(`${CATEGORY}?brand=chanel&gender=FEMALE`);

    await expect(page.getByRole("list", { name: "Выбранные фильтры" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Фильтры · 2$/ })).toBeVisible();
  });

  test("сортирует и сохраняет выбор в адресе", async ({ page }) => {
    await page.goto(CATEGORY);

    await page.getByLabel("Сортировка").selectOption("price_asc");
    await expect(page).toHaveURL(/sort=price_asc/);

    // Cheapest first really is cheapest first.
    //
    // Read from the price element rather than from the card's text: textContent
    // concatenates without separators, so «кратно 12» immediately followed by
    // «370 ₽» reads as 12 370 — a number that is on the screen nowhere. The
    // struck-through old price is a <s>, so asking for spans skips it.
    const numbers = await page.locator("main article").evaluateAll((cards) =>
      cards.map((card) => {
        for (const span of card.querySelectorAll("span")) {
          if (span.children.length === 0 && (span.textContent ?? "").includes("₽")) {
            return Number((span.textContent ?? "").replace(/\D+/g, ""));
          }
        }
        return 0;
      }),
    );
    expect(numbers.length).toBeGreaterThan(1);
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
  });

  test("честно говорит, когда ничего не нашлось", async ({ page }, info) => {
    // A brand that exists and a gender it has nothing in.
    await page.goto(
      `${CATEGORY}?brand=chanel&family=WOODY&family=ORIENTAL&gender=MALE&stock=1`,
    );

    const heading = page
      .getByText(/Ничего не найдено|Найдено: \d+/)
      .filter({ visible: true })
      .first();
    await expect(heading).toBeVisible();
    if ((await heading.innerText()).includes("Ничего")) {
      await shot(page, info, "05-category-empty");
    }
  });
});
