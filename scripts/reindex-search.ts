/**
 * Rebuilds every product's stored search text.
 *
 * `searchText` and `searchNotes` are denormalised columns, written when a
 * product, fragrance or brand changes. That works while the normalisation
 * itself holds still — but the normalisation in src/lib/search.ts is a single
 * source for both the query and the stored column, and the moment it changes,
 * every row written under the old rules stops matching. Nothing fails loudly:
 * searches simply return less, and the catalog looks thin rather than broken.
 *
 * So there has to be a way to rewrite them all, and this is it. Run it after
 * any change to buildSearchText, buildSearchNotes or normalize.
 *
 *   pnpm search:reindex
 *
 * In batches, because the client's catalog is a few thousand rows and one
 * transaction holding all of them would block writes from the panel for as long
 * as it takes.
 */

import { loadDotEnv } from "../src/lib/env";
import { reindexProducts } from "../src/server/catalog/mutations/search-text";
import { prisma } from "../src/server/db";

loadDotEnv();

const BATCH = 200;

async function main(): Promise<void> {
  const ids = (
    await prisma.product.findMany({ select: { id: true }, orderBy: { sku: "asc" } })
  ).map((p) => p.id);

  if (ids.length === 0) {
    console.log("\n  В каталоге нет товаров — переиндексировать нечего.\n");
    return;
  }

  console.log(`\n  Товаров: ${ids.length}. Переиндексация партиями по ${BATCH}…\n`);

  let done = 0;
  for (let from = 0; from < ids.length; from += BATCH) {
    const batch = ids.slice(from, from + BATCH);
    done += await prisma.$transaction((tx) => reindexProducts(tx, batch));
    console.log(`  … ${done} / ${ids.length}`);
  }

  console.log(`\n  Готово: ${done} товаров.\n`);
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
