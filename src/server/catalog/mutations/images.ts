import { brandTag, CATALOG_TAG, categoryTag, productTag } from "@/server/catalog/tags";

import { CatalogConflict, inTransaction, Tags, type Mutation, type Tx } from "./run";

/**
 * Product photographs.
 *
 * The rows only; the bytes are handled by src/server/storage, because the
 * upload arrives at a Route Handler — a Server Action body is capped at 1 MB
 * and a photograph from a phone is several times that.
 *
 * Order is what makes one of them the cover, so it is explicit everywhere: a
 * `sortOrder` the administrator drags, never "whichever came back first".
 */

export interface StoredImage {
  key: string;
  width: number;
  height: number;
  blurDataUrl: string;
}

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

/** Appends stored images to a product, after the last one it already has. */
export async function addProductImages(
  productId: string,
  images: readonly StoredImage[],
): Promise<Mutation<number>> {
  if (images.length === 0) return { data: 0, tags: [] };

  return inTransaction(async (tx) => {
    const last = await tx.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });
    const start = (last._max.sortOrder ?? -1) + 1;

    await tx.productImage.createMany({
      data: images.map((image, i) => ({ productId, ...image, sortOrder: start + i })),
    });

    return { data: images.length, tags: await tagsForProduct(tx, productId) };
  });
}

/**
 * The order they appear in, cover first.
 *
 * Takes the full list rather than a move: a drag produces a new order, and
 * applying it wholesale cannot leave two images claiming the same position the
 * way a sequence of swaps can.
 */
export async function reorderProductImages(
  productId: string,
  imageIds: readonly string[],
): Promise<Mutation<number>> {
  return inTransaction(async (tx) => {
    const existing = await tx.productImage.findMany({
      where: { productId },
      select: { id: true },
    });
    const known = new Set(existing.map((i) => i.id));
    if (imageIds.length !== known.size || imageIds.some((id) => !known.has(id))) {
      // A partial order would silently leave the missing images at whatever
      // position they had, which is how a cover changes by itself.
      throw new CatalogConflict("Список фотографий не совпадает с сохранённым");
    }

    for (const [index, id] of imageIds.entries()) {
      await tx.productImage.update({ where: { id }, data: { sortOrder: index } });
    }

    return { data: imageIds.length, tags: await tagsForProduct(tx, productId) };
  });
}

/**
 * Removes an image row and reports the keys whose bytes are now unreferenced.
 *
 * The caller deletes the objects, after the transaction commits. Deleting the
 * bytes first would leave a row pointing at nothing if the transaction rolled
 * back — a broken image on the storefront — while this way the worst case is an
 * orphaned object in a bucket, which costs storage and nothing else.
 */
export async function removeProductImage(
  imageId: string,
): Promise<Mutation<{ productId: string; key: string }>> {
  return inTransaction(async (tx) => {
    const image = await tx.productImage.findUniqueOrThrow({
      where: { id: imageId },
      select: { id: true, key: true, productId: true },
    });
    const tags = await tagsForProduct(tx, image.productId);

    await tx.productImage.delete({ where: { id: imageId } });

    // Close the gap, so the next upload does not land on a used position.
    const rest = await tx.productImage.findMany({
      where: { productId: image.productId },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    for (const [index, row] of rest.entries()) {
      await tx.productImage.update({
        where: { id: row.id },
        data: { sortOrder: index },
      });
    }

    return { data: { productId: image.productId, key: image.key }, tags };
  });
}
