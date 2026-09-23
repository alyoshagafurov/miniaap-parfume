"use server";

import { z } from "zod";

import { PUBLISH_STATUSES, STOCK_STATES } from "@/lib/admin-products";
import { requirePermission } from "@/server/auth/roles";
import { fromAction } from "@/server/catalog/revalidate";
import {
  bulkUpdateProducts,
  setProductPrice,
  setProductStock,
  type BulkAction,
} from "@/server/catalog/mutations/products";
import { CatalogConflict } from "@/server/catalog/mutations/run";

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
