import type { Settings } from "@prisma/client";
import { cacheLife, cacheTag } from "next/cache";

import { SETTINGS_TAG } from "@/server/catalog/tags";

import { readSettings } from "./settings";

/**
 * Settings for rendering.
 *
 * Deliberately a separate file from src/server/settings.ts, which must stay
 * free of any Next import. The bot is a separate process with no request
 * context, and a `'use cache'` function there throws the moment it runs — with
 * the directive on the shared reader, the bot would have crashed on /start,
 * /catalog, /contacts, /admin and the terms button alike.
 *
 * Only React components import this. Server logic that decides something —
 * whether a request clears the minimum order, what the bot says — calls
 * `readSettings()` directly, because a figure that is up to an hour stale is
 * fine on a page and wrong in a decision. If the owner raises the minimum
 * order, the next request submitted must be judged against the new figure.
 *
 * Invalidated by tag from the settings screen, so an edit shows immediately
 * rather than after the window elapses.
 */
export async function getSettings(): Promise<Settings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("hours");
  return readSettings();
}
