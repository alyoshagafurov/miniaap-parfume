/**
 * Cache tags.
 *
 * Storefront reads are cached and invalidated by tag rather than by time, so an
 * administrator publishing a product sees it in the catalog immediately instead
 * of waiting out a revalidation window.
 *
 * Tags are built here and nowhere else: a tag written by hand at a read site
 * and mistyped at the write site fails silently — the page simply never
 * updates, with nothing to show in a log.
 */

export const CATALOG_TAG = "catalog";
export const SETTINGS_TAG = "settings";

export const categoryTag = (slug: string) => `category:${slug}`;
export const productTag = (slug: string) => `product:${slug}`;
export const brandTag = (slug: string) => `brand:${slug}`;
