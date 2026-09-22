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
 * Reads settings, uncached.
 *
 * This is what server logic uses — order submission, the bot — for two reasons.
 *
 * It must not depend on Next. The bot is a separate process with no request
 * context, and a 'use cache' function there throws the moment it runs.
 *
 * And it must be current. If the owner raises the minimum order, a request
 * submitted a minute later has to be judged against the new figure, not against
 * an hour-old copy. Rendering can afford to be stale; deciding whether money
 * clears a threshold cannot.
 *
 * A missing row returns the defaults rather than creating one: a read path that
 * writes cannot be cached by its caller, and would either write on every miss
 * or have its write skipped once cached.
 */
export async function readSettings(): Promise<Settings> {
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
