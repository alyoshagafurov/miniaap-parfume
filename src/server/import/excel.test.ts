import { describe, expect, it } from "vitest";

import { matchHeaders } from "./columns";
import { buildExport, buildTemplate, type ExportRow } from "./excel";
import { readTable } from "./read-file";
import { parseRows } from "./rows";

/**
 * The export and the import are two halves of one promise: a file written by
 * the catalog and loaded again changes nothing it was not asked to. These push
 * a file through both, with the real writer and the real reader, because the
 * thing that goes wrong is never either half alone — it is a number the
 * writer stored as text, or a word the reader did not expect back.
 */

const base: ExportRow = {
  sku: "ARM-1001",
  brand: "Chanel",
  fragrance: "Coco Mademoiselle",
  fragrance2: "",
  category: "Парфюм 100 мл",
  volumeMl: 100,
  priceKop: 132_500,
  oldPriceKop: null,
  packSize: 6,
  stock: "IN_STOCK",
  stockQty: null,
  status: "PUBLISHED",
  isNew: false,
  isHit: false,
  gender: "FEMALE",
  title: "",
};

async function roundTrip(rows: ExportRow[]) {
  const file = await buildExport(rows);
  const table = await readTable(file, "каталог.xlsx");
  const header = table[0] ?? [];
  return { table, parsed: parseRows(table, matchHeaders(header)) };
}

describe("export → import", () => {
  it("brings a counted product back as the same count", async () => {
    const { parsed } = await roundTrip([{ ...base, stock: "LOW", stockQty: 18 }]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.stockQty).toBe(18);
    // The word is not written for a counted product, so it cannot disagree.
    expect(parsed.rows[0]?.stock).toBeNull();
  });

  it("writes the count as a number Excel can sum, not as text", async () => {
    const { table } = await roundTrip([{ ...base, stockQty: 240 }]);
    const column = (table[0] ?? []).indexOf("Наличие");
    expect(table[1]?.[column]).toBe("240");
  });

  it("brings an uncounted product back as the same word", async () => {
    const { parsed } = await roundTrip([
      { ...base, stock: "PREORDER", stockQty: null },
    ]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.stock).toBe("PREORDER");
    expect(parsed.rows[0]?.stockQty).toBeNull();
  });

  it("keeps a count of zero, which is «нет» and not «не веду учёт»", async () => {
    const { parsed } = await roundTrip([{ ...base, stock: "OUT", stockQty: 0 }]);
    expect(parsed.rows[0]?.stockQty).toBe(0);
  });
});

describe("the template", () => {
  it("is a file the importer reads without a single complaint", async () => {
    const table = await readTable(await buildTemplate(), "шаблон.xlsx");
    const parsed = parseRows(table, matchHeaders(table[0] ?? []));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    // The example teaches the number: it is what lets the storefront stop a
    // buyer ordering more than there is.
    expect(parsed.rows[0]?.stockQty).toBe(240);
  });
});
