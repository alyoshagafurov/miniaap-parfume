import { readFileSync, statSync } from "node:fs";

import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Signing in to the admin panel from a browser, the long way.
 *
 * The brief's desk scenario is password plus a six-digit code delivered by the
 * bot, and there is no shortcut worth taking here: seeding a session cookie
 * would skip the half of the mechanism most likely to break, and the code is
 * stored as an argon2 hash, so it cannot be read back out of the database.
 *
 * So it is read where it actually goes — out of the relay. Everything this
 * project sends to Telegram leaves through TELEGRAM_API_ROOT, and in
 * development that is `scripts/relay-stub.mjs`, which writes every call to a
 * log. Reading the code from there proves something a cookie never could: that
 * the message really was addressed to this administrator and really did leave
 * by the only route production will have.
 */

export const OWNER = {
  login: "test",
  password: "e2e-owner-pass-2026",
  chatId: "777000333",
};
export const EDITOR = {
  login: "redaktor",
  password: "e2e-editor-pass-2026",
  chatId: "777000444",
};

const RELAY_LOG = process.env.E2E_RELAY_LOG ?? "relay-stub.log";

/**
 * Where the log currently ends, in characters.
 *
 * Characters, not bytes. `statSync().size` is a byte count, and this log is
 * mostly Cyrillic at two bytes a letter — so slicing the decoded string at that
 * offset skipped roughly twice as far as intended and landed past everything
 * the login had just written. The read was looking at an empty tail and
 * reporting that the bot had never sent a code.
 */
function relayLength(): number {
  try {
    statSync(RELAY_LOG);
  } catch {
    throw new Error(
      `Лог релея не найден: ${RELAY_LOG}. ` +
        "Запустите `pnpm relay:stub <путь>` и передайте тот же путь в E2E_RELAY_LOG.",
    );
  }
  return readFileSync(RELAY_LOG, "utf8").length;
}

/**
 * The six digits sent after `from`, waited for rather than read once.
 *
 * The action returns before the message is written — the send is awaited
 * server-side but the log write is a separate process — so a single read races
 * and fails about one run in four.
 */
async function codeSentAfter(
  from: number,
  chatId: string,
  timeoutMs = 15_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const text = readFileSync(RELAY_LOG, "utf8").slice(from);
    last = text;
    // The payload is JSON with the text field escaped; the code is the only
    // run of exactly six digits in that sentence.
    const decoded = text
      .replace(/\\n/g, "\n")
      .replace(/\\u([0-9a-f]{4})/gi, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      );
    // Scoped to this administrator's chat: two sign-ins in flight at once would
    // otherwise each take whichever code landed first and both be refused.
    const line = /"chat_id":"CHAT"[^\n]*Код для входа в админ-панель: (\d{6})/g;
    const scoped = new RegExp(line.source.replace("CHAT", chatId), "g");
    let found: string | undefined;
    for (let m = scoped.exec(decoded); m; m = scoped.exec(decoded)) found = m[1];
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Код не пришёл в релей за ${timeoutMs} мс. Хвост лога:\n${last.slice(-600)}`,
  );
}

/**
 * Password, then — where the server asks for one — the code the bot sent.
 * Leaves the page inside the panel.
 *
 * Production signs in on the password alone (ADMIN_LOGIN_REQUIRE_CODE=0) and
 * the default build asks for the code, so the helper follows whichever form
 * the server rendered. That is what lets the handover pictures be taken the
 * way production has it without a second copy of the sign-in.
 */
export async function signIn(
  page: Page,
  who: { login: string; password: string; chatId: string } = OWNER,
): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Логин").fill(who.login);
  await page.getByLabel("Пароль").fill(who.password);

  const direct = page.getByRole("button", { name: "Войти" });
  if (await direct.isVisible()) {
    await direct.click();
    await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15_000 });
    return;
  }

  const from = relayLength();
  await page.getByRole("button", { name: "Получить код" }).click();

  const field = page.getByLabel("Код из Telegram");
  await expect(field).toBeVisible({ timeout: 15_000 });

  await field.fill(await codeSentAfter(from, who.chatId));
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/\/admin(?!\/login)/, { timeout: 15_000 });
}

/**
 * A signed-in panel, paying for the sign-in only once.
 *
 * Signing in is limited to ten attempts per login name in ten minutes, and
 * rightly so. A suite that signs in afresh for every test spent that budget on
 * itself: the full run made about ten sign-ins as the owner and the last admin
 * test in it failed at the door — intermittently, and never when run alone,
 * which is the shape of a defect that costs an afternoon.
 *
 * So the session is bought once per worker and lent to every test after it. The
 * cookie is the whole session; nothing else is carried over. The sign-in itself
 * still has a test of its own — this is a shortcut past a mechanism that is
 * checked elsewhere, not past a mechanism that is checked nowhere.
 */
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["cookies"]>>>();

export async function useAdmin(
  page: Page,
  who: { login: string; password: string; chatId: string } = OWNER,
): Promise<void> {
  const cached = sessions.get(who.login);
  if (cached) {
    await page.context().addCookies(cached);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin(?!\/login)/);
    return;
  }

  await signIn(page, who);
  sessions.set(who.login, await page.context().cookies());
}
