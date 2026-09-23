"use server";

import { z } from "zod";

import { FAMILIES, GENDERS } from "@/lib/list-url";
import { requirePermission } from "@/server/auth/roles";
import {
  createBrand,
  deleteBrand,
  updateBrand,
} from "@/server/catalog/mutations/brands";
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  updateCategory,
} from "@/server/catalog/mutations/categories";
import {
  createFragrance,
  deleteFragrance,
  updateFragrance,
} from "@/server/catalog/mutations/fragrances";
import { CatalogConflict } from "@/server/catalog/mutations/run";
import { fromAction } from "@/server/catalog/revalidate";

/**
 * Brands, categories and fragrances.
 *
 * One file, because the three screens are the same screen with different
 * fields, and three files of identical error handling drift. Each action checks
 * its permission and hands the mutation's promise to fromAction; the
 * invalidation order is the mutations layer's problem, not this one's.
 */

export type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; message: string };

async function run<T>(work: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await work();
    return { ok: true, data } as Result<T>;
  } catch (error) {
    if (error instanceof CatalogConflict) return { ok: false, message: error.message };
    return { ok: false, message: "Не удалось сохранить. Попробуйте ещё раз." };
  }
}

// ── Brands ───────────────────────────────────────────────────────────────────

const BrandFields = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(120).nullish(),
  /** Typed as one line, split here: «шанель, шанел» is how a person writes a list. */
  aliases: z.string().max(1000).default(""),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  isPublished: z.boolean().default(true),
});

function splitAliases(value: string): string[] {
  return value
    .split(/[,\n;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

export async function saveBrand(input: unknown): Promise<Result<{ id: string }>> {
  await requirePermission("catalog:write");
  const parsed = z
    .object({ id: z.string().min(1).max(64).nullish(), fields: BrandFields })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Проверьте заполнение формы" };

  const { id, fields } = parsed.data;
  const payload = {
    name: fields.name,
    slug: fields.slug ?? null,
    aliases: splitAliases(fields.aliases),
    sortOrder: fields.sortOrder,
    isPublished: fields.isPublished,
  };

  return run(async () => {
    const saved = id
      ? await fromAction(updateBrand(id, payload))
      : await fromAction(createBrand(payload));
    return { id: saved.id };
  });
}

export async function removeBrand(input: unknown): Promise<Result<{ slug: string }>> {
  await requirePermission("catalog:write");
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };
  return run(() => fromAction(deleteBrand(parsed.data.id)));
}

// ── Categories ───────────────────────────────────────────────────────────────

const CategoryFields = z.object({
  name: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(200).nullable().default(null),
  slug: z.string().trim().max(120).nullish(),
  isPublished: z.boolean().default(true),
});

export async function saveCategory(input: unknown): Promise<Result<{ id: string }>> {
  await requirePermission("catalog:write");
  const parsed = z
    .object({ id: z.string().min(1).max(64).nullish(), fields: CategoryFields })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Проверьте заполнение формы" };

  const { id, fields } = parsed.data;
  const payload = {
    name: fields.name,
    subtitle: fields.subtitle,
    slug: fields.slug ?? null,
    isPublished: fields.isPublished,
  };

  return run(async () => {
    const saved = id
      ? await fromAction(updateCategory(id, payload))
      : await fromAction(createCategory(payload));
    return { id: saved.id };
  });
}

export async function removeCategory(
  input: unknown,
): Promise<Result<{ slug: string }>> {
  await requirePermission("catalog:write");
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };
  return run(() => fromAction(deleteCategory(parsed.data.id)));
}

export async function moveCategories(input: unknown): Promise<Result<number>> {
  await requirePermission("catalog:write");
  const parsed = z
    .object({ ids: z.array(z.string().min(1).max(64)).min(1).max(200) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };
  return run(() => fromAction(reorderCategories(parsed.data.ids)));
}

// ── Fragrances ───────────────────────────────────────────────────────────────

const FragranceFields = z.object({
  brandId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(200).nullish(),
  aliases: z.string().max(2000).default(""),
  gender: z.enum(GENDERS),
  families: z.array(z.enum(FAMILIES)).max(FAMILIES.length).default([]),
  notesTop: z.string().max(2000).default(""),
  notesHeart: z.string().max(2000).default(""),
  notesBase: z.string().max(2000).default(""),
  description: z.string().trim().max(4000).nullable().default(null),
});

export async function saveFragrance(input: unknown): Promise<Result<{ id: string }>> {
  await requirePermission("catalog:write");
  const parsed = z
    .object({ id: z.string().min(1).max(64).nullish(), fields: FragranceFields })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Проверьте заполнение формы" };

  const { id, fields } = parsed.data;
  const payload = {
    brandId: fields.brandId,
    name: fields.name,
    slug: fields.slug ?? null,
    aliases: splitAliases(fields.aliases),
    gender: fields.gender,
    families: fields.families,
    notesTop: splitAliases(fields.notesTop),
    notesHeart: splitAliases(fields.notesHeart),
    notesBase: splitAliases(fields.notesBase),
    description: fields.description,
  };

  return run(async () => {
    const saved = id
      ? await fromAction(updateFragrance(id, payload))
      : await fromAction(createFragrance(payload));
    return { id: saved.id };
  });
}

export async function removeFragrance(
  input: unknown,
): Promise<Result<{ slug: string }>> {
  await requirePermission("catalog:write");
  const parsed = z.object({ id: z.string().min(1).max(64) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };
  return run(() => fromAction(deleteFragrance(parsed.data.id)));
}
