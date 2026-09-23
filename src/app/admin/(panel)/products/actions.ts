"use server";

import { z } from "zod";

import { PUBLISH_STATUSES, STOCK_STATES } from "@/lib/admin-products";
import { searchFragrances, type FragranceOption } from "@/server/admin/product-form";
import { requirePermission } from "@/server/auth/roles";
import { fromAction } from "@/server/catalog/revalidate";
import { createFragrance } from "@/server/catalog/mutations/fragrances";
import {
  removeProductImage,
  reorderProductImages,
} from "@/server/catalog/mutations/images";
import {
  bulkUpdateProducts,
  copyToFormat,
  createProduct,
  deleteProduct,
  setProductPrice,
  setProductStock,
  updateProduct,
  type BulkAction,
} from "@/server/catalog/mutations/products";
import { CatalogConflict } from "@/server/catalog/mutations/run";
import { deleteObjects, renditionKeys } from "@/server/storage/s3";

/**
 * Edits from the table.
 *
 * Every one begins with a permission check. Not because the panel is behind a
 * guard — it is — but because a Server Action is a POST endpoint that can be
 * invoked with the page never rendered, so a check that only exists in a layout
 * is a check in the one place that can be skipped.
 *
 * Every one ends by handing the mutation's promise to fromAction, which applies
 * the tags after the commit. There is no path here that writes and forgets.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

/**
 * Turns a mutation into something a screen can print.
 *
 * A CatalogConflict is a refusal an administrator could have foreseen and its
 * message is shown. Anything else is a fault, and its message may carry a
 * column name or a connection string, so it is replaced.
 */
async function run(work: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    if (error instanceof CatalogConflict) return { ok: false, message: error.message };
    return { ok: false, message: "Не удалось сохранить. Попробуйте ещё раз." };
  }
}

const Ids = z.array(z.string().min(1).max(64)).min(1).max(500);

const BulkInput = z.object({
  ids: Ids,
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("status"), status: z.enum(PUBLISH_STATUSES) }),
    z.object({ kind: z.literal("stock"), stock: z.enum(STOCK_STATES) }),
    z.object({ kind: z.literal("category"), categoryId: z.string().min(1).max(64) }),
    z.object({
      kind: z.literal("flag"),
      flag: z.enum(["isNew", "isHit"]),
      value: z.boolean(),
    }),
  ]),
});

export async function bulkProducts(input: unknown): Promise<ActionResult> {
  await requirePermission("catalog:write");
  const parsed = BulkInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };

  return run(() =>
    fromAction(bulkUpdateProducts(parsed.data.ids, parsed.data.action as BulkAction)),
  );
}

const PriceInput = z.object({
  id: z.string().min(1).max(64),
  // Kopecks. The ceiling is the Int column's, which is 21 474 836 ₽ — far above
  // any bottle and far below where the column would silently wrap.
  priceKop: z.number().int().positive().max(2_147_483_647),
});

export async function editPrice(input: unknown): Promise<ActionResult> {
  await requirePermission("catalog:write");
  const parsed = PriceInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректная цена" };

  return run(() => fromAction(setProductPrice(parsed.data.id, parsed.data.priceKop)));
}

const StockInput = z.object({
  id: z.string().min(1).max(64),
  stock: z.enum(STOCK_STATES),
});

export async function editStock(input: unknown): Promise<ActionResult> {
  await requirePermission("catalog:write");
  const parsed = StockInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректное значение" };

  return run(() => fromAction(setProductStock(parsed.data.id, parsed.data.stock)));
}

// ── The form ─────────────────────────────────────────────────────────────────

const ProductInputSchema = z.object({
  categoryId: z.string().min(1).max(64),
  fragranceIds: z.array(z.string().min(1).max(64)).min(1).max(2),
  // A charset, because this value is concatenated into an S3 object key and
  // into a URL. A SKU of "../../banner" is not a write-anywhere primitive —
  // S3 treats ".." as a literal segment — but the browser normalises it before
  // fetching, so the URL requested stops being the URL stored.
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Артикул: латиница, цифры, точка, дефис, подчёркивание",
    ),
  title: z.string().trim().max(200).nullish(),
  slug: z.string().trim().max(200).nullish(),
  volumeMl: z.number().int().positive().max(100_000),
  priceKop: z.number().int().positive().max(2_147_483_647),
  oldPriceKop: z.number().int().positive().max(2_147_483_647).nullable(),
  packSize: z.number().int().min(1).max(9999),
  stock: z.enum(STOCK_STATES),
  status: z.enum(PUBLISH_STATUSES),
  isNew: z.boolean(),
  isHit: z.boolean(),
  popularity: z.number().int().min(0).max(1_000_000),
});

export type SaveResult =
  { ok: true; id: string; slug: string } | { ok: false; message: string };

export async function saveProduct(input: unknown): Promise<SaveResult> {
  await requirePermission("catalog:write");

  const parsed = z
    .object({ id: z.string().min(1).max(64).nullish(), product: ProductInputSchema })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Проверьте заполнение формы" };

  try {
    const { id, product } = parsed.data;
    const saved = id
      ? await fromAction(updateProduct(id, product))
      : await fromAction(createProduct(product));
    return { ok: true, id: saved.id, slug: saved.slug };
  } catch (error) {
    if (error instanceof CatalogConflict) return { ok: false, message: error.message };
    return { ok: false, message: "Не удалось сохранить. Попробуйте ещё раз." };
  }
}

const CopyInput = z.object({
  id: z.string().min(1).max(64),
  categoryId: z.string().min(1).max(64),
  // A charset, because this value is concatenated into an S3 object key and
  // into a URL. A SKU of "../../banner" is not a write-anywhere primitive —
  // S3 treats ".." as a literal segment — but the browser normalises it before
  // fetching, so the URL requested stops being the URL stored.
  sku: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(
      /^[A-Za-z0-9._-]+$/,
      "Артикул: латиница, цифры, точка, дефис, подчёркивание",
    ),
  volumeMl: z.number().int().positive().max(100_000),
  priceKop: z.number().int().positive().max(2_147_483_647),
  packSize: z.number().int().min(1).max(9999),
});

export async function copyProduct(input: unknown): Promise<SaveResult> {
  await requirePermission("catalog:write");
  const parsed = CopyInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Проверьте заполнение формы" };

  try {
    const { id, ...rest } = parsed.data;
    const copy = await fromAction(copyToFormat(id, rest));
    return { ok: true, id: copy.id, slug: copy.slug };
  } catch (error) {
    if (error instanceof CatalogConflict) return { ok: false, message: error.message };
    return { ok: false, message: "Не удалось создать копию" };
  }
}

export async function removeProduct(input: unknown): Promise<ActionResult> {
  await requirePermission("catalog:write");
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };

  return run(() => fromAction(deleteProduct(parsed.data.id)));
}

// ── Photographs ──────────────────────────────────────────────────────────────

export async function reorderImages(input: unknown): Promise<ActionResult> {
  await requirePermission("catalog:write");
  const parsed = z
    .object({
      productId: z.string().min(1).max(64),
      imageIds: z.array(z.string().min(1).max(64)).max(50),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };

  return run(() =>
    fromAction(reorderProductImages(parsed.data.productId, parsed.data.imageIds)),
  );
}

/**
 * Deletes a photograph, then its bytes.
 *
 * In that order, and the bytes only if the row is really gone: an object with
 * no row is wasted storage, and a row with no object is a broken image in front
 * of a buyer.
 */
export async function removeImage(input: unknown): Promise<ActionResult> {
  await requirePermission("catalog:write");
  const parsed = z.object({ imageId: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };

  try {
    const removed = await fromAction(removeProductImage(parsed.data.imageId));
    await deleteObjects(renditionKeys(removed.key));
    return { ok: true };
  } catch (error) {
    if (error instanceof CatalogConflict) return { ok: false, message: error.message };
    return { ok: false, message: "Не удалось удалить фото" };
  }
}

// ── Fragrances, created without leaving the form ─────────────────────────────

const InlineFragrance = z.object({
  brandId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(200),
});

export type FragranceCreated =
  { ok: true; id: string; name: string } | { ok: false; message: string };

/**
 * A fragrance created from inside the product form.
 *
 * Only the brand and the name: the notes, the families and the description are
 * the fragrance screen's job, and asking for them here would turn adding a
 * product into filling in two forms. What it creates is complete enough to be
 * correct and obviously incomplete enough to be finished later.
 */
export async function createFragranceInline(input: unknown): Promise<FragranceCreated> {
  await requirePermission("catalog:write");
  const parsed = InlineFragrance.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Укажите бренд и название" };

  try {
    const created = await fromAction(
      createFragrance({
        brandId: parsed.data.brandId,
        name: parsed.data.name,
        aliases: [],
        gender: "UNISEX",
        families: [],
        notesTop: [],
        notesHeart: [],
        notesBase: [],
        description: null,
      }),
    );
    return { ok: true, id: created.id, name: created.name };
  } catch (error) {
    if (error instanceof CatalogConflict) return { ok: false, message: error.message };
    return { ok: false, message: "Не удалось создать аромат" };
  }
}

/**
 * The picker's search.
 *
 * A Server Action rather than a route: it returns twenty rows of two strings,
 * which is well inside an action's budget, and it keeps the permission check in
 * the same place as every other one.
 */
export async function findFragrances(input: unknown): Promise<FragranceOption[]> {
  await requirePermission("catalog:write");
  const parsed = z.object({ query: z.string().max(100) }).safeParse(input);
  if (!parsed.success) return [];
  return searchFragrances(parsed.data.query);
}
