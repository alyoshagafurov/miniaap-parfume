import { brandTag, CATALOG_TAG, categoryTag, productTag } from "@/server/catalog/tags";
import type { ParsedRow } from "@/server/import/rows";

import { normalizeAliases } from "./brands";
import { reindexProducts } from "./search-text";
import { allocateSlug } from "./slugs";
import { inTransaction, Tags, type Mutation, type Tx } from "./run";

/**
 * Importing a price list.
 *
 * Upsert by article, which is what makes the whole thing idempotent: the owner
 * re-imports the same file after fixing three rows and gets three updates, not
 * three hundred duplicates. The article is the one identifier the warehouse
 * already uses, and it is unique in the schema for exactly this reason.
 *
 * Brands, fragrances and categories named in the file are created when they are
 * missing. A price list is where a new brand actually appears, and refusing the
 * row until somebody adds the brand by hand would mean importing the file
 * twice.
 *
 * Batched, and the tags of the whole file are collected and returned once. A
 * three-hundred-row file touching eight brands and four categories invalidates
 * a dozen tags at the end, not nine hundred as it goes — and, more importantly,
 * a row that fails leaves its batch rolled back rather than the file
 * half-applied with the cache already told otherwise.
 */

export interface ImportOutcome {
  created: number;
  updated: number;
  /** Rows the database refused, with the reason, addressed by spreadsheet row. */
  skipped: Array<{ row: number; sku: string; reason: string }>;
  createdBrands: string[];
  createdFragrances: string[];
  createdCategories: string[];
}

/**
 * Rows per transaction.
 *
 * Small enough that one bad row costs little, large enough that three hundred
 * rows is not three hundred round trips. A whole-file transaction would be
 * worse on both counts: it holds locks for the length of the import and throws
 * away 299 good rows over one bad one.
 */
const BATCH = 25;

export async function importProducts(rows: readonly ParsedRow[]): Promise<Mutation<ImportOutcome>> {
  const outcome: ImportOutcome = {
    created: 0,
    updated: 0,
    skipped: [],
    createdBrands: [],
    createdFragrances: [],
    createdCategories: [],
  };
  const tags = new Tags();
  if (rows.length === 0) return { data: outcome, tags: [] };

  tags.add(CATALOG_TAG);

  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    try {
      const result = await inTransaction(
        async (tx) => applyBatch(tx, batch),
        { timeoutMs: 60_000 },
      );
      outcome.created += result.data.created;
      outcome.updated += result.data.updated;
      outcome.skipped.push(...result.data.skipped);
      outcome.createdBrands.push(...result.data.createdBrands);
      outcome.createdFragrances.push(...result.data.createdFragrances);
      outcome.createdCategories.push(...result.data.createdCategories);
      tags.addAll(result.tags);
    } catch (error) {
      // The batch rolled back, so none of its rows were written. Reported
      // against every row in it, because that is what actually happened —
      // saying "row 47 failed" when rows 26–50 were also discarded would send
      // the owner to fix one line and re-import a file that is still short by
      // twenty-five.
      const reason = error instanceof Error ? error.message : "Ошибка записи";
      for (const row of batch) {
        outcome.skipped.push({ row: row.row, sku: row.sku, reason });
      }
    }
  }

  return { data: outcome, tags: tags.list };
}

async function applyBatch(tx: Tx, rows: readonly ParsedRow[]): Promise<Mutation<ImportOutcome>> {
  const outcome: ImportOutcome = {
    created: 0,
    updated: 0,
    skipped: [],
    createdBrands: [],
    createdFragrances: [],
    createdCategories: [],
  };
  const tags = new Tags();
  const touched: string[] = [];

  for (const row of rows) {
    const brand = await findOrCreateBrand(tx, row.brand, outcome);
    const category = await findOrCreateCategory(tx, row.category, outcome);

    const fragranceIds: string[] = [
      await findOrCreateFragrance(tx, brand.id, row.fragrance, row.gender, outcome),
    ];
    if (row.fragrance2) {
      const second = await resolveSecondFragrance(tx, brand.id, row.fragrance2, row.gender, outcome);
      // A twin whose two halves are the same scent is a typo in the file, not a
      // product; the unique (productId, fragranceId) key would refuse it anyway,
      // and refusing it here names the row.
      if (second !== fragranceIds[0]) fragranceIds.push(second);
    }

    const title =
      row.title?.trim() ||
      `${brand.name} ${[row.fragrance, row.fragrance2].filter(Boolean).join(" + ")}`;

    const existing = await tx.product.findUnique({
      where: { sku: row.sku },
      select: { id: true, slug: true, status: true, publishedAt: true, categoryId: true },
    });

    if (existing) {
      // The old category's listing has to be invalidated too when a row moves.
      const previousCategory = await tx.category.findUnique({
        where: { id: existing.categoryId },
        select: { slug: true },
      });
      if (previousCategory) tags.add(categoryTag(previousCategory.slug));

      await tx.productFragrance.deleteMany({ where: { productId: existing.id } });
      await tx.productFragrance.createMany({
        data: fragranceIds.map((fragranceId, position) => ({
          productId: existing.id,
          fragranceId,
          position,
        })),
      });

      const status = row.status ?? existing.status;
      await tx.product.update({
        where: { id: existing.id },
        data: {
          categoryId: category.id,
          title,
          volumeMl: row.volumeMl,
          priceKop: row.priceKop,
          oldPriceKop: row.oldPriceKop,
          packSize: row.packSize,
          stock: row.stock,
          status,
          isNew: row.isNew,
          isHit: row.isHit,
          // Stamped once and never moved: «новинки» is ordered by it, and a
          // weekly price list would otherwise reshuffle the lane every Monday.
          publishedAt:
            status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt,
        },
      });

      outcome.updated += 1;
      touched.push(existing.id);
      tags.add(productTag(existing.slug));
    } else {
      const slug = await allocateSlug(tx, "product", `${title} ${row.volumeMl}ml ${row.sku}`);
      // A file that does not say publishes nothing. An import that silently put
      // three hundred unchecked rows in front of buyers would be the wrong
      // default exactly once.
      const status = row.status ?? "DRAFT";

      const created = await tx.product.create({
        data: {
          categoryId: category.id,
          sku: row.sku,
          title,
          slug,
          volumeMl: row.volumeMl,
          priceKop: row.priceKop,
          oldPriceKop: row.oldPriceKop,
          packSize: row.packSize,
          stock: row.stock,
          status,
          isNew: row.isNew,
          isHit: row.isHit,
          publishedAt: status === "PUBLISHED" ? new Date() : null,
          fragrances: {
            create: fragranceIds.map((fragranceId, position) => ({ fragranceId, position })),
          },
        },
        select: { id: true, slug: true },
      });

      outcome.created += 1;
      touched.push(created.id);
      tags.add(productTag(created.slug));
    }

    tags.add(categoryTag(category.slug), brandTag(brand.slug));
  }

  // Once for the batch rather than per row: the reindex reads each product
  // whole, and doing it inside the loop would read rows that are about to be
  // written again by the next one.
  await reindexProducts(tx, touched);

  return { data: outcome, tags: tags.list };
}

async function findOrCreateBrand(tx: Tx, name: string, outcome: ImportOutcome) {
  const trimmed = name.trim();
  const existing = await tx.brand.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
  if (existing) return existing;

  const slug = await allocateSlug(tx, "brand", trimmed);
  const created = await tx.brand.create({
    data: { name: trimmed, slug, aliases: normalizeAliases([]) },
    select: { id: true, name: true, slug: true },
  });
  outcome.createdBrands.push(created.name);
  return created;
}

async function findOrCreateCategory(tx: Tx, name: string, outcome: ImportOutcome) {
  const trimmed = name.trim();
  const existing = await tx.category.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
  if (existing) return existing;

  const slug = await allocateSlug(tx, "category", trimmed);
  const last = await tx.category.aggregate({ _max: { sortOrder: true } });
  const created = await tx.category.create({
    data: { name: trimmed, slug, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    select: { id: true, name: true, slug: true },
  });
  outcome.createdCategories.push(created.name);
  return created;
}

/**
 * The second scent of a twin, which may belong to another house.
 *
 * "Bleu de Chanel + Dior Sauvage" is a real product in this catalog, and
 * resolving its second half under the row's brand created a duplicate "Sauvage"
 * under Chanel — silently, on a round trip of the catalog's own export. The
 * count of fragrances went up by one and the twin quietly stopped pointing at
 * Dior.
 *
 * So the value is read in the order a person would read it:
 *
 *   1. A brand name at the front, which is what the export writes when the
 *      houses differ. The longest matching brand wins, so "Yves Saint Laurent
 *      Libre" is not read as a brand called "Yves".
 *   2. The row's own brand — the ordinary case, a twin of two scents from one
 *      house.
 *   3. Any brand, if exactly one fragrance in the catalog has that name. Two
 *      houses both selling an "Aqua" is ambiguous and falls through rather than
 *      guessing.
 *   4. Otherwise it is new, and belongs to the row's brand.
 */
async function resolveSecondFragrance(
  tx: Tx,
  brandId: string,
  raw: string,
  gender: ParsedRow["gender"],
  outcome: ImportOutcome,
): Promise<string> {
  const value = raw.trim();

  const brands = await tx.brand.findMany({ select: { id: true, name: true } });
  const prefixed = brands
    .filter((b) => value.toLowerCase().startsWith(`${b.name.toLowerCase()} `))
    .sort((a, b) => b.name.length - a.name.length)[0];

  if (prefixed) {
    const name = value.slice(prefixed.name.length).trim();
    if (name) return findOrCreateFragrance(tx, prefixed.id, name, gender, outcome);
  }

  const own = await tx.fragrance.findFirst({
    where: { brandId, name: { equals: value, mode: "insensitive" } },
    select: { id: true },
  });
  if (own) return own.id;

  const anywhere = await tx.fragrance.findMany({
    where: { name: { equals: value, mode: "insensitive" } },
    select: { id: true },
    take: 2,
  });
  if (anywhere.length === 1 && anywhere[0]) return anywhere[0].id;

  return findOrCreateFragrance(tx, brandId, value, gender, outcome);
}

async function findOrCreateFragrance(
  tx: Tx,
  brandId: string,
  name: string,
  gender: ParsedRow["gender"],
  outcome: ImportOutcome,
): Promise<string> {
  const trimmed = name.trim();
  const existing = await tx.fragrance.findFirst({
    where: { brandId, name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const brand = await tx.brand.findUniqueOrThrow({
    where: { id: brandId },
    select: { name: true },
  });
  const slug = await allocateSlug(tx, "fragrance", `${brand.name} ${trimmed}`);
  const created = await tx.fragrance.create({
    data: { brandId, name: trimmed, slug, gender: gender ?? "UNISEX" },
    select: { id: true, name: true },
  });
  outcome.createdFragrances.push(`${brand.name} ${created.name}`);
  return created.id;
}
