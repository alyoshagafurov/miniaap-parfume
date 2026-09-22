import type { Settings } from "@prisma/client";

import { cacheLife, cacheTag } from "next/cache";

import { SETTINGS_TAG } from "@/server/catalog/tags";
import { prisma } from "@/server/db";

/**
 * Settings is a single row holding everything the client can change without a
 * deploy: contacts, the order minimum, delivery copy, the bot's greeting, and
 * whether prices are public.
 *
 * Nothing in this codebase hardcodes a contact detail. If a phone number or an
 * address appears in a string literal anywhere outside a seed, that is a bug.
 */

const DEFAULTS = {
  id: 1,
  companyName: "ÁRUMI Parfum & Care",
  address: "",
  phone: "",
  whatsappPhone: "",
  minOrderKop: 500_000,
  showPrices: true,
  deliveryTerms: "",
  botGreeting: "",
  bannerKey: null,
  bannerFileId: null,
} as const;

/**
 * Reads settings.
 *
 * Cached and tagged, so an administrator changing the order minimum sees it
 * take effect on the next request rather than after a revalidation window —
 * the admin action calls updateTag(SETTINGS_TAG).
 *
 * A missing row returns the defaults rather than creating one. A read path that
 * writes cannot be cached: it would either write on every cache miss or, worse,
 * have its write skipped entirely once the value is cached. The row is created
 * by the seed and by the settings screen, which are write paths.
 */
export async function getSettings(): Promise<Settings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("hours");
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  return existing ?? ({ ...DEFAULTS, updatedAt: new Date(0) } as Settings);
}

/** Creates the singleton if it is missing. Called from write paths only. */
export async function ensureSettings(): Promise<Settings> {
  return prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { ...DEFAULTS },
  });
}

/**
 * Remembers the Telegram file_id of the greeting banner after its first upload,
 * so every later /start re-sends it by id instead of re-uploading the file.
 */
export async function rememberBannerFileId(fileId: string): Promise<void> {
  await prisma.settings.update({ where: { id: 1 }, data: { bannerFileId: fileId } });
}
