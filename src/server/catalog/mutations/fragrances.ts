import type { Family, Gender } from "@prisma/client";

import { brandTag, CATALOG_TAG, productTag } from "@/server/catalog/tags";

import { normalizeAliases } from "./brands";
import { allocateSlug } from "./slugs";
import { productIdsOfFragrance, productSlugs, reindexProducts } from "./search-text";
import { CatalogConflict, inTransaction, Tags, type Mutation } from "./run";
import { GOODS, plural } from "@/lib/format";

/**
 * Fragrances.
 *
 * The scent, separate from the bottle. One fragrance is sold in several
 * formats, and a twin carries two in one bottle — that relationship is what the
 * whole catalog is organised around, and it is why a fragrance is a row rather
 * than a field on a product.
 *
 * Almost everything here is in the search haystack: the name, the aliases, and
 * — recall-only — the notes and the description. So almost every edit cascades
 * into a reindex of the products that carry it, in the same transaction.
 */

export interface FragranceInput {
  brandId: string;
  name: string;
  slug?: string | null;
  aliases: string[];
  gender: Gender;
  families: Family[];
  notesTop: string[];
  notesHeart: string[];
  notesBase: string[];
  description: string | null;
}

export async function createFragrance(
  input: FragranceInput,
): Promise<Mutation<{ id: string; slug: string; name: string }>> {
  return inTransaction(async (tx) => {
    const brand = await tx.brand.findUnique({
      where: { id: input.brandId },
      select: { name: true, slug: true },
    });
    if (!brand) throw new CatalogConflict("Бренд не найден");

    const name = input.name.trim();
    const taken = await tx.fragrance.findFirst({
      where: { brandId: input.brandId, name: { equals: name, mode: "insensitive" } },
      select: { name: true },
    });
    // The unique constraint would catch an exact repeat, but «У Chanel уже есть
    // аромат "Chance"» is an answer and P2002 is not. Without regard to case,
    // which the constraint does not have: «chance» typed in a hurry is the same
    // scent, and a second row for it splits its formats across two fragrances.
    // The stored spelling in the message, so it is the one she searches for.
    if (taken)
      throw new CatalogConflict(
        `У бренда ${brand.name} уже есть аромат «${taken.name}»`,
      );

    // The brand is in the slug because two houses may both sell an "Aqua", and
    // /f/aqua-2 is a worse URL than /f/chanel-aqua.
    const slug = await allocateSlug(tx, "fragrance", `${brand.name} ${name}`, {
      override: input.slug,
    });

    const fragrance = await tx.fragrance.create({
      data: {
        brandId: input.brandId,
        name,
        slug,
        aliases: normalizeAliases(input.aliases),
        gender: input.gender,
        families: input.families,
        notesTop: normalizeNotes(input.notesTop),
        notesHeart: normalizeNotes(input.notesHeart),
        notesBase: normalizeNotes(input.notesBase),
        description: blankToNull(input.description),
      },
      select: { id: true, slug: true, name: true },
    });

    // No products carry it yet, so nothing to reindex.
    return {
      data: fragrance,
      tags: new Tags().add(CATALOG_TAG, brandTag(brand.slug)).list,
    };
  });
}

export async function updateFragrance(
  id: string,
  input: FragranceInput,
): Promise<Mutation<{ id: string; slug: string; name: string }>> {
  return inTransaction(
    async (tx) => {
      const before = await tx.fragrance.findUniqueOrThrow({
        where: { id },
        select: {
          slug: true,
          name: true,
          aliases: true,
          notesTop: true,
          notesHeart: true,
          notesBase: true,
          description: true,
          brand: { select: { id: true, name: true, slug: true } },
        },
      });

      const brand = await tx.brand.findUnique({
        where: { id: input.brandId },
        select: { name: true, slug: true },
      });
      if (!brand) throw new CatalogConflict("Бренд не найден");

      const name = input.name.trim();
      // The same rule as creating one, case and all.
      const clash = await tx.fragrance.findFirst({
        where: {
          brandId: input.brandId,
          name: { equals: name, mode: "insensitive" },
          id: { not: id },
        },
        select: { name: true },
      });
      if (clash)
        throw new CatalogConflict(
          `У бренда ${brand.name} уже есть аромат «${clash.name}»`,
        );

      const slug = await allocateSlug(tx, "fragrance", `${brand.name} ${name}`, {
        exceptId: id,
        override: input.slug ?? before.slug,
      });

      const aliases = normalizeAliases(input.aliases);
      const notesTop = normalizeNotes(input.notesTop);
      const notesHeart = normalizeNotes(input.notesHeart);
      const notesBase = normalizeNotes(input.notesBase);
      const description = blankToNull(input.description);

      const fragrance = await tx.fragrance.update({
        where: { id },
        data: {
          brandId: input.brandId,
          name,
          slug,
          aliases,
          gender: input.gender,
          families: input.families,
          notesTop,
          notesHeart,
          notesBase,
          description,
        },
        select: { id: true, slug: true, name: true },
      });

      const tags = new Tags().add(
        CATALOG_TAG,
        brandTag(brand.slug),
        brandTag(before.brand.slug),
      );

      // Gender and families are filters, not text: they change what a product
      // matches without changing what it is indexed under.
      const haystackChanged =
        before.name !== name ||
        !same(before.aliases, aliases) ||
        !same(before.notesTop, notesTop) ||
        !same(before.notesHeart, notesHeart) ||
        !same(before.notesBase, notesBase) ||
        before.description !== description ||
        before.brand.id !== input.brandId;

      if (haystackChanged) {
        const productIds = await productIdsOfFragrance(tx, id);
        await reindexProducts(tx, productIds);
        tags.addAll((await productSlugs(tx, productIds)).map(productTag));
      }

      return { data: fragrance, tags: tags.list };
    },
    { timeoutMs: 120_000 },
  );
}

/** Refused while any product still carries it; the link is `onDelete: Restrict`. */
export async function deleteFragrance(id: string): Promise<Mutation<{ slug: string }>> {
  return inTransaction(async (tx) => {
    const fragrance = await tx.fragrance.findUniqueOrThrow({
      where: { id },
      select: {
        slug: true,
        brand: { select: { slug: true } },
        _count: { select: { products: true } },
      },
    });
    if (fragrance._count.products > 0) {
      throw new CatalogConflict(
        `${plural(fragrance._count.products, ["Аромат использует", "Аромат используют", "Аромат используют"])} ` +
          `${fragrance._count.products} ${plural(fragrance._count.products, GOODS)}. ` +
          `Сначала ${plural(fragrance._count.products, ["удалите или перепривяжите его", "удалите или перепривяжите их", "удалите или перепривяжите их"])}.`,
      );
    }

    await tx.fragrance.delete({ where: { id } });
    return {
      data: { slug: fragrance.slug },
      tags: new Tags().add(CATALOG_TAG, brandTag(fragrance.brand.slug)).list,
    };
  });
}

/**
 * Notes are tags, not prose: trimmed, blanks dropped, duplicates removed,
 * lower-cased. «Бергамот» and «бергамот» in one pyramid is a slip, and the two
 * render identically once the card joins them with a middle dot.
 */
export function normalizeNotes(notes: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of notes) {
    const note = raw.trim().toLowerCase();
    if (note === "" || seen.has(note)) continue;
    seen.add(note);
    out.push(note);
  }
  return out;
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
