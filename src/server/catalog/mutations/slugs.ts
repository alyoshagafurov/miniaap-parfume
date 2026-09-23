import { slugify, uniqueSlug } from "@/lib/slug";

import type { Tx } from "./run";

/**
 * Allocating a slug that is free.
 *
 * `uniqueSlug` needs the set of taken slugs; getting that set right is the part
 * worth doing once. Two traps:
 *
 * The row being renamed owns its own slug, and must not be counted as a
 * collision with itself — otherwise editing a category's subtitle and saving
 * renames `/c/parfyum-100-ml` to `/c/parfyum-100-ml-2` and breaks every link
 * anyone has shared.
 *
 * Only slugs that could actually collide are loaded. The candidate and its
 * numbered variants all start with the base, so a prefix query is both narrow
 * and exact — loading every slug in the table would work today and stop working
 * at ten thousand products.
 */

type SlugTable = "product" | "category" | "brand" | "fragrance";

async function takenSlugs(tx: Tx, table: SlugTable, base: string, exceptId?: string) {
  const where = {
    slug: { startsWith: base },
    ...(exceptId ? { id: { not: exceptId } } : {}),
  };
  const select = { slug: true } as const;

  const rows =
    table === "product"
      ? await tx.product.findMany({ where, select })
      : table === "category"
        ? await tx.category.findMany({ where, select })
        : table === "brand"
          ? await tx.brand.findMany({ where, select })
          : await tx.fragrance.findMany({ where, select });

  return new Set(rows.map((r) => r.slug));
}

export async function allocateSlug(
  tx: Tx,
  table: SlugTable,
  source: string,
  options: { exceptId?: string; override?: string | null } = {},
): Promise<string> {
  // An administrator may set the slug by hand; it is still slugified, because a
  // hand-typed one with a space or a capital is a broken URL, not a preference.
  const base = slugify(options.override?.trim() || source) || table;
  return uniqueSlug(base, await takenSlugs(tx, table, base, options.exceptId));
}
