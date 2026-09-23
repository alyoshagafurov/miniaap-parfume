import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Owner-only screens must be owner-only on the server, not only in the menu.
 *
 * This exists because they were not. The panel's navigation filtered its
 * owner-only entries by role, which looks like an access rule and is in fact a
 * rendering decision — an editor who typed /admin/settings read the contacts,
 * the order minimum and the bot's texts in full.
 *
 * The invariant is derived from the navigation rather than from a list kept
 * here, so a third owner-only screen added tomorrow is covered the moment it
 * appears in the menu, which is the only place anybody will remember to add it.
 */

const LAYOUT = "src/app/admin/(panel)/layout.tsx";

/** Nav entries marked `owner: true`, as hrefs. */
function ownerOnlyHrefs(): string[] {
  const source = readFileSync(LAYOUT, "utf8");
  const nav = /const NAV = \[(.*?)\n\] as const;/s.exec(source);
  expect(nav, `не нашёл NAV в ${LAYOUT}`).not.toBeNull();

  return [...nav![1]!.matchAll(/\{[^}]*href:\s*"([^"]+)"[^}]*\}/g)]
    .filter((m) => /owner:\s*true/.test(m[0]))
    .map((m) => m[1]!);
}

/** /admin/settings → its page file. */
function pageFile(href: string): string {
  const segment = href.replace(/^\/admin\/?/, "");
  return `src/app/admin/(panel)/${segment}${segment ? "/" : ""}page.tsx`;
}

describe("страницы только для владельца", () => {
  it("находит владельческие пункты меню", () => {
    // If the navigation stops marking anything, this suite would pass
    // vacuously — which is exactly how a guard test stops guarding.
    expect(ownerOnlyHrefs().length).toBeGreaterThanOrEqual(2);
  });

  it.each(ownerOnlyHrefs())("%s проверяет право на сервере", (href) => {
    const source = readFileSync(pageFile(href), "utf8");
    const call = /requireAdminPage\(\s*("([^"]+)")?\s*\)/.exec(source);

    expect(call, `${pageFile(href)}: нет вызова requireAdminPage`).not.toBeNull();
    expect(
      call![2],
      `${pageFile(href)}: requireAdminPage() без права — вход проверен, роль нет`,
    ).toBeTruthy();
  });
});
