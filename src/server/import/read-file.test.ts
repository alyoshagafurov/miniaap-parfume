import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";

import { detectDelimiter, readTable } from "./read-file";

const ROWS = [
  ["Артикул", "Бренд", "Цена"],
  ["ARM-1001", "Chanel", "1500"],
  ["ARM-1002", "Dior", "1700"],
];

async function xlsxBuffer(): Promise<Buffer> {
  // write-excel-file returns { toBuffer, toStream, toFile } — the same call the
  // import template download will use.
  const out = writeXlsxFile(ROWS.map((r) => r.map((value) => ({ type: String, value }))));
  return out.toBuffer();
}

describe("detectDelimiter", () => {
  it.each([
    ["Артикул;Бренд;Цена", ";"],
    ["Артикул,Бренд,Цена", ","],
    ["Артикул\tБренд\tЦена", "\t"],
  ])("reads %j as %j", (line, expected) => {
    expect(detectDelimiter(line)).toBe(expected);
  });

  it("prefers the semicolon a Russian Excel writes, even with commas inside cells", () => {
    // Russian Excel uses ; because , is the decimal separator — so a line can
    // legitimately hold more commas than semicolons and still be ;-delimited.
    expect(detectDelimiter("Артикул;Цена;Комментарий;1500,50;да,нет,может")).toBe(";");
  });

  it("falls back to a comma for a single-column file", () => {
    expect(detectDelimiter("Артикул")).toBe(",");
  });
});

describe("readTable", () => {
  it("reads .xlsx", async () => {
    const table = await readTable(await xlsxBuffer(), "прайс.xlsx");
    expect(table[0]).toEqual(["Артикул", "Бренд", "Цена"]);
    expect(table[1]?.[0]).toBe("ARM-1001");
    expect(table).toHaveLength(3);
  });

  it("reads UTF-8 .csv", async () => {
    const csv = Buffer.from(ROWS.map((r) => r.join(";")).join("\n"), "utf8");
    const table = await readTable(csv, "прайс.csv");
    expect(table[0]).toEqual(["Артикул", "Бренд", "Цена"]);
  });

  it("reads UTF-8 .csv with a BOM, which Excel adds", async () => {
    const csv = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(ROWS.map((r) => r.join(";")).join("\r\n"), "utf8"),
    ]);
    const table = await readTable(csv, "прайс.csv");
    // The BOM must not end up glued to the first header, or it never matches
    // the dictionary.
    expect(table[0]?.[0]).toBe("Артикул");
  });

  it("reads Windows-1251 .csv, which is what a Russian Excel export produces", async () => {
    const csv = iconv.encode(ROWS.map((r) => r.join(";")).join("\r\n"), "win1251");
    const table = await readTable(csv, "прайс.csv");
    expect(table[0]).toEqual(["Артикул", "Бренд", "Цена"]);
  });

  it("reads a comma-delimited .csv too", async () => {
    const csv = Buffer.from(ROWS.map((r) => r.join(",")).join("\n"), "utf8");
    expect((await readTable(csv, "p.csv"))[0]).toEqual(["Артикул", "Бренд", "Цена"]);
  });

  it("keeps quoted cells containing the delimiter intact", async () => {
    const csv = Buffer.from('Артикул;Комментарий\nARM-1;"красный; большой"', "utf8");
    const table = await readTable(csv, "p.csv");
    expect(table[1]?.[1]).toBe("красный; большой");
  });

  it.each(["прайс.txt", "прайс.pdf", "прайс", "прайс.xls"])(
    "refuses %j rather than guessing",
    async (name) => {
      await expect(readTable(Buffer.from("x"), name)).rejects.toThrow(/xlsx|csv/i);
    },
  );

  it("refuses a file too large to be a price list", async () => {
    const huge = Buffer.alloc(11 * 1024 * 1024);
    await expect(readTable(huge, "p.csv")).rejects.toThrow(/размер|велик/i);
  });

  it("refuses an empty file with a message, not a crash", async () => {
    await expect(readTable(Buffer.alloc(0), "p.csv")).rejects.toThrow(/пуст/i);
  });

  it("is case-insensitive about the extension", async () => {
    const csv = Buffer.from("Артикул;Цена\nARM-1;10", "utf8");
    expect((await readTable(csv, "ПРАЙС.CSV"))[0]?.[0]).toBe("Артикул");
  });
});

describe("readTable — бюджет распаковки", () => {
  it("отказывает .xlsx, который распаковывается за пределы бюджета", async () => {
    // A zip whose central directory declares a gigabyte. MAX_BYTES measures the
    // compressed size, which is the one number a bomb does not care about.
    const { zipSync } = await import("fflate");
    const payload = new Uint8Array(1024);
    const archive = zipSync({ "xl/sharedStrings.xml": payload });

    // Rewrite the declared uncompressed size in the local and central headers.
    const forged = Buffer.from(archive);
    for (let i = 0; i < forged.length - 4; i++) {
      if (forged.readUInt32LE(i) === 0x04034b50) forged.writeUInt32LE(0xffffffff, i + 22);
      if (forged.readUInt32LE(i) === 0x02014b50) forged.writeUInt32LE(0xffffffff, i + 24);
    }

    await expect(readTable(forged, "bomb.xlsx")).rejects.toThrow(/распаковыва|повреждён/);
  });

  it("пропускает обычный .xlsx", async () => {
    const writeXlsx = (await import("write-excel-file/node")).default;
    const buffer = await writeXlsx(
      [
        [{ value: "Артикул", type: String }, { value: "Бренд", type: String }],
        [{ value: "ARM-1", type: String }, { value: "Chanel", type: String }],
      ],
      { sheet: "Товары" },
    ).toBuffer();

    const table = await readTable(buffer, "price.xlsx");
    expect(table[0]).toEqual(["Артикул", "Бренд"]);
    expect(table[1]).toEqual(["ARM-1", "Chanel"]);
  });
});
