import writeXlsxFile from "write-excel-file/node";

import { OLIVE_WASH } from "@/lib/tokens";

import { COLUMNS, type ImportField } from "./columns";

/**
 * The spreadsheets this panel hands out.
 *
 * Two of them, and they are deliberately the same shape: the export of the
 * catalog is a valid import file. That is the workflow the owner will actually
 * use — export, edit prices in Excel where editing prices is pleasant, import
 * back — and it only works if the columns round-trip.
 */

/** The order columns appear in, chosen for how a price list is read. */
const ORDER: ImportField[] = [
  "sku",
  "brand",
  "fragrance",
  "fragrance2",
  "category",
  "volumeMl",
  "priceKop",
  "oldPriceKop",
  "packSize",
  "stock",
  "status",
  "isNew",
  "isHit",
  "gender",
  "title",
];

const HEADER = {
  fontWeight: "bold" as const,
  // From the token file, like every other colour in this project: a cell
  // fill is a literal hex inside the .xlsx and cannot be a CSS variable.
  backgroundColor: OLIVE_WASH,
  align: "left" as const,
};

/**
 * An empty file with the right headings and one example row.
 *
 * The example is what makes the template usable without documentation: it shows
 * that availability is written in Russian words, that the pack multiple is a
 * number, and that a twin puts its second scent in its own column. A template
 * of bare headings teaches none of that and produces a file of guesses.
 */
export async function buildTemplate(): Promise<Buffer> {
  const header = ORDER.map((field) => ({
    value: COLUMNS[field].label + (COLUMNS[field].required ? " *" : ""),
    ...HEADER,
  }));

  const example = [
    "ARM-1001",
    "Chanel",
    "Coco Mademoiselle",
    "",
    "Парфюм 100 мл",
    "100",
    "1325",
    "1450",
    "6",
    "в наличии",
    "черновик",
    "да",
    "",
    "женский",
    "",
  ].map((value) => ({ value, type: String }));

  return writeXlsxFile([header, example], {
    // Widths chosen so nothing is a column of ###.
    columns: ORDER.map((field) => ({ width: field === "title" ? 32 : 18 })),
    sheet: "Товары",
  }).toBuffer();
}

export interface ExportRow {
  sku: string;
  brand: string;
  fragrance: string;
  fragrance2: string;
  category: string;
  volumeMl: number;
  priceKop: number;
  oldPriceKop: number | null;
  packSize: number;
  stock: string;
  status: string;
  isNew: boolean;
  isHit: boolean;
  gender: string;
  title: string;
}

const STOCK_OUT: Record<string, string> = {
  IN_STOCK: "в наличии",
  LOW: "мало",
  OUT: "нет",
  PREORDER: "под заказ",
};

const STATUS_OUT: Record<string, string> = {
  DRAFT: "черновик",
  PUBLISHED: "опубликован",
  ARCHIVED: "архив",
};

const GENDER_OUT: Record<string, string> = {
  FEMALE: "женский",
  MALE: "мужской",
  UNISEX: "унисекс",
};

/**
 * The catalog as a spreadsheet.
 *
 * Prices are written as plain numbers of roubles, not as formatted strings:
 * `1325`, not `1 325 ₽`. A formatted price is text to Excel, cannot be summed
 * or sorted, and comes back through the import parser as a value it has to
 * strip a currency sign off. The one place a rouble sign belongs is a screen.
 */
export async function buildExport(rows: readonly ExportRow[]): Promise<Buffer> {
  const header = ORDER.map((field) => ({ value: COLUMNS[field].label, ...HEADER }));

  const body = rows.map((row) => [
    { value: row.sku, type: String },
    { value: row.brand, type: String },
    { value: row.fragrance, type: String },
    { value: row.fragrance2, type: String },
    { value: row.category, type: String },
    { value: row.volumeMl, type: Number },
    { value: row.priceKop / 100, type: Number },
    row.oldPriceKop === null
      ? { value: "", type: String }
      : { value: row.oldPriceKop / 100, type: Number },
    { value: row.packSize, type: Number },
    { value: STOCK_OUT[row.stock] ?? row.stock, type: String },
    { value: STATUS_OUT[row.status] ?? row.status, type: String },
    { value: row.isNew ? "да" : "", type: String },
    { value: row.isHit ? "да" : "", type: String },
    { value: GENDER_OUT[row.gender] ?? row.gender, type: String },
    { value: row.title, type: String },
  ]);

  return writeXlsxFile([header, ...body], {
    columns: ORDER.map((field) => ({ width: field === "title" ? 32 : 18 })),
    sheet: "Каталог",
  }).toBuffer();
}
