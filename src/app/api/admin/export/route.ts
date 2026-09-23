import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/roles";
import { prisma } from "@/server/db";
import { buildExport, type ExportRow } from "@/server/import/excel";

/**
 * The catalog as a spreadsheet.
 *
 * The same columns the import reads, so the round trip works: export, edit the
 * prices in Excel where editing prices is pleasant, import back. That is the
 * workflow the owner will actually use, and it only holds if the two files are
 * the same shape.
 *
 * Archived rows are included. An export is a record of the catalog, and
 * something withdrawn last month is exactly what someone looks for in one.
 */
export async function GET() {
  try {
    await requirePermission("catalog:write");
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    orderBy: [{ category: { sortOrder: "asc" } }, { sku: "asc" }],
    select: {
      sku: true,
      title: true,
      volumeMl: true,
      priceKop: true,
      oldPriceKop: true,
      packSize: true,
      stock: true,
      status: true,
      isNew: true,
      isHit: true,
      category: { select: { name: true } },
      fragrances: {
        orderBy: { position: "asc" },
        select: {
          fragrance: {
            select: { name: true, gender: true, brand: { select: { name: true } } },
          },
        },
      },
    },
  });

  const rows: ExportRow[] = products.map((p) => ({
    sku: p.sku,
    brand: p.fragrances[0]?.fragrance.brand.name ?? "",
    fragrance: p.fragrances[0]?.fragrance.name ?? "",
    // Brand-qualified when the twin's two halves come from different houses —
    // "Bleu de Chanel + Dior Sauvage" is a real product, and a bare "Sauvage"
    // in this column reads as another Chanel scent. The import splits the
    // prefix back off.
    fragrance2: secondFragrance(p.fragrances),
    category: p.category.name,
    volumeMl: p.volumeMl,
    priceKop: p.priceKop,
    oldPriceKop: p.oldPriceKop,
    packSize: p.packSize,
    stock: p.stock,
    status: p.status,
    isNew: p.isNew,
    isHit: p.isHit,
    gender: p.fragrances[0]?.fragrance.gender ?? "UNISEX",
    title: p.title,
  }));

  const buffer = await buildExport(rows);
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="arumi-catalog-${today}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}

type FragranceLink = {
  fragrance: { name: string; gender: string; brand: { name: string } };
};

function secondFragrance(links: readonly FragranceLink[]): string {
  const first = links[0]?.fragrance;
  const second = links[1]?.fragrance;
  if (!second) return "";
  return second.brand.name === first?.brand.name
    ? second.name
    : `${second.brand.name} ${second.name}`;
}
