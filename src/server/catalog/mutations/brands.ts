import { brandTag, CATALOG_TAG, productTag } from "@/server/catalog/tags";

import { allocateSlug } from "./slugs";
import { productIdsOfBrand, productSlugs, reindexProducts } from "./search-text";
import { CatalogConflict, inTransaction, Tags, type Mutation } from "./run";

/**
 * Brands.
 *
 * The name and the aliases are both in the search haystack of every product of
 * every fragrance of this brand, so a rename reindexes all of them inside the
 * same transaction. That is the whole reason this file exists rather than a
 * `prisma.brand.update` at the form.
 */

export interface BrandInput {
  name: string;
  slug?: string | null;
  aliases: string[];
  sortOrder: number;
  isPublished: boolean;
}

export async function createBrand(
  input: BrandInput,
): Promise<Mutation<{ id: string; slug: string }>> {
  return inTransaction(async (tx) => {
    const slug = await allocateSlug(tx, "brand", input.name, { override: input.slug });
    const brand = await tx.brand.create({
      data: {
        name: input.name.trim(),
        slug,
        aliases: normalizeAliases(input.aliases),
        sortOrder: input.sortOrder,
        isPublished: input.isPublished,
      },
      select: { id: true, slug: true },
    });

    // A new brand has no fragrances yet, so nothing to reindex and no product
    // page to invalidate.
    return {
      data: brand,
      tags: new Tags().add(CATALOG_TAG, brandTag(brand.slug)).list,
    };
  });
}

export async function updateBrand(
  id: string,
  input: BrandInput,
): Promise<Mutation<{ id: string; slug: string }>> {
  return inTransaction(
    async (tx) => {
      const before = await tx.brand.findUniqueOrThrow({
        where: { id },
        select: { slug: true, name: true, aliases: true },
      });

      const slug = await allocateSlug(tx, "brand", input.name, {
        exceptId: id,
        // Keep the existing slug unless one is given: a rename must not silently
        // break every link already shared to /b/<slug>.
        override: input.slug ?? before.slug,
      });

      const brand = await tx.brand.update({
        where: { id },
        data: {
          name: input.name.trim(),
          slug,
          aliases: normalizeAliases(input.aliases),
          sortOrder: input.sortOrder,
          isPublished: input.isPublished,
        },
        select: { id: true, slug: true },
      });

      const tags = new Tags().add(
        CATALOG_TAG,
        brandTag(before.slug),
        brandTag(brand.slug),
      );

      // Only when the haystack actually moved. Publishing or reordering a brand
      // changes nothing a buyer can search for, and reindexing a thousand
      // products to discover that would be a long transaction for no reason.
      const haystackChanged =
        before.name !== input.name.trim() ||
        !sameAliases(before.aliases, normalizeAliases(input.aliases));

      if (haystackChanged) {
        const productIds = await productIdsOfBrand(tx, id);
        await reindexProducts(tx, productIds);
        tags.addAll((await productSlugs(tx, productIds)).map(productTag));
      }

      return { data: brand, tags: tags.list };
    },
    // A brand with a thousand products reindexes a thousand rows one at a time.
    { timeoutMs: 120_000 },
  );
}

/**
 * Removing a brand.
 *
 * Refused while any fragrance still belongs to it — the foreign key is
 * `onDelete: Restrict` and would refuse anyway, but with a constraint-violation
 * message nobody can act on. Hiding a brand is `isPublished: false`; deleting
 * one is for a brand entered by mistake.
 */
export async function deleteBrand(id: string): Promise<Mutation<{ slug: string }>> {
  return inTransaction(async (tx) => {
    const brand = await tx.brand.findUniqueOrThrow({
      where: { id },
      select: { slug: true, _count: { select: { fragrances: true } } },
    });
    if (brand._count.fragrances > 0) {
      throw new CatalogConflict(
        `У бренда ещё ${brand._count.fragrances} ароматов. Сначала перенесите или удалите их.`,
      );
    }

    await tx.brand.delete({ where: { id } });
    return {
      data: { slug: brand.slug },
      tags: new Tags().add(CATALOG_TAG, brandTag(brand.slug)).list,
    };
  });
}

/**
 * Aliases are the Russian spellings a buyer actually types. Trimmed, emptied of
 * blanks, deduplicated case-insensitively — «Шанель» and «шанель» in one list
 * is a typo, and both end up folded to the same thing by the search normaliser
 * anyway.
 */
export function normalizeAliases(aliases: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of aliases) {
    const alias = raw.trim();
    if (alias === "") continue;
    const key = alias.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alias);
  }
  return out;
}

function sameAliases(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
