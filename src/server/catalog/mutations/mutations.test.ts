import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";

import { createBrand, updateBrand } from "./brands";
import { createCategory, deleteCategory } from "./categories";
import { createFragrance } from "./fragrances";
import { createProduct, updateProduct } from "./products";
import { CatalogConflict } from "./run";

/**
 * Against the development database, skipped when it is not reachable — a laptop
 * without `docker compose up` should not report a red build.
 *
 * What is being tested is the pair of promises the whole caching scheme rests
 * on: a mutation reports every tag it dirtied, and a mutation that fails
 * reports none and leaves nothing behind. Both are invisible in production
 * until a buyer sees a price that no longer exists, so they are worth asserting
 * against real rows rather than a mock.
 */
const reachable = Boolean(process.env.DATABASE_URL);

// A prefix nothing else uses, so the cleanup cannot touch the seed.
const MARK = "zz-mutations-test";

/**
 * Runs before as well as after.
 *
 * A previous run that crashed leaves its rows behind, and the next run then
 * fails on a duplicate article — reporting a broken mutation when what is
 * broken is the last run's cleanup.
 */
async function removeFixtures() {
  if (!reachable) return;
  // Products only: the links cascade with them. Deleting the links on their own
  // trips the deferred "every product has at least one fragrance" trigger at
  // COMMIT — the same trap the seed hit.
  await prisma.product.deleteMany({ where: { sku: { startsWith: MARK } } });
  await prisma.fragrance.deleteMany({ where: { slug: { startsWith: MARK } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: MARK } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: MARK } } });
}

beforeAll(removeFixtures);
afterAll(removeFixtures);

async function fixture(suffix: string) {
  const category = await createCategory({
    name: `${MARK} категория ${suffix}`,
    slug: `${MARK}-cat-${suffix}`,
    subtitle: null,
    isPublished: true,
  });
  const brand = await createBrand({
    name: `${MARK} Бренд ${suffix}`,
    slug: `${MARK}-brand-${suffix}`,
    aliases: ["старый алиас"],
    sortOrder: 0,
    isPublished: true,
  });
  const fragrance = await createFragrance({
    brandId: brand.data.id,
    name: `Аромат ${suffix}`,
    slug: `${MARK}-fra-${suffix}`,
    aliases: [],
    gender: "UNISEX",
    families: ["WOODY"],
    notesTop: ["бергамот"],
    notesHeart: [],
    notesBase: [],
    description: null,
  });
  const product = await createProduct({
    categoryId: category.data.id,
    fragranceIds: [fragrance.data.id],
    sku: `${MARK}-${suffix}`,
    volumeMl: 100,
    priceKop: 100_000,
    oldPriceKop: null,
    packSize: 1,
    stock: "IN_STOCK",
    status: "PUBLISHED",
    isNew: false,
    isHit: false,
    popularity: 0,
  });
  return { category, brand, fragrance, product };
}

describe.skipIf(!reachable)("мутации каталога — теги и откат", () => {
  it("создание товара возвращает теги каталога, категории, бренда и самого товара", async () => {
    const { product, category, brand } = await fixture("a");

    expect(product.tags).toContain("catalog");
    expect(product.tags).toContain(`product:${product.data.slug}`);
    expect(product.tags).toContain(`category:${category.data.slug}`);
    expect(product.tags).toContain(`brand:${brand.data.slug}`);
  });

  it("переименование бренда переиндексирует его товары и вернёт их теги", async () => {
    const { brand, product } = await fixture("b");

    const before = await prisma.product.findUniqueOrThrow({
      where: { id: product.data.id },
      select: { searchText: true },
    });
    // The haystack is normalised, not transliterated: slugs become Latin,
    // search text stays in the script it was written in.
    expect(before.searchText).toContain("бренд");

    const renamed = await updateBrand(brand.data.id, {
      name: "Совершенно Другое Имя",
      slug: brand.data.slug,
      aliases: ["старый алиас"],
      sortOrder: 0,
      isPublished: true,
    });

    const after = await prisma.product.findUniqueOrThrow({
      where: { id: product.data.id },
      select: { searchText: true },
    });
    // The finding this closes: without the cascade the haystack still holds the
    // old spelling and never the new one, and search fails silently.
    expect(after.searchText).toContain("совершенно");
    expect(after.searchText).not.toContain("бренд b");
    expect(after.searchText).not.toBe(before.searchText);

    expect(renamed.tags).toContain(`product:${product.data.slug}`);
  });

  it("правка, не трогающая стог, товары не переиндексирует", async () => {
    const { brand, product } = await fixture("c");

    const quiet = await updateBrand(brand.data.id, {
      name: `${MARK} Бренд c`,
      slug: brand.data.slug,
      aliases: ["старый алиас"],
      sortOrder: 7,
      isPublished: false,
    });

    // Reordering and hiding change nothing a buyer can search for, so a
    // thousand-product brand must not rewrite a thousand rows to find that out.
    expect(quiet.tags).not.toContain(`product:${product.data.slug}`);
  });

  it("откат не оставляет ни строки, ни тега", async () => {
    const { category, fragrance } = await fixture("d");

    const skuInUse = `${MARK}-d`;
    const before = await prisma.product.count();

    await expect(
      createProduct({
        categoryId: category.data.id,
        fragranceIds: [fragrance.data.id],
        // Already taken by the fixture, so the mutation refuses mid-transaction.
        sku: skuInUse,
        volumeMl: 35,
        priceKop: 50_000,
        oldPriceKop: null,
        packSize: 1,
        stock: "IN_STOCK",
        status: "PUBLISHED",
        isNew: false,
        isHit: false,
        popularity: 0,
      }),
    ).rejects.toBeInstanceOf(CatalogConflict);

    expect(await prisma.product.count()).toBe(before);
  });

  it("смена категории отдаёт теги и старого, и нового списка", async () => {
    const { product, category, fragrance } = await fixture("e");
    const moved = await createCategory({
      name: `${MARK} категория e2`,
      slug: `${MARK}-cat-e2`,
      subtitle: null,
      isPublished: true,
    });

    const updated = await updateProduct(product.data.id, {
      categoryId: moved.data.id,
      fragranceIds: [fragrance.data.id],
      sku: `${MARK}-e`,
      volumeMl: 100,
      priceKop: 100_000,
      oldPriceKop: null,
      packSize: 1,
      stock: "IN_STOCK",
      status: "PUBLISHED",
      isNew: false,
      isHit: false,
      popularity: 0,
    });

    // Without the old one, the listing the product left keeps showing it.
    expect(updated.tags).toContain(`category:${category.data.slug}`);
    expect(updated.tags).toContain(`category:${moved.data.slug}`);
  });

  it("категорию с товарами удалить нельзя, и отказ объясним", async () => {
    const { category } = await fixture("f");

    await expect(deleteCategory(category.data.id)).rejects.toThrow(/ещё 1 товаров/);
  });
});
