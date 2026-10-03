import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";

import { createBrand, updateBrand } from "./brands";
import {
  createCategory,
  deleteCategory,
  setCategoryCover,
  updateCategory,
} from "./categories";
import { createFragrance } from "./fragrances";
import { importProducts } from "./import";
import {
  bulkUpdateProducts,
  copyToFormat,
  createProduct,
  setProductStock,
  setProductStockQty,
  updateProduct,
  type ProductInput,
} from "./products";
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

async function fixture(suffix: string, over: Partial<ProductInput> = {}) {
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
    stockQty: null,
    status: "PUBLISHED",
    isNew: false,
    isHit: false,
    popularity: 0,
    ...over,
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
        stockQty: null,
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
      stockQty: null,
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

    // «ещё 1 товар», не «ещё 1 товаров»: это сообщение владелец читает в тот
    // момент, когда у него что-то не получилось, и согласование здесь —
    // единственное, что отличает объяснение от машинного вывода. Прежний
    // вариант этого теста закреплял именно неграмотную форму.
    await expect(deleteCategory(category.data.id)).rejects.toThrow(
      "В категории ещё 1 товар. Перенесите его в другую категорию или удалите.",
    );
  });

  it("правка категории без обложки не стирает её фото", async () => {
    const category = await createCategory({
      name: `${MARK} категория g`,
      slug: `${MARK}-cat-g`,
      subtitle: null,
      isPublished: true,
    });
    const key = `${MARK}/categories/cover-g.jpg`;
    await setCategoryCover(category.data.id, key);

    // What the form sends: no coverKey at all, because the photograph is the
    // upload route's business. This used to write NULL over it.
    await updateCategory(category.data.id, {
      name: `${MARK} категория g — новое имя`,
      subtitle: "Новый подзаголовок",
      isPublished: false,
    });

    const after = await prisma.category.findUniqueOrThrow({
      where: { id: category.data.id },
      select: { coverKey: true, name: true },
    });
    expect(after.name).toBe(`${MARK} категория g — новое имя`);
    expect(after.coverKey).toBe(key);

    // An explicit null is still a removal.
    await updateCategory(category.data.id, {
      name: `${MARK} категория g`,
      subtitle: null,
      coverKey: null,
      isPublished: true,
    });
    const cleared = await prisma.category.findUniqueOrThrow({
      where: { id: category.data.id },
      select: { coverKey: true },
    });
    expect(cleared.coverKey).toBeNull();
  });

  it("второй аромат с тем же именем в другом регистре не создаётся", async () => {
    const { brand } = await fixture("h");

    // The fixture's fragrance is «Аромат h»; «аромат H» is the same scent
    // typed in a hurry, and the refusal names the spelling that exists.
    await expect(
      createFragrance({
        brandId: brand.data.id,
        name: "аромат H",
        slug: `${MARK}-fra-h2`,
        aliases: [],
        gender: "UNISEX",
        families: [],
        notesTop: [],
        notesHeart: [],
        notesBase: [],
        description: null,
      }),
    ).rejects.toThrow(`У бренда ${MARK} Бренд h уже есть аромат «Аромат h»`);
  });
});

describe.skipIf(!reachable)("остаток товара", () => {
  const stateOf = (id: string) =>
    prisma.product.findUniqueOrThrow({
      where: { id },
      select: { stock: true, stockQty: true },
    });

  it("число задаёт статус, и запрошенное слово при нём не учитывается", async () => {
    // The word asked for is «нет», the count is a hundred: the count wins.
    const { product } = await fixture("s1", {
      stock: "OUT",
      stockQty: 100,
      packSize: 10,
    });
    expect(await stateOf(product.data.id)).toEqual({
      stock: "IN_STOCK",
      stockQty: 100,
    });
  });

  it("правка остатка пересчитывает статус: нуль — нет, до трёх упаковок — мало", async () => {
    const { product } = await fixture("s2", { stockQty: 100, packSize: 10 });
    const id = product.data.id;

    const edited = await setProductStockQty(id, 30);
    expect(await stateOf(id)).toEqual({ stock: "LOW", stockQty: 30 });
    // The listing and the page of this product are dirtied, or the old count
    // stays on the shelf for an hour.
    expect(edited.tags).toContain(`product:${product.data.slug}`);

    await setProductStockQty(id, 0);
    expect(await stateOf(id)).toEqual({ stock: "OUT", stockQty: 0 });

    await setProductStockQty(id, 500);
    expect(await stateOf(id)).toEqual({ stock: "IN_STOCK", stockQty: 500 });
  });

  it("пустой остаток перестаёт вести учёт и оставляет статус как был", async () => {
    const { product } = await fixture("s3", { stockQty: 30, packSize: 10 });
    const id = product.data.id;
    expect(await stateOf(id)).toEqual({ stock: "LOW", stockQty: 30 });

    await setProductStockQty(id, null);
    expect(await stateOf(id)).toEqual({ stock: "LOW", stockQty: null });
  });

  it.each([-1, 1.5, 1_000_001])(
    "остаток %s отклоняется понятным отказом",
    async (qty) => {
      const { product } = await fixture(`s4-${String(qty).replace(/\W/g, "")}`);
      await expect(setProductStockQty(product.data.id, qty)).rejects.toBeInstanceOf(
        CatalogConflict,
      );
    },
  );

  it("смена кратности пересчитывает «мало»: оно считается упаковками", async () => {
    const { product, category, fragrance } = await fixture("s5", {
      stockQty: 100,
      packSize: 10,
    });
    expect((await stateOf(product.data.id)).stock).toBe("IN_STOCK");

    await updateProduct(product.data.id, {
      categoryId: category.data.id,
      fragranceIds: [fragrance.data.id],
      sku: `${MARK}-s5`,
      volumeMl: 100,
      priceKop: 100_000,
      oldPriceKop: null,
      // Fifty to a pack: a hundred is now two packs, which is «мало».
      packSize: 50,
      stock: "IN_STOCK",
      stockQty: 100,
      status: "PUBLISHED",
      isNew: false,
      isHit: false,
      popularity: 0,
    });
    expect(await stateOf(product.data.id)).toEqual({ stock: "LOW", stockQty: 100 });
  });

  it("слово, выбранное вручную: у посчитанного «нет» — это нуль, остальное снимает учёт", async () => {
    const counted = (await fixture("s6a", { stockQty: 100 })).product.data.id;
    const out = (await fixture("s6b", { stockQty: 100 })).product.data.id;
    const plain = (await fixture("s6c", { stock: "LOW" })).product.data.id;

    await setProductStock(counted, "IN_STOCK");
    expect(await stateOf(counted)).toEqual({ stock: "IN_STOCK", stockQty: null });

    await setProductStock(out, "OUT");
    expect(await stateOf(out)).toEqual({ stock: "OUT", stockQty: 0 });

    // Not counted stays not counted.
    await setProductStock(plain, "PREORDER");
    expect(await stateOf(plain)).toEqual({ stock: "PREORDER", stockQty: null });
  });

  it("массовое слово не трогает посчитанные товары, а «нет» обнуляет их", async () => {
    const a = (await fixture("s7a", { stockQty: 100 })).product.data.id;
    const b = (await fixture("s7b", { stockQty: 100 })).product.data.id;
    const c = (await fixture("s7c", { stock: "OUT" })).product.data.id;

    // Only the uncounted one changes, and the count says how many that was —
    // the screen turns it into «изменено 1 из 3».
    const marked = await bulkUpdateProducts([a, b, c], {
      kind: "stock",
      stock: "IN_STOCK",
    });
    expect(marked.data).toBe(1);
    expect(await stateOf(a)).toEqual({ stock: "IN_STOCK", stockQty: 100 });
    expect(await stateOf(c)).toEqual({ stock: "IN_STOCK", stockQty: null });

    const gone = await bulkUpdateProducts([a, b, c], { kind: "stock", stock: "OUT" });
    expect(gone.data).toBe(3);
    expect(await stateOf(a)).toEqual({ stock: "OUT", stockQty: 0 });
    expect(await stateOf(b)).toEqual({ stock: "OUT", stockQty: 0 });
    expect(await stateOf(c)).toEqual({ stock: "OUT", stockQty: null });
  });

  it("копия в другом формате не берёт остаток: он посчитан для другого флакона", async () => {
    const { product, category } = await fixture("s8", { stockQty: 100 });
    const copy = await copyToFormat(product.data.id, {
      categoryId: category.data.id,
      sku: `${MARK}-s8-copy`,
      volumeMl: 35,
      priceKop: 50_000,
      packSize: 1,
    });
    expect(await stateOf(copy.data.id)).toEqual({ stock: "IN_STOCK", stockQty: null });
  });

  describe("загрузка прайса", () => {
    const row = (suffix: string, over: Record<string, unknown> = {}) => ({
      row: 2,
      sku: `${MARK}-${suffix}`,
      brand: `${MARK} Бренд ${suffix}`,
      fragrance: `Аромат ${suffix}`,
      fragrance2: null,
      category: `${MARK} категория ${suffix}`,
      title: null,
      volumeMl: 100,
      priceKop: 110_000,
      oldPriceKop: null,
      packSize: 1,
      stock: null,
      stockQty: null,
      status: null,
      isNew: false,
      isHit: false,
      gender: null,
      ...over,
    });

    it("файл без остатка не стирает посчитанное в панели", async () => {
      const { product } = await fixture("s9", { stockQty: 100 });
      const id = product.data.id;

      await importProducts([row("s9")]);

      // The price moved, the count did not.
      expect(await stateOf(id)).toEqual({ stock: "IN_STOCK", stockQty: 100 });
      const priced = await prisma.product.findUniqueOrThrow({
        where: { id },
        select: { priceKop: true },
      });
      expect(priced.priceKop).toBe(110_000);
    });

    it("число в файле задаёт остаток и статус, слово — снимает учёт", async () => {
      const { product } = await fixture("s10");
      const id = product.data.id;

      await importProducts([row("s10", { stockQty: 2 })]);
      expect(await stateOf(id)).toEqual({ stock: "LOW", stockQty: 2 });

      await importProducts([row("s10", { stock: "OUT" })]);
      expect(await stateOf(id)).toEqual({ stock: "OUT", stockQty: null });
    });

    it("при смене кратности пустая клетка пересчитывает слово по остатку", async () => {
      const { product } = await fixture("s11", { stockQty: 100, packSize: 10 });
      const id = product.data.id;
      expect((await stateOf(id)).stock).toBe("IN_STOCK");

      // The file says nothing about stock but moves the pack to fifty.
      await importProducts([row("s11", { packSize: 50 })]);
      expect(await stateOf(id)).toEqual({ stock: "LOW", stockQty: 100 });
    });

    it("новый товар из файла получает остаток и вычисленный статус", async () => {
      const { category, brand, fragrance } = await fixture("s12");
      void category;
      void brand;
      void fragrance;
      await importProducts([
        row("s12", {
          sku: `${MARK}-s12-new`,
          stockQty: 500,
          packSize: 12,
        }),
      ]);
      const created = await prisma.product.findUniqueOrThrow({
        where: { sku: `${MARK}-s12-new` },
        select: { stock: true, stockQty: true },
      });
      expect(created).toEqual({ stock: "IN_STOCK", stockQty: 500 });
    });
  });
});
