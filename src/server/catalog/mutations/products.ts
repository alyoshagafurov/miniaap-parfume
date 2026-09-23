import type { PublishStatus, StockState } from "@prisma/client";

import { brandTag, CATALOG_TAG, categoryTag, productTag } from "@/server/catalog/tags";

import { allocateSlug } from "./slugs";
import { reindexProducts } from "./search-text";
import { CatalogConflict, inTransaction, Tags, type Mutation, type Tx } from "./run";

/**
 * Products.
 *
 * A product is a bottle: one format of one fragrance, or of two for a twin. It
 * carries the article, the price, the pack multiple and the availability — the
 * things that change weekly — while the scent itself lives on the fragrance and
 * changes almost never.
 *
 * Everything that reaches the storefront passes through here, which is what the
 * check:catalog-writes guard is for. The reason is not tidiness: the storefront
 * caches by tag, and a write that forgets to say what it dirtied leaves a stale
 * price on the shelf for an hour with nothing in any log.
 */

export interface ProductInput {
  categoryId: string;
  /** One for a normal product, two for a twin; order is position 0, 1. */
  fragranceIds: string[];
  sku: string;
  /** Generated from brand and fragrances unless an administrator overrides it. */
  title?: string | null;
  slug?: string | null;
  volumeMl: number;
  priceKop: number;
  oldPriceKop: number | null;
  packSize: number;
  stock: StockState;
  status: PublishStatus;
  isNew: boolean;
  isHit: boolean;
  popularity: number;
}

export interface ProductRef {
  id: string;
  slug: string;
  sku: string;
}

/**
 * Everything a write to one product dirties.
 *
 * Its own page, its category's listing, its brand's page, and the catalog-wide
 * tag that the home screen's lanes and every facet count hang off. Collected in
 * one place because forgetting one of the four is invisible until a buyer sees
 * a price that no longer exists.
 */
async function tagsForProduct(tx: Tx, productId: string): Promise<string[]> {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      slug: true,
      category: { select: { slug: true } },
      fragrances: {
        select: { fragrance: { select: { brand: { select: { slug: true } } } } },
      },
    },
  });
  if (!product) return [CATALOG_TAG];

  const tags = new Tags().add(
    CATALOG_TAG,
    productTag(product.slug),
    categoryTag(product.category.slug),
  );
  for (const link of product.fragrances) tags.add(brandTag(link.fragrance.brand.slug));
  return tags.list;
}

/** Brand + fragrances, the way every card and heading reads them. */
async function generateTitle(tx: Tx, fragranceIds: readonly string[]): Promise<string> {
  const fragrances = await tx.fragrance.findMany({
    where: { id: { in: [...fragranceIds] } },
    select: { id: true, name: true, brand: { select: { name: true } } },
  });
  // findMany does not preserve the order asked for, and for a twin the order is
  // the difference between "Acqua di Gio + Stronger With You" and its reverse.
  const byId = new Map(fragrances.map((f) => [f.id, f]));
  const ordered = fragranceIds.flatMap((id) => {
    const f = byId.get(id);
    return f ? [f] : [];
  });
  if (ordered.length === 0)
    throw new CatalogConflict("Не найден ни один из выбранных ароматов");

  const brand = ordered[0]?.brand.name ?? "";
  return `${brand} ${ordered.map((f) => f.name).join(" + ")}`.trim();
}

function validate(input: ProductInput): void {
  if (input.fragranceIds.length === 0) {
    // The database enforces this with a deferred constraint trigger, which
    // fires at COMMIT with a message about a trigger. This fires here.
    throw new CatalogConflict("У товара должен быть хотя бы один аромат");
  }
  if (input.fragranceIds.length > 2) {
    throw new CatalogConflict("У товара может быть не больше двух ароматов");
  }
  if (new Set(input.fragranceIds).size !== input.fragranceIds.length) {
    throw new CatalogConflict("Один и тот же аромат выбран дважды");
  }
  if (input.sku.trim() === "") throw new CatalogConflict("Укажите артикул");
  if (input.priceKop <= 0) throw new CatalogConflict("Цена должна быть больше нуля");
  if (input.oldPriceKop !== null && input.oldPriceKop <= input.priceKop) {
    // Not a hard error in the data, but a "старая цена" below the new one
    // renders as a struck-through smaller number, which reads as a mistake.
    throw new CatalogConflict("Старая цена должна быть больше текущей");
  }
  if (input.packSize < 1) throw new CatalogConflict("Кратность не может быть меньше 1");
  if (input.volumeMl <= 0) throw new CatalogConflict("Укажите объём");
}

export async function createProduct(
  input: ProductInput,
): Promise<Mutation<ProductRef>> {
  return inTransaction((tx) => createInside(tx, input));
}

export async function updateProduct(
  id: string,
  input: ProductInput,
): Promise<Mutation<ProductRef>> {
  validate(input);

  return inTransaction(async (tx) => {
    const before = await tx.product.findUniqueOrThrow({
      where: { id },
      select: { slug: true, sku: true, status: true, publishedAt: true },
    });
    // The tags of where it used to live, taken before anything moves: a product
    // changing category leaves a stale listing behind otherwise.
    const previousTags = await tagsForProduct(tx, id);

    const sku = input.sku.trim();
    const clash = await tx.product.findFirst({
      where: { sku, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw new CatalogConflict(`Артикул ${sku} уже занят`);

    const title = input.title?.trim() || (await generateTitle(tx, input.fragranceIds));
    const slug = await allocateSlug(
      tx,
      "product",
      `${title} ${input.volumeMl}ml ${sku}`,
      {
        exceptId: id,
        override: input.slug ?? before.slug,
      },
    );

    // Replaced rather than diffed, and both statements inside this transaction:
    // the "at least one fragrance" trigger is deferred to COMMIT, so a delete
    // followed by an insert is fine — a delete that commits on its own is not.
    await tx.productFragrance.deleteMany({ where: { productId: id } });
    await tx.productFragrance.createMany({
      data: input.fragranceIds.map((fragranceId, position) => ({
        productId: id,
        fragranceId,
        position,
      })),
    });

    const product = await tx.product.update({
      where: { id },
      data: {
        categoryId: input.categoryId,
        sku,
        title,
        slug,
        volumeMl: input.volumeMl,
        priceKop: input.priceKop,
        oldPriceKop: input.oldPriceKop,
        packSize: input.packSize,
        stock: input.stock,
        status: input.status,
        isNew: input.isNew,
        isHit: input.isHit,
        popularity: input.popularity,
        // Stamped on the first publication and never moved again: «новинки» is
        // ordered by it, and re-saving an old product would otherwise send it
        // to the top of the lane.
        publishedAt:
          input.status === "PUBLISHED"
            ? (before.publishedAt ?? new Date())
            : before.publishedAt,
      },
      select: { id: true, slug: true, sku: true },
    });

    await reindexProducts(tx, [id]);

    const tags = new Tags().addAll(previousTags).addAll(await tagsForProduct(tx, id));
    return { data: product, tags: tags.list };
  });
}

/**
 * The same fragrance in another bottle.
 *
 * The workflow the brief calls «копия в другом формате», and the reason the
 * catalog is shaped around fragrances at all: a house releases one scent in
 * 35 ml, 100 ml and a twin, and entering it three times from scratch is how
 * three slightly different descriptions end up in the catalog.
 *
 * Everything about the scent is shared by reference. What is copied is the
 * bottle: the category, the price, the pack. Photographs are not — they are of
 * a different bottle.
 */
export async function copyToFormat(
  id: string,
  input: {
    categoryId: string;
    sku: string;
    volumeMl: number;
    priceKop: number;
    packSize: number;
  },
): Promise<Mutation<ProductRef>> {
  return inTransaction(async (tx) => {
    const source = await tx.product.findUniqueOrThrow({
      where: { id },
      select: {
        oldPriceKop: true,
        stock: true,
        isNew: true,
        isHit: true,
        popularity: true,
        fragrances: {
          select: { fragranceId: true, position: true },
          orderBy: { position: "asc" },
        },
      },
    });

    return createInside(tx, {
      categoryId: input.categoryId,
      fragranceIds: source.fragrances.map((f) => f.fragranceId),
      sku: input.sku,
      volumeMl: input.volumeMl,
      priceKop: input.priceKop,
      // Not copied: an old price belongs to the bottle it was discounted on.
      oldPriceKop: null,
      packSize: input.packSize,
      stock: source.stock,
      // A copy starts as a draft. It has no photographs and an article that may
      // still be wrong, and publishing it straight to the storefront would put
      // a monogram placeholder in front of buyers.
      status: "DRAFT",
      isNew: source.isNew,
      isHit: false,
      popularity: source.popularity,
    });
  });
}

/**
 * Creating a product, inside a transaction the caller owns.
 *
 * Separate from createProduct because copyToFormat has to read the source row
 * and create the copy atomically — two calls to createProduct would be two
 * transactions, and a crash between them leaves a copy of a product that was
 * meanwhile deleted.
 */
async function createInside(
  tx: Tx,
  input: ProductInput,
): Promise<Mutation<ProductRef>> {
  validate(input);

  const sku = input.sku.trim();
  const clash = await tx.product.findUnique({ where: { sku }, select: { id: true } });
  if (clash) throw new CatalogConflict(`Артикул ${sku} уже занят`);

  const title = input.title?.trim() || (await generateTitle(tx, input.fragranceIds));
  const slug = await allocateSlug(
    tx,
    "product",
    `${title} ${input.volumeMl}ml ${sku}`,
    {
      override: input.slug,
    },
  );

  const product = await tx.product.create({
    data: {
      categoryId: input.categoryId,
      sku,
      title,
      slug,
      volumeMl: input.volumeMl,
      priceKop: input.priceKop,
      oldPriceKop: input.oldPriceKop,
      packSize: input.packSize,
      stock: input.stock,
      status: input.status,
      isNew: input.isNew,
      isHit: input.isHit,
      popularity: input.popularity,
      publishedAt: input.status === "PUBLISHED" ? new Date() : null,
      fragrances: {
        create: input.fragranceIds.map((fragranceId, position) => ({
          fragranceId,
          position,
        })),
      },
    },
    select: { id: true, slug: true, sku: true },
  });

  await reindexProducts(tx, [product.id]);
  return { data: product, tags: await tagsForProduct(tx, product.id) };
}

/**
 * Deleting a product.
 *
 * Allowed, unlike a brand or a category, because an article entered by mistake
 * has to be removable. Past requests keep their line items: OrderItem holds a
 * snapshot and its productId is `onDelete: SetNull`, so a deleted product
 * leaves the order readable and marked "товара больше нет в каталоге".
 *
 * For a product that simply stopped being stocked, the answer is ARCHIVED.
 */
export async function deleteProduct(id: string): Promise<Mutation<{ sku: string }>> {
  return inTransaction(async (tx) => {
    const tags = await tagsForProduct(tx, id);
    const product = await tx.product.delete({ where: { id }, select: { sku: true } });
    return { data: product, tags };
  });
}

// ── Bulk actions ─────────────────────────────────────────────────────────────

export type BulkAction =
  | { kind: "status"; status: PublishStatus }
  | { kind: "stock"; stock: StockState }
  | { kind: "category"; categoryId: string }
  | { kind: "flag"; flag: "isNew" | "isHit"; value: boolean };

/**
 * One action over many products.
 *
 * The tags of the whole set are collected and returned once, so a publish of
 * two hundred products invalidates each affected tag a single time rather than
 * two hundred. That is the rule the import follows too, and the reason the
 * runner deduplicates rather than the callers.
 */
export async function bulkUpdateProducts(
  ids: readonly string[],
  action: BulkAction,
): Promise<Mutation<number>> {
  if (ids.length === 0) return { data: 0, tags: [] };

  return inTransaction(
    async (tx) => {
      const tags = new Tags().add(CATALOG_TAG);
      // Collected before the change, so a move out of a category invalidates
      // the listing it is leaving.
      for (const id of ids) tags.addAll(await tagsForProduct(tx, id));

      let changed = 0;
      switch (action.kind) {
        case "status": {
          // publishedAt is stamped only on rows that have never had one.
          const result = await tx.product.updateMany({
            where: { id: { in: [...ids] } },
            data: { status: action.status },
          });
          changed = result.count;
          if (action.status === "PUBLISHED") {
            await tx.product.updateMany({
              where: { id: { in: [...ids] }, publishedAt: null },
              data: { publishedAt: new Date() },
            });
          }
          break;
        }
        case "stock": {
          const result = await tx.product.updateMany({
            where: { id: { in: [...ids] } },
            data: { stock: action.stock },
          });
          changed = result.count;
          break;
        }
        case "category": {
          const result = await tx.product.updateMany({
            where: { id: { in: [...ids] } },
            data: { categoryId: action.categoryId },
          });
          changed = result.count;
          break;
        }
        case "flag": {
          const result = await tx.product.updateMany({
            where: { id: { in: [...ids] } },
            data: { [action.flag]: action.value },
          });
          changed = result.count;
          break;
        }
      }

      // The destination listing, after the move.
      if (action.kind === "category") {
        const category = await tx.category.findUnique({
          where: { id: action.categoryId },
          select: { slug: true },
        });
        if (category) tags.add(categoryTag(category.slug));
      }

      return { data: changed, tags: tags.list };
    },
    { timeoutMs: 120_000 },
  );
}

/** Inline edits from the table: one field, one row, no form. */
export async function setProductPrice(
  id: string,
  priceKop: number,
): Promise<Mutation<ProductRef>> {
  if (priceKop <= 0) throw new CatalogConflict("Цена должна быть больше нуля");
  return inTransaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: { priceKop },
      select: { id: true, slug: true, sku: true },
    });
    return { data: product, tags: await tagsForProduct(tx, id) };
  });
}

export async function setProductStock(
  id: string,
  stock: StockState,
): Promise<Mutation<ProductRef>> {
  return inTransaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: { stock },
      select: { id: true, slug: true, sku: true },
    });
    return { data: product, tags: await tagsForProduct(tx, id) };
  });
}
