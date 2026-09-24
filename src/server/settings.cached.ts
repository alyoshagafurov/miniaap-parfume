import type { Settings } from "@prisma/client";
import { cacheLife, cacheTag, io } from "next/cache";

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
  await io();
  return cached();
}

/**
 * The cached half, and why it is a second function.
 *
 * `io()` has to be awaited *outside* the cache scope — inside one it is a
 * no-op by design — so the directive cannot live in the exported function
 * beside it. What it buys is that `next build` never opens a connection: the
 * await suspends the prerender before this runs, the footer's skeleton ships
 * in the static shell, and the read happens on the first real request.
 *
 * Everything else is unchanged. The entry is still keyed, still tagged, still
 * invalidated by `updateTag(SETTINGS_TAG)` from the settings screen; it is
 * filled at request time rather than at build time, and then shared by every
 * request that follows.
 */
async function cached(): Promise<Settings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("hours");
  return readSettings();
}
