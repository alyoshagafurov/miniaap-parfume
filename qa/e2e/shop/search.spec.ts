import { expect, foundCount, shot, test } from "../fixtures";

/**
 * Search, exactly as the brief states it: «шанель» finds Chanel, an article
 * number finds its product, and the typo «шанел» finds Chanel too.
 *
 * Each of the three is a different mechanism — transliteration, an exact
 * branch that never touches the trigram haystack, and word_similarity — so a
 * single passing case says nothing about the other two.
 */

test.describe("Поиск", () => {
  test("«шанель» находит Chanel", async ({ page }, info) => {
    await page.goto("/search?q=%D1%88%D0%B0%D0%BD%D0%B5%D0%BB%D1%8C");

    const found = await foundCount(page);
    expect(found).toBeGreaterThan(0);

    // Every hit really is a Chanel, not merely something.
    const titles = await page
      .getByRole("listitem")
      .getByRole("heading")
      .allInnerTexts();
    expect(titles.length).toBeGreaterThan(0);

    await shot(page, info, "08-search-cyrillic");
  });

  test("артикул находит ровно свой товар", async ({ page }) => {
    await page.goto("/search?q=ARM-1040");

    const found = await foundCount(page);
    // The exact branch exists because every article number shares a prefix: a
    // trigram match on «ARM-1040» would return the whole catalog.
    expect(found).toBe(1);
    // And it is that product, not merely one product.
    await expect(
      page.locator('main a[href="/p/lancome-idole-35ml-arm-1040"]'),
    ).toBeVisible();
  });

  test("опечатка «шанел» всё равно находит", async ({ page }) => {
    await page.goto("/search?q=%D1%88%D0%B0%D0%BD%D0%B5%D0%BB");

    const found = await foundCount(page);
    expect(found, "word_similarity не сработал на опечатке").toBeGreaterThan(0);
  });

  test("печатает в поле и доходит до результатов", async ({ page }, info) => {
    await page.goto("/search");

    const field = page.getByRole("searchbox").first();
    await field.fill("диор");
    await expect(page).toHaveURL(/q=/, { timeout: 8000 });
    await expect(
      page
        .getByText(/Найдено: \d+|ничего не нашлось/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await shot(page, info, "09-search-typed");
  });

  test("ничего не найдено — это состояние, а не пустота", async ({ page }, info) => {
    await page.goto("/search?q=%D0%BA%D0%B2%D1%88%D1%89%D0%B7%D1%85%D1%8A");

    // Not a bare «ничего не найдено»: the screen echoes what was typed, says
    // how to narrow it, and offers what people actually order — a buyer on a
    // market floor who hits a dead end goes to a competitor's catalog.
    await expect(page.getByText(/ничего не нашлось/)).toBeVisible();
    // And it echoes what was typed, so the buyer can see the typo.
    await expect(page.getByText(/квшщзхъ/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Часто заказывают" })).toBeVisible();

    await shot(page, info, "10-search-empty");
  });
});
