import { CATALOG_TAG, categoryTag } from "@/server/catalog/tags";

import { allocateSlug } from "./slugs";
import { CatalogConflict, inTransaction, Tags, type Mutation, type Tx } from "./run";
import { GOODS, plural } from "@/lib/format";

/**
 * Categories.
 *
 * Categories are the formats — 35 ml pencils, 100 ml, twins, deodorants — and
 * they are the pivot the whole catalog turns on, so there are few of them and
 * they are reordered by hand rather than sorted by anything.
 *
 * Nothing here touches the search haystack: a category's name is not in it. It
 * is in the URL, which is why a rename keeps the slug unless one is given.
 */

export interface CategoryInput {
  name: string;
  subtitle: string | null;
  slug?: string | null;
  /**
   * Absent means "leave it": on an update only an explicit value changes the
   * cover, and null removes it. The photograph is attached by the upload
   * route through setCategoryCover, never by the form, so the form's save
   * does not know the cover and must not decide it.
   */
  coverKey?: string | null;
  isPublished: boolean;
}

export async function createCategory(
  input: CategoryInput,
): Promise<Mutation<{ id: string; slug: string }>> {
  return inTransaction(async (tx) => {
    const slug = await allocateSlug(tx, "category", input.name, {
      override: input.slug,
    });
    // Appended, not inserted: a new category goes to the end of the list, where
    // the owner can drag it, rather than displacing something silently.
    const last = await tx.category.aggregate({ _max: { sortOrder: true } });

    const category = await tx.category.create({
      data: {
        name: input.name.trim(),
        subtitle: blankToNull(input.subtitle),
        slug,
        coverKey: input.coverKey ?? null,
        isPublished: input.isPublished,
        sortOrder: (last._max.sortOrder ?? 0) + 1,
      },
      select: { id: true, slug: true },
    });

    return {
      data: category,
      tags: new Tags().add(CATALOG_TAG, categoryTag(category.slug)).list,
    };
  });
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
): Promise<Mutation<{ id: string; slug: string }>> {
  return inTransaction(async (tx) => {
    const before = await tx.category.findUniqueOrThrow({
      where: { id },
      select: { slug: true },
    });

    const slug = await allocateSlug(tx, "category", input.name, {
      exceptId: id,
      override: input.slug ?? before.slug,
    });

    const category = await tx.category.update({
      where: { id },
      data: {
        name: input.name.trim(),
        subtitle: blankToNull(input.subtitle),
        slug,
        // Not `?? null`: that turned every «Править» → «Сохранить» into a
        // deletion of the photograph, and left its file orphaned in storage.
        ...(input.coverKey !== undefined ? { coverKey: input.coverKey } : {}),
        isPublished: input.isPublished,
      },
      select: { id: true, slug: true },
    });

    return {
      data: category,
      // Both slugs: the old page has to stop being served from cache too.
      tags: new Tags().add(
        CATALOG_TAG,
        categoryTag(before.slug),
        categoryTag(category.slug),
      ).list,
    };
  });
}

/**
 * The order the home screen lists them in.
 *
 * Written as one statement per row inside a transaction rather than as a
 * generated CASE: four rows, once in a while, and the readable version is the
 * one that will still be understood when the order changes again.
 */
export async function reorderCategories(
  ids: readonly string[],
): Promise<Mutation<number>> {
  return inTransaction(async (tx) => {
    const tags = new Tags().add(CATALOG_TAG);
    for (const [index, id] of ids.entries()) {
      const category = await tx.category.update({
        where: { id },
        data: { sortOrder: index },
        select: { slug: true },
      });
      tags.add(categoryTag(category.slug));
    }
    return { data: ids.length, tags: tags.list };
  });
}

/**
 * Removing a category.
 *
 * Refused while it still holds products. The foreign key is `onDelete: Restrict`
 * and would refuse on its own, but a category is the one thing an administrator
 * might delete expecting its products to move somewhere — they do not, and
 * saying so is the whole point of this check.
 */
export async function deleteCategory(id: string): Promise<Mutation<{ slug: string }>> {
  return inTransaction(async (tx) => {
    const category = await tx.category.findUniqueOrThrow({
      where: { id },
      select: { slug: true, _count: { select: { products: true } } },
    });
    if (category._count.products > 0) {
      throw new CatalogConflict(
        `В категории ещё ${category._count.products} ${plural(category._count.products, GOODS)}. ` +
          `${plural(category._count.products, ["Перенесите его", "Перенесите их", "Перенесите их"])} ` +
          "в другую категорию или удалите.",
      );
    }

    await tx.category.delete({ where: { id } });
    return {
      data: { slug: category.slug },
      tags: new Tags().add(CATALOG_TAG, categoryTag(category.slug)).list,
    };
  });
}

/** The cover image, set by the upload route after the file is stored. */
export async function setCategoryCover(
  id: string,
  coverKey: string | null,
): Promise<Mutation<{ slug: string }>> {
  return inTransaction(async (tx: Tx) => {
    const category = await tx.category.update({
      where: { id },
      data: { coverKey },
      select: { slug: true },
    });
    return {
      data: category,
      tags: new Tags().add(CATALOG_TAG, categoryTag(category.slug)).list,
    };
  });
}

/** An empty subtitle is absence, not an empty string the storefront renders. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}
