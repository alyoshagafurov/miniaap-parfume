import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db";

import { matchFragrances, searchWords } from "./product-form";

/**
 * The product form's fragrance search.
 *
 * The words themselves are checked without a database. The match is checked
 * against the development one and skipped without it, like the mutations
 * suite: what is being asserted is SQL — ILIKE over unnested arrays — and a
 * mock of that would only repeat the query back to itself.
 */

describe("searchWords", () => {
  it("делит запрос на слова и превращает каждое в шаблон", () => {
    expect(searchWords("  Chanel   Chance ")).toEqual(["%Chanel%", "%Chance%"]);
  });

  it("пустой запрос — ни одного слова, а не шаблон на всё", () => {
    expect(searchWords("")).toEqual([]);
    expect(searchWords("   ")).toEqual([]);
  });

  it("экранирует знаки LIKE, чтобы они искались как есть", () => {
    // «AR_1» must not match «AR-1»: an unescaped underscore is any character.
    expect(searchWords("AR_1 50% a\\b")).toEqual(["%AR\\_1%", "%50\\%%", "%a\\\\b%"]);
  });

  it("берёт не больше шести слов", () => {
    expect(searchWords("a b c d e f g h")).toHaveLength(6);
  });
});

const reachable = Boolean(process.env.DATABASE_URL);

// A prefix nothing else uses, so the cleanup cannot touch the seed.
const MARK = "zz-picker-test";

async function removeFixtures() {
  if (!reachable) return;
  await prisma.fragrance.deleteMany({ where: { slug: { startsWith: MARK } } });
  await prisma.brand.deleteMany({ where: { slug: { startsWith: MARK } } });
}

beforeAll(removeFixtures);
afterAll(removeFixtures);

describe.skipIf(!reachable)("matchFragrances — поиск в форме товара", () => {
  it("находит по бренду и названию вместе, по алиасам в любом регистре", async () => {
    const brand = await prisma.brand.create({
      data: {
        name: "Zzpicker Maison",
        slug: `${MARK}-brand`,
        // Stored as typed, capitalised — the case the old `has` never matched.
        aliases: ["Зздом"],
      },
      select: { id: true },
    });
    await prisma.fragrance.create({
      data: {
        brandId: brand.id,
        name: "Zzpicker Bloom",
        slug: `${MARK}-bloom`,
        aliases: ["Зз Цветок Ночи"],
      },
    });
    await prisma.fragrance.create({
      data: {
        brandId: brand.id,
        name: "Zzpicker Wood",
        slug: `${MARK}-wood`,
      },
    });

    // Brand and name in one query: the whole-string match found nothing.
    const both = await matchFragrances("zzpicker maison bloom");
    expect(both.map((f) => f.name)).toEqual(["Zzpicker Bloom"]);
    expect(both[0]?.brandName).toBe("Zzpicker Maison");

    // The brand's alias in lower case, with a word from the fragrance's
    // multi-word alias: neither is equal to a stored element.
    const aliases = await matchFragrances("зздом цветок");
    expect(aliases.map((f) => f.name)).toEqual(["Zzpicker Bloom"]);

    // Every word must match somewhere; one that matches nothing empties it.
    expect(await matchFragrances("zzpicker нетакого")).toEqual([]);

    // One word finds everything it is in, brand first then name.
    const all = await matchFragrances("zzpicker");
    expect(all.map((f) => f.name)).toEqual(["Zzpicker Bloom", "Zzpicker Wood"]);
  });
});
