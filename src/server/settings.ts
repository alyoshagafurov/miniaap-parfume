import type { Settings } from "@prisma/client";

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
 * Reads settings, creating the row on first use so a fresh database is never a
 * crash. Not cached in module scope: an administrator changing the minimum
 * order must see it take effect on the next request, not on the next restart.
 */
export async function getSettings(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({ data: { ...DEFAULTS } });
}

/**
 * Remembers the Telegram file_id of the greeting banner after its first upload,
 * so every later /start re-sends it by id instead of re-uploading the file.
 */
export async function rememberBannerFileId(fileId: string): Promise<void> {
  await prisma.settings.update({ where: { id: 1 }, data: { bannerFileId: fileId } });
}
