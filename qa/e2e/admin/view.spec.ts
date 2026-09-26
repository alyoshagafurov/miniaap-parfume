import { expect, shot, test } from "../fixtures";
import { EDITOR, OWNER, signIn, useAdmin } from "./session";

/**
 * Every admin screen, looked at and not touched.
 *
 * Runs at 1440 and at 390, because the brief asks for a panel that works at
 * both: the owner adds a product at the desk and the manager checks a request
 * standing at the shelf. Nothing here writes, so the two viewports can visit
 * the same rows without fighting.
 */

const SCREENS = [
  { path: "/admin", name: "Главная", heading: /./i },
  { path: "/admin/orders", name: "Заявки", heading: /Заявки/i },
  { path: "/admin/products", name: "Товары", heading: /Товары/i },
  { path: "/admin/fragrances", name: "Ароматы", heading: /Ароматы/i },
  { path: "/admin/brands", name: "Бренды", heading: /Бренды/i },
  { path: "/admin/categories", name: "Категории", heading: /Категории/i },
  { path: "/admin/photos", name: "Фото", heading: /Фото/i },
  { path: "/admin/import", name: "Импорт", heading: /Импорт/i },
  { path: "/admin/settings", name: "Настройки", heading: /Настройки/i },
  { path: "/admin/admins", name: "Админы", heading: /Админ/i },
];

test.describe("Админка — обзор", () => {
  test.describe.configure({ mode: "serial" });

  test("вход по паролю и коду из Telegram", async ({ page }, info) => {
    await page.goto("/admin/login");
    await shot(page, info, "30-admin-login");

    // The real thing, password and code and all. Every other test borrows the
    // resulting cookie; this is the one that earns it.
    await signIn(page, OWNER);
    await expect(page.getByRole("button", { name: "Меню" })).toBeVisible();
    await shot(page, info, "31-admin-home");
  });

  test("каждый экран открывается и озаглавлен", async ({ page }, info) => {
    await useAdmin(page, OWNER);

    for (const screen of SCREENS) {
      await page.goto(screen.path);
      await expect(
        page.getByRole("heading", { level: 1 }),
        `${screen.path}: нет заголовка первого уровня`,
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(screen.heading);
      await shot(
        page,
        info,
        `32-admin-${screen.path.replace(/\W+/g, "-").replace(/^-|-$/g, "")}`,
      );
    }
  });

  test("редактор не видит владельческих разделов и не входит в них по адресу", async ({
    page,
  }, info) => {
    await useAdmin(page, EDITOR);

    // The sections live in the menu now, not in a row under a header.
    await page.getByRole("button", { name: "Меню" }).click();
    const nav = page.getByRole("navigation", { name: "Разделы админки" });
    await expect(nav.getByRole("link", { name: "Товары" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Настройки" })).toBeHidden();
    await expect(nav.getByRole("link", { name: "Админы" })).toBeHidden();

    await shot(page, info, "33-admin-editor-nav");
    await page.keyboard.press("Escape");

    // Hiding a link is decoration; the server has to refuse the address too.
    // Before this pass /admin/settings rendered in full for an editor and
    // /admin/admins answered 500 — a refusal wearing a server fault.
    for (const path of ["/admin/admins", "/admin/settings"]) {
      await page.goto(path);
      await expect(page, `редактор попал на ${path} по прямой ссылке`).toHaveURL(
        /\/admin\/?$/,
      );
    }
  });

  test("без входа админка не открывается", async ({ page }) => {
    await page.goto("/admin/products");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
