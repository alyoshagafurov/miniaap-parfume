import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the product form's actions say when they refuse, and what the inline
 * fragrance carries through.
 *
 * No database: every case here is decided before the first query, or with the
 * one query it makes stood in for. The permission guard is stood in for too —
 * it has its own suite, and here it would only demand a session cookie.
 */

vi.mock("@/server/auth/roles", () => ({
  requirePermission: vi.fn(async () => ({})),
}));

const { createFragrance } = vi.hoisted(() => ({
  createFragrance: vi.fn(async (_input: { gender: string }) => ({
    data: { id: "fr1", slug: "brand-name", name: "Name" },
    tags: [] as string[],
  })),
}));
vi.mock("@/server/catalog/mutations/fragrances", () => ({ createFragrance }));

vi.mock("@/server/db", () => ({
  prisma: {
    brand: { findFirst: vi.fn(async () => ({ id: "b1", name: "Chanel" })) },
  },
}));

const { copyProduct, createFragranceInline, saveProduct } = await import("./actions");

const valid = {
  categoryId: "cat1",
  fragranceIds: ["fr1"],
  sku: "AR-101",
  title: null,
  slug: null,
  volumeMl: 35,
  priceKop: 125_000,
  oldPriceKop: null,
  packSize: 1,
  stock: "IN_STOCK",
  status: "DRAFT",
  isNew: false,
  isHit: false,
  popularity: 0,
};

describe("saveProduct — отказ называет поле", () => {
  it("артикул русскими буквами — отказ про артикул, а не «проверьте форму»", async () => {
    // «АР-101» in Cyrillic: indistinguishable on screen from the Latin one.
    const result = await saveProduct({
      id: null,
      product: { ...valid, sku: "АР-101" },
    });
    expect(result).toMatchObject({ ok: false, field: "sku" });
    expect(result.ok ? "" : result.message).toMatch(/^Артикул: только латинские/);
  });

  it("пробел внутри артикула — тоже отказ про артикул", async () => {
    const result = await saveProduct({
      id: null,
      product: { ...valid, sku: "AR 101" },
    });
    expect(result).toMatchObject({ ok: false, field: "sku" });
  });

  it("называет первое неверное поле в порядке формы", async () => {
    const result = await saveProduct({
      id: null,
      product: { ...valid, volumeMl: Number.NaN, packSize: 0 },
    });
    expect(result).toMatchObject({
      ok: false,
      field: "volumeMl",
      message: "Объём — целое число миллилитров больше нуля",
    });
  });

  it("без аромата — понятная фраза, у которой нет поля ввода", async () => {
    const result = await saveProduct({
      id: null,
      product: { ...valid, fragranceIds: [] },
    });
    expect(result).toMatchObject({
      ok: false,
      field: "fragranceIds",
      message: "Выберите один или два аромата",
    });
  });

  it("запрос не той формы — не притворяется ошибкой в поле", async () => {
    const result = await saveProduct({ id: 42, product: valid });
    expect(result).toEqual({ ok: false, message: "Некорректный запрос" });
  });
});

describe("copyProduct — отказ называет поле", () => {
  it("артикул копии проверяется тем же правилом", async () => {
    const result = await copyProduct({
      id: "p1",
      categoryId: "cat1",
      sku: "копия",
      volumeMl: 100,
      priceKop: 300_000,
      packSize: 1,
    });
    expect(result).toMatchObject({ ok: false, field: "sku" });
  });
});

describe("createFragranceInline — пол аромата", () => {
  beforeEach(() => createFragrance.mockClear());

  it("передаёт выбранный пол, а не унисекс", async () => {
    const result = await createFragranceInline({
      brandName: "chanel",
      name: "Bleu",
      gender: "MALE",
    });
    expect(result).toMatchObject({ ok: true, brandName: "Chanel" });
    expect(createFragrance.mock.calls[0]?.[0]).toMatchObject({ gender: "MALE" });
  });

  it("без пола — унисекс, как было", async () => {
    await createFragranceInline({ brandName: "chanel", name: "Chance" });
    expect(createFragrance.mock.calls[0]?.[0]).toMatchObject({ gender: "UNISEX" });
  });

  it("неизвестный пол не проходит", async () => {
    const result = await createFragranceInline({
      brandName: "chanel",
      name: "Chance",
      gender: "ROBOT",
    });
    expect(result.ok).toBe(false);
    expect(createFragrance).not.toHaveBeenCalled();
  });
});
