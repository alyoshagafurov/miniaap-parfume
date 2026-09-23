import { CATALOG_TAG, SETTINGS_TAG } from "@/server/catalog/tags";

import { inTransaction, Tags, type Mutation } from "./run";

/**
 * Settings.
 *
 * One row, holding everything the client can change without a deploy. It is a
 * catalog write like any other — the storefront caches the minimum order, the
 * contacts and the footer — so it goes through this directory and returns its
 * tags rather than being updated at the form.
 *
 * CATALOG_TAG as well as SETTINGS_TAG, because `showPrices` changes what every
 * product card renders, not just the footer.
 */

export interface SettingsInput {
  companyName: string;
  address: string;
  phone: string;
  whatsappPhone: string;
  minOrderKop: number;
  showPrices: boolean;
  deliveryTerms: string;
  botGreeting: string;
}

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

export async function saveSettings(input: SettingsInput): Promise<Mutation<null>> {
  return inTransaction(async (tx) => {
    const data = {
      companyName: input.companyName.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
      whatsappPhone: input.whatsappPhone.trim(),
      minOrderKop: input.minOrderKop,
      showPrices: input.showPrices,
      deliveryTerms: input.deliveryTerms.trim(),
      botGreeting: input.botGreeting.trim(),
    };
    await tx.settings.upsert({
      where: { id: 1 },
      update: data,
      create: { ...DEFAULTS, ...data },
    });
    return { data: null, tags: new Tags().add(SETTINGS_TAG, CATALOG_TAG).list };
  });
}

/**
 * The greeting banner.
 *
 * Changing the file must forget the cached Telegram file_id: the bot re-sends
 * the banner by id, and an id that points at the previous picture would keep
 * showing it to every new buyer with nothing to explain why.
 */
export async function setBannerKey(bannerKey: string | null): Promise<Mutation<null>> {
  return inTransaction(async (tx) => {
    await tx.settings.upsert({
      where: { id: 1 },
      update: { bannerKey, bannerFileId: null },
      create: { ...DEFAULTS, bannerKey },
    });
    return { data: null, tags: new Tags().add(SETTINGS_TAG).list };
  });
}

/** Creates the singleton if it is missing. Write paths only. */
export async function ensureSettingsRow(): Promise<Mutation<null>> {
  return inTransaction(async (tx) => {
    await tx.settings.upsert({ where: { id: 1 }, update: {}, create: { ...DEFAULTS } });
    // Nothing a reader can see changed: either the row existed, or it did not
    // and every reader was already being served these exact defaults.
    return { data: null, tags: [] };
  });
}

/**
 * Remembers the Telegram file_id after the banner's first upload.
 *
 * No tags, and that is not an oversight. The field is an upload cache for the
 * bot; nothing on the storefront or in the panel renders it, so there is no
 * cached page that has become wrong. The bot could not apply a tag in any case
 * — it is a separate process with no Next request context.
 */
export async function rememberBannerFileId(fileId: string): Promise<Mutation<null>> {
  return inTransaction(async (tx) => {
    await tx.settings.update({ where: { id: 1 }, data: { bannerFileId: fileId } });
    return { data: null, tags: [] };
  });
}
