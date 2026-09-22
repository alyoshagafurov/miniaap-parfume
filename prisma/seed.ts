/**
 * Seeds the demo catalog.
 *
 *   pnpm seed          4 categories, 8 brands, 30 fragrances, ~68 products
 *   pnpm seed:bulk     the same, then multiplied to 1 200+ products for
 *                      measuring search and pagination at realistic scale
 *
 * Idempotent: everything is upserted on its natural key, so running it twice
 * changes nothing and never deletes. Every row is flagged isDemo, so
 * `pnpm seed:clear` can remove exactly what the seed created and nothing a
 * client has entered by hand.
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma, type StockState } from "@prisma/client";

import { loadDotEnv } from "../src/lib/env";
import { buildSearchNotes, buildSearchText } from "../src/lib/search";
import { slugify } from "../src/lib/slug";
import {
  BRANDS,
  CATEGORIES,
  DEODORANT_BASES,
  STOCK_CYCLE,
  TWIN_PAIRS,
} from "./seed-data";

const BULK_FACTOR = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic pseudo-randomness
//
// Prices and stock levels must be stable across runs, or every reseed produces
// a different database and a Playwright assertion about a price becomes flaky.
// The SKU is the seed, so a given article always gets the same numbers.
// ─────────────────────────────────────────────────────────────────────────────

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stable value in [min, max], stepped, derived from the SKU. */
function pick(sku: string, salt: string, min: number, max: number, step = 1): number {
  const n = hash32(`${sku}:${salt}`);
  const range = Math.floor((max - min) / step) + 1;
  return min + (n % range) * step;
}

// ─────────────────────────────────────────────────────────────────────────────

interface PlannedProduct {
  sku: string;
  categorySlug: string;
  title: string;
  volumeMl: number;
  priceKop: number;
  oldPriceKop: number | null;
  packSize: number;
  stock: StockState;
  isNew: boolean;
  isHit: boolean;
  popularity: number;
  /** [brandName, fragranceName] pairs; two entries means a twin. */
  fragrances: Array<readonly [string, string]>;
}

function plan(): PlannedProduct[] {
  const out: PlannedProduct[] = [];
  let n = 1000;

  const flat = BRANDS.flatMap((b) =>
    b.fragrances.map((f) => ({ brand: b.name, fragrance: f.name })),
  );

  // 100 ml — every fragrance.
  for (const { brand, fragrance } of flat) {
    const sku = `ARM-${++n}`;
    out.push(build(sku, "parfyum-100-ml", `${brand} ${fragrance}`, 100, 90_000, 180_000, [[brand, fragrance]]));
  }

  // 35 ml "pencils" — the first two thirds of the range.
  for (const { brand, fragrance } of flat.slice(0, 20)) {
    const sku = `ARM-${++n}`;
    out.push(build(sku, "parfyum-35-ml", `${brand} ${fragrance}`, 35, 35_000, 60_000, [[brand, fragrance]]));
  }

  // Twins — one bottle, two fragrances.
  for (const pair of TWIN_PAIRS) {
    const sku = `ARM-${++n}`;
    const [a, b] = pair;
    const title = a[0] === b[0] ? `${a[0]} ${a[1]} + ${b[1]}` : `${a[0]} ${a[1]} + ${b[0]} ${b[1]}`;
    out.push(build(sku, "dvoynyashki-100-ml", title, 100, 120_000, 200_000, [a, b]));
  }

  // Deodorants.
  for (const { brand, fragrance } of DEODORANT_BASES) {
    const sku = `ARM-${++n}`;
    out.push(build(sku, "dezodoranty-200-ml", `${brand} ${fragrance} дезодорант`, 200, 25_000, 45_000, [[brand, fragrance]]));
  }

  return out;
}

function build(
  sku: string,
  categorySlug: string,
  title: string,
  volumeMl: number,
  priceMin: number,
  priceMax: number,
  fragrances: Array<readonly [string, string]>,
): PlannedProduct {
  const priceKop = pick(sku, "price", priceMin, priceMax, 500);
  // Roughly one product in four carries a struck-through old price.
  const hasOld = pick(sku, "old", 0, 3) === 0;
  return {
    sku,
    categorySlug,
    title,
    volumeMl,
    priceKop,
    oldPriceKop: hasOld ? priceKop + pick(sku, "delta", 5_000, 30_000, 500) : null,
    packSize: [1, 1, 1, 6, 12][pick(sku, "pack", 0, 4)] ?? 1,
    stock: STOCK_CYCLE[pick(sku, "stock", 0, STOCK_CYCLE.length - 1)] ?? "IN_STOCK",
    isNew: pick(sku, "new", 0, 5) === 0,
    isHit: pick(sku, "hit", 0, 3) === 0,
    popularity: pick(sku, "pop", 0, 1000),
    fragrances,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  loadDotEnv();
  const bulk = process.argv.includes("--bulk");
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL не задан — проверьте .env");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // ── Settings ────────────────────────────────────────────────────────────
    // Real client details from the brief. Nothing in the application hardcodes
    // these; every screen and every bot message reads them from here.
    await prisma.settings.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        companyName: "ÁRUMI Parfum & Care",
        address: "Хасавюрт, рынок «Новый Терек»",
        phone: "8 928 314 40 00",
        whatsappPhone: "79283144000",
        minOrderKop: 500_000,
        showPrices: true,
        deliveryTerms:
          "Отправляем по всей России: СДЭК, Почта России, транспортные компании. " +
          "Самовывоз с рынка «Новый Терек» в Хасавюрте. " +
          "Минимальный заказ — 5 000 ₽.",
        botGreeting:
          "ÁRUMI — ваш оптовый партнёр.\n\n" +
          "Известные бренды · Выгодные условия · Надёжные поставки\n\n" +
          "Откройте каталог, соберите заявку — менеджер свяжется с вами и подтвердит заказ.",
      },
    });

    // ── Categories ──────────────────────────────────────────────────────────
    const categoryIds = new Map<string, string>();
    for (const [i, c] of CATEGORIES.entries()) {
      const row = await prisma.category.upsert({
        where: { slug: c.slug },
        update: { name: c.name, subtitle: c.subtitle, sortOrder: i, isDemo: true },
        create: {
          name: c.name,
          subtitle: c.subtitle,
          slug: c.slug,
          sortOrder: i,
          isPublished: true,
          isDemo: true,
        },
      });
      categoryIds.set(c.slug, row.id);
    }

    // ── Brands and fragrances ───────────────────────────────────────────────
    const brandIds = new Map<string, string>();
    const brandAliases = new Map<string, string[]>();
    // keyed "Brand::Fragrance"
    const fragranceIds = new Map<string, string>();
    const fragranceMeta = new Map<string, (typeof BRANDS)[number]["fragrances"][number]>();

    for (const [i, b] of BRANDS.entries()) {
      const brand = await prisma.brand.upsert({
        where: { slug: slugify(b.name) },
        update: { name: b.name, aliases: b.aliases, sortOrder: i, isDemo: true },
        create: {
          name: b.name,
          slug: slugify(b.name),
          aliases: b.aliases,
          sortOrder: i,
          isPublished: true,
          isDemo: true,
        },
      });
      brandIds.set(b.name, brand.id);
      brandAliases.set(b.name, b.aliases);

      for (const f of b.fragrances) {
        // Slugs are globally unique, and two houses can share a fragrance name,
        // so the brand is part of the slug.
        const slug = slugify(`${b.name} ${f.name}`);
        const row = await prisma.fragrance.upsert({
          where: { slug },
          update: {
            name: f.name,
            aliases: f.aliases,
            gender: f.gender,
            families: f.families,
            notesTop: f.notesTop,
            notesHeart: f.notesHeart,
            notesBase: f.notesBase,
            description: f.description,
            isDemo: true,
          },
          create: {
            brandId: brand.id,
            name: f.name,
            slug,
            aliases: f.aliases,
            gender: f.gender,
            families: f.families,
            notesTop: f.notesTop,
            notesHeart: f.notesHeart,
            notesBase: f.notesBase,
            description: f.description,
            isDemo: true,
          },
        });
        fragranceIds.set(`${b.name}::${f.name}`, row.id);
        fragranceMeta.set(`${b.name}::${f.name}`, f);
      }
    }

    // ── Products ────────────────────────────────────────────────────────────
    const planned = plan();
    const copies = bulk ? BULK_FACTOR : 1;
    let written = 0;

    for (let copy = 0; copy < copies; copy++) {
      for (const p of planned) {
        // Bulk copies are distinct articles, not duplicates of one.
        const sku = copy === 0 ? p.sku : `${p.sku}-${String(copy).padStart(2, "0")}`;
        const title = copy === 0 ? p.title : `${p.title} (партия ${copy + 1})`;
        const slug = slugify(`${title} ${p.volumeMl}ml ${sku}`);

        const first = p.fragrances[0];
        if (!first) continue;
        const meta = fragranceMeta.get(`${first[0]}::${first[1]}`);

        const searchText = buildSearchText({
          brandName: first[0],
          brandAliases: brandAliases.get(first[0]) ?? [],
          fragranceNames: p.fragrances.map((f) => f[1]),
          fragranceAliases: p.fragrances.flatMap(
            (f) => fragranceMeta.get(`${f[0]}::${f[1]}`)?.aliases ?? [],
          ),
          title,
        });

        const searchNotes = buildSearchNotes({
          notesTop: meta?.notesTop ?? [],
          notesHeart: meta?.notesHeart ?? [],
          notesBase: meta?.notesBase ?? [],
          description: meta?.description ?? null,
        });

        const categoryId = categoryIds.get(p.categorySlug);
        if (!categoryId) throw new Error(`Категория не найдена: ${p.categorySlug}`);

        const data = {
          categoryId,
          title,
          slug,
          volumeMl: p.volumeMl,
          priceKop: p.priceKop,
          oldPriceKop: p.oldPriceKop,
          packSize: p.packSize,
          stock: p.stock,
          status: "PUBLISHED",
          isNew: p.isNew,
          isHit: p.isHit,
          popularity: p.popularity,
          publishedAt: new Date("2026-01-15T00:00:00Z"),
          searchText,
          searchNotes,
          isDemo: true,
        } satisfies Omit<Prisma.ProductUncheckedCreateInput, "sku">;

        const product = await prisma.product.upsert({
          where: { sku },
          update: data,
          create: { sku, ...data },
        });

        // Replace the fragrance links so a re-seed cannot accumulate them.
        await prisma.productFragrance.deleteMany({ where: { productId: product.id } });
        await prisma.productFragrance.createMany({
          data: p.fragrances.map(([brandName, fragranceName], position) => {
            const fragranceId = fragranceIds.get(`${brandName}::${fragranceName}`);
            if (!fragranceId) throw new Error(`Аромат не найден: ${brandName} ${fragranceName}`);
            return { productId: product.id, fragranceId, position };
          }),
        });

        written++;
      }
      if (bulk && copy % 5 === 0) console.log(`  … партия ${copy + 1}/${copies}`);
    }

    const counts = {
      категории: await prisma.category.count(),
      бренды: await prisma.brand.count(),
      ароматы: await prisma.fragrance.count(),
      товары: await prisma.product.count(),
      "в т.ч. двойняшки": await prisma.product.count({
        where: { fragrances: { some: { position: 1 } } },
      }),
    };
    console.log(`\nЗаписано товаров: ${written}`);
    console.table(counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
