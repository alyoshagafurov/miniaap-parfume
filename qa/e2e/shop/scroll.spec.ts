import { expect, foundCount, shot, test } from "../fixtures";

/**
 * Automatic loading on a catalog the size the client actually has.
 *
 * This could not be checked from the headless browser pane used earlier in the
 * build: that pane is hidden, so `document.hidden` is true, no frames are
 * produced, and IntersectionObserver never fires at all — the observer was not
 * failing, it was never being asked. A Playwright tab is a real visible tab,
 * which is the whole reason this spec waited for this pass.
 *
 * Two things are being checked, and the second is the one that bites: that the
 * next page arrives before the buyer hits the floor, and that it contains
 * products they have not already scrolled past. Keyset pagination on a
 * non-unique sort key is the classic way to serve the same row twice, and a
 * duplicate looks exactly like a catalog with more products in it.
 */

const CATEGORY = "/c/parfyum-35-ml";
const PAGE_SIZE = 24;

/**
 * Each card links to its own product, so the hrefs are the honest identity —
 * two cards for one product would repeat a slug even when their titles differ,
 * which is precisely the twins case this catalog is full of.
 */
async function slugs(page: import("@playwright/test").Page): Promise<string[]> {
  const hrefs = await page
    .locator('main a[href^="/p/"]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href") ?? ""));
  return hrefs.filter(Boolean);
}

test.describe("Автоподгрузка", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Только Chromium установлен",
  );

  test("догружает страницы по мере прокрутки и не повторяет товары", async ({
    page,
  }, info) => {
    await page.goto(CATEGORY);

    const total = await foundCount(page);
    test.skip(
      total <= PAGE_SIZE,
      `в категории ${total} товаров — подгружать нечего, нужен pnpm seed:bulk`,
    );

    const first = await slugs(page);
    expect(first.length).toBe(Math.min(PAGE_SIZE, total));

    const seen = new Set(first);
    let previous = first.length;

    // Four pages is enough to prove the mechanism and to catch a cursor that
    // repeats; loading all 1 360 would prove nothing further and take minutes.
    for (let round = 0; round < 4 && previous < total; round += 1) {
      await page.mouse.wheel(0, 20_000);
      await expect
        .poll(async () => (await slugs(page)).length, {
          message: "следующая страница не пришла",
          timeout: 15_000,
        })
        .toBeGreaterThan(previous);

      const now = await slugs(page);
      for (const slug of now.slice(previous)) {
        expect(seen.has(slug), `товар ${slug} пришёл дважды`).toBe(false);
        seen.add(slug);
      }
      previous = now.length;
    }

    expect(previous).toBeGreaterThan(PAGE_SIZE);
    expect(seen.size).toBe(previous);

    await shot(page, info, "20-infinite-scroll");
  });

  test("подгрузка переживает фильтр, применённый на середине списка", async ({
    page,
  }) => {
    await page.goto(CATEGORY);
    const total = await foundCount(page);
    test.skip(total <= PAGE_SIZE, "нужен pnpm seed:bulk");

    await page.mouse.wheel(0, 20_000);
    await expect
      .poll(async () => (await slugs(page)).length, { timeout: 15_000 })
      .toBeGreaterThan(PAGE_SIZE);

    // Narrowing must reset the list to the new first page, not append the
    // filtered results underneath the unfiltered ones.
    await page.goto(`${CATEGORY}?brand=chanel`);
    await expect
      .poll(async () => (await slugs(page)).length, { timeout: 15_000 })
      .toBeLessThanOrEqual(PAGE_SIZE);

    const after = await slugs(page);
    expect(new Set(after).size).toBe(after.length);
  });
});
