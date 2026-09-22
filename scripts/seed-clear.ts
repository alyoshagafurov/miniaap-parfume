/**
 * Removes seeded demo data.
 *
 *   pnpm seed:clear              every row the seed created
 *   pnpm seed:clear --bulk-only  only the seed:bulk copies, keeping the 68 demo
 *                                products the storefront is looked at with
 *
 * Only ever touches rows flagged isDemo, so anything a client has entered by
 * hand is safe. Bulk copies are identified by the article suffix the bulk seed
 * appends (ARM-1001-07) and nothing else uses.
 */

import { loadDotEnv } from "../src/lib/env";
import { prisma } from "../src/server/db";

loadDotEnv();

async function main() {
  const bulkOnly = process.argv.includes("--bulk-only");

  if (bulkOnly) {
    // A suffix pattern is not expressible in the Prisma filter API, so this is
    // one of the few places raw SQL is warranted. No user input is involved.
    const removed = await prisma.$executeRaw`
      DELETE FROM products
      WHERE "isDemo" = true AND sku ~ '^ARM-[0-9]+-[0-9]{2}$'
    `;
    console.log(`Удалено копий seed:bulk: ${removed}`);
  } else {
    // Order matters: fragrances and brands are referenced by products.
    const products = await prisma.product.deleteMany({ where: { isDemo: true } });
    const fragrances = await prisma.fragrance.deleteMany({ where: { isDemo: true } });
    const brands = await prisma.brand.deleteMany({ where: { isDemo: true } });
    const categories = await prisma.category.deleteMany({ where: { isDemo: true } });
    console.table({
      товары: products.count,
      ароматы: fragrances.count,
      бренды: brands.count,
      категории: categories.count,
    });
  }

  console.log(`Товаров осталось: ${await prisma.product.count()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
