import { buildSearchNotes, buildSearchText } from "@/lib/search";

import type { Tx } from "./run";

/**
 * Keeping the search haystack true.
 *
 * `products.searchText` and `products.searchNotes` are denormalised, because
 * the haystack spans four tables and a PostgreSQL generated column may only
 * read its own row. Denormalised means somebody has to maintain it, and the
 * failure when nobody does is silent: renaming a brand from "Шанель" to
 * "Chanel" leaves every one of its products still matching the old spelling and
 * no longer matching the new one, with no error anywhere.
 *
 * So every write that can change a haystack rebuilds it, in the SAME
 * transaction. Not afterwards: a rebuild outside the transaction can fail on
 * its own, and then the catalog is committed and the index is not.
 *
 * The blast radius is by design larger than the row that changed. A brand's
 * name is in the haystack of every product of every fragrance of that brand.
 */

/** Everything the two builders need, in one query shape. */
const PRODUCT_SELECT = {
  id: true,
  title: true,
  fragrances: {
    select: {
      position: true,
      fragrance: {
        select: {
          name: true,
          aliases: true,
          notesTop: true,
          notesHeart: true,
          notesBase: true,
          description: true,
          brand: { select: { name: true, aliases: true } },
        },
      },
    },
    orderBy: { position: "asc" },
  },
} as const;

/**
 * Rebuilds the haystack of the named products.
 *
 * Reads and writes one product at a time rather than in one statement, because
 * the value is computed in JavaScript by the same function that normalises
 * every query — the alternative is reimplementing that normalisation in SQL,
 * which is exactly how the two halves drift apart.
 *
 * Returns how many rows it touched, so a caller that expected work and did none
 * can say so.
 */
export async function reindexProducts(
  tx: Tx,
  productIds: readonly string[],
): Promise<number> {
  if (productIds.length === 0) return 0;

  const products = await tx.product.findMany({
    where: { id: { in: [...productIds] } },
    select: PRODUCT_SELECT,
  });

  for (const product of products) {
    const primary = product.fragrances[0]?.fragrance;

    const searchText = buildSearchText({
      // A product with no fragrance cannot exist — a deferred constraint
      // trigger enforces it — but the type does not know that, and inventing a
      // brand here would put a lie in the index.
      brandName: primary?.brand.name ?? "",
      brandAliases: primary?.brand.aliases ?? [],
      fragranceNames: product.fragrances.map((f) => f.fragrance.name),
      fragranceAliases: product.fragrances.flatMap((f) => f.fragrance.aliases),
      title: product.title,
    });

    // Notes come from the primary fragrance only. A twin's second scent
    // contributes its name, which is ranked, but not its notes, which are
    // recall-only and would double the length of the string they dilute.
    const searchNotes = buildSearchNotes({
      notesTop: primary?.notesTop ?? [],
      notesHeart: primary?.notesHeart ?? [],
      notesBase: primary?.notesBase ?? [],
      description: primary?.description ?? null,
    });

    await tx.product.update({
      where: { id: product.id },
      data: { searchText, searchNotes },
    });
  }

  return products.length;
}

/** Every product carrying this fragrance, in either position. */
export async function productIdsOfFragrance(
  tx: Tx,
  fragranceId: string,
): Promise<string[]> {
  const links = await tx.productFragrance.findMany({
    where: { fragranceId },
    select: { productId: true },
  });
  return links.map((l) => l.productId);
}

/** Every product of every fragrance of this brand. */
export async function productIdsOfBrand(tx: Tx, brandId: string): Promise<string[]> {
  const links = await tx.productFragrance.findMany({
    where: { fragrance: { brandId } },
    select: { productId: true },
  });
  // A twin of two fragrances from the same brand appears twice.
  return [...new Set(links.map((l) => l.productId))];
}

/** The slugs the storefront caches those products under, for invalidation. */
export async function productSlugs(
  tx: Tx,
  productIds: readonly string[],
): Promise<string[]> {
  if (productIds.length === 0) return [];
  const rows = await tx.product.findMany({
    where: { id: { in: [...productIds] } },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}
