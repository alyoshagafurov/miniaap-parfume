"use server";

import { z } from "zod";

import { PUBLISH_STATUSES, STOCK_STATES } from "@/lib/admin-products";
import { GENDERS } from "@/lib/list-url";
import { searchFragrances, type FragranceOption } from "@/server/admin/product-form";
import { requirePermission } from "@/server/auth/roles";
import { fromAction } from "@/server/catalog/revalidate";
import { createBrand } from "@/server/catalog/mutations/brands";
import { createFragrance } from "@/server/catalog/mutations/fragrances";
import { prisma } from "@/server/db";
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

// A charset, because this value is concatenated into an S3 object key and
// into a URL. A SKU of "../../banner" is not a write-anywhere primitive —
// S3 treats ".." as a literal segment — but the browser normalises it before
// fetching, so the URL requested stops being the URL stored.
const Sku = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/);

/**
 * What to say about a field the schema refused.
 *
 * One sentence per field, naming it, rather than zod's own messages: those are
 * English and describe the check («Too small: expected number to be >0»), and
 * the person reading this is looking at a form, not at a schema. Every field
 * a person types or picks is here; what is missing — an id, a checkbox — can
 * only be wrong if the request was not sent by the form.
 */
const FIELD_PROBLEMS: Record<string, string> = {
  categoryId: "Выберите категорию",
  fragranceIds: "Выберите один или два аромата",
  sku: "Артикул: только латинские буквы, цифры, точка, дефис, подчёркивание — без пробелов внутри и русских букв, до 64 знаков",
  title: "Название — не длиннее 200 знаков",
  slug: "Адрес (slug) — не длиннее 200 знаков",
  volumeMl: "Объём — целое число миллилитров больше нуля",
  priceKop: "Цена должна быть больше нуля",
  oldPriceKop: "Старая цена должна быть больше нуля",
  packSize: "Кратность — целое число от 1 до 9999",
  stock: "Выберите наличие",
  status: "Выберите статус",
  popularity: "Популярность — целое число от 0 до 1 000 000",
};

type Refusal = { ok: false; message: string; field?: string };

/**
 * The first refused field, in the order the form shows them, with its sentence.
 *
 * The first and not all of them: the client's own rules have already caught
 * everything a person usually gets wrong, so what reaches here is one thing —
 * most often an article typed on a Russian layout — and one clear sentence
 * beats a list.
 */
function refusal(error: z.ZodError, order: readonly string[]): Refusal {
  const fieldErrors: Partial<Record<string, string[]>> =
    z.flattenError(error).fieldErrors;
  const field = order.find((name) => (fieldErrors[name]?.length ?? 0) > 0);
  if (!field) return { ok: false, message: "Проверьте заполнение формы" };
  return {
    ok: false,
    field,
    message: FIELD_PROBLEMS[field] ?? "Проверьте заполнение формы",
  };
}

const ProductInputSchema = z.object({
  categoryId: z.string().min(1).max(64),
  fragranceIds: z.array(z.string().min(1).max(64)).min(1).max(2),
  sku: Sku,
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

export type SaveResult = { ok: true; id: string; slug: string } | Refusal;

export async function saveProduct(input: unknown): Promise<SaveResult> {
  await requirePermission("catalog:write");

  // In two steps, so the product's own fields are reported by their names
  // rather than as one refusal of a key called "product".
  const envelope = z
    .object({ id: z.string().min(1).max(64).nullish(), product: z.unknown() })
    .safeParse(input);
  if (!envelope.success) return { ok: false, message: "Некорректный запрос" };
  const parsed = ProductInputSchema.safeParse(envelope.data.product);
  if (!parsed.success)
    return refusal(parsed.error, Object.keys(ProductInputSchema.shape));

  try {
    const id = envelope.data.id;
    const product = parsed.data;
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
  sku: Sku,
  volumeMl: z.number().int().positive().max(100_000),
  priceKop: z.number().int().positive().max(2_147_483_647),
  packSize: z.number().int().min(1).max(9999),
});

export async function copyProduct(input: unknown): Promise<SaveResult> {
  await requirePermission("catalog:write");
  const parsed = CopyInput.safeParse(input);
  if (!parsed.success) return refusal(parsed.error, Object.keys(CopyInput.shape));

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
  brandName: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(200),
  // Defaulted rather than required only for a form opened before this field
  // existed; the picker always sends it.
  gender: z.enum(GENDERS).default("UNISEX"),
});

export type FragranceCreated =
  | { ok: true; id: string; name: string; brandName: string }
  | { ok: false; message: string };

/**
 * A fragrance created from inside the product form.
 *
 * The brand, the name and who it is for: the notes, the families and the
 * description are the fragrance screen's job, and asking for them here would
 * turn adding a product into filling in two forms. What it creates is complete
 * enough to be correct and obviously incomplete enough to be finished later.
 *
 * Gender is asked because it is not a detail. The storefront's «Мужской» and
 * «Женский» filters match it exactly, and when it was fixed at unisex here
 * every fragrance entered from the product form vanished from both.
 *
 * The brand is typed, not chosen from a list, and created if it is new. The
 * brands screen left the panel's menu when the client asked for five sections,
 * and a picker that could only choose an existing brand would then have been a
 * dead end on an empty catalog — no brand, so no fragrance, so no product at
 * all. An existing brand is matched regardless of case, so «chanel» finds
 * «Chanel» rather than making a second one.
 */
export async function createFragranceInline(input: unknown): Promise<FragranceCreated> {
  await requirePermission("catalog:write");
  const parsed = InlineFragrance.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Укажите бренд и название" };

  try {
    const existing = await prisma.brand.findFirst({
      where: { name: { equals: parsed.data.brandName, mode: "insensitive" } },
      select: { id: true, name: true },
    });
    let brand: { id: string; name: string };
    if (existing) {
      brand = existing;
    } else {
      const created = await fromAction(
        createBrand({
          name: parsed.data.brandName,
          aliases: [],
          sortOrder: 0,
          isPublished: true,
        }),
      );
      brand = { id: created.id, name: parsed.data.brandName };
    }

    const created = await fromAction(
      createFragrance({
        brandId: brand.id,
        name: parsed.data.name,
        aliases: [],
        gender: parsed.data.gender,
        families: [],
        notesTop: [],
        notesHeart: [],
        notesBase: [],
        description: null,
      }),
    );
    return { ok: true, id: created.id, name: created.name, brandName: brand.name };
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
