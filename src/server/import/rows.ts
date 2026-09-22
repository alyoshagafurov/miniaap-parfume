import { parsePriceToKop } from "@/lib/money";

import type { HeaderMatch, ImportField } from "./columns";

/**
 * Turning spreadsheet rows into candidate products.
 *
 * Two rules shape everything here.
 *
 * One bad row must not fail the file. An administrator importing 300 lines has
 * a typo somewhere; the useful behaviour is to import the 299 and show them
 * which line to fix, not to refuse all of it.
 *
 * Row numbers are the ones printed down the side of their spreadsheet. The
 * header is row 1, so the first product is row 2. An error that says "row 0"
 * costs the person a minute of counting, every time.
 */

/** Beyond this the preview is unreadable and the file is simply the wrong one. */
const MAX_ERRORS = 200;

export interface ParsedRow {
  row: number;
  sku: string;
  brand: string;
  fragrance: string;
  fragrance2: string | null;
  category: string;
  title: string | null;
  volumeMl: number;
  priceKop: number;
  oldPriceKop: number | null;
  packSize: number;
  stock: "IN_STOCK" | "LOW" | "OUT" | "PREORDER";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | null;
  isNew: boolean;
  isHit: boolean;
  gender: "FEMALE" | "MALE" | "UNISEX" | null;
}

export interface RowError {
  row: number;
  field: ImportField | "row";
  message: string;
  /** What was actually in the cell, so the preview can show it back. */
  value?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  truncatedErrors: boolean;
}

/** The words a Russian price list actually uses for availability. */
export const STOCK_WORDS: Record<string, ParsedRow["stock"]> = {
  "в наличии": "IN_STOCK",
  наличие: "IN_STOCK",
  есть: "IN_STOCK",
  да: "IN_STOCK",
  "+": "IN_STOCK",
  мало: "LOW",
  заканчивается: "LOW",
  нет: "OUT",
  "-": "OUT",
  отсутствует: "OUT",
  "под заказ": "PREORDER",
  предзаказ: "PREORDER",
};

const STATUS_WORDS: Record<string, NonNullable<ParsedRow["status"]>> = {
  опубликован: "PUBLISHED",
  публиковать: "PUBLISHED",
  да: "PUBLISHED",
  черновик: "DRAFT",
  нет: "DRAFT",
  архив: "ARCHIVED",
};

const GENDER_WORDS: Record<string, NonNullable<ParsedRow["gender"]>> = {
  женский: "FEMALE",
  ж: "FEMALE",
  women: "FEMALE",
  мужской: "MALE",
  м: "MALE",
  men: "MALE",
  унисекс: "UNISEX",
  unisex: "UNISEX",
};

const fold = (v: string) => v.trim().toLowerCase().replace(/ё/g, "е");

const TRUTHY = new Set(["да", "1", "true", "+", "yes", "x"]);

export function parseRows(
  table: readonly string[][],
  headers: HeaderMatch,
): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  let truncatedErrors = false;
  const seenSku = new Map<string, number>();

  const fail = (
    row: number,
    field: RowError["field"],
    message: string,
    value?: string,
  ) => {
    if (errors.length >= MAX_ERRORS) {
      truncatedErrors = true;
      return;
    }
    errors.push(
      value === undefined ? { row, field, message } : { row, field, message, value },
    );
  };

  // Index 0 is the header row.
  for (let i = 1; i < table.length; i++) {
    const rowNumber = i + 1;
    const raw = table[i] ?? [];

    const cell = (field: ImportField): string => {
      const index = headers.mapping[field];
      if (index === undefined) return "";
      return (raw[index] ?? "").toString().trim();
    };

    // A spreadsheet's trailing empty rows are not data and not errors.
    if (raw.every((c) => (c ?? "").toString().trim() === "")) continue;

    const sku = cell("sku");
    const brand = cell("brand");
    const fragrance = cell("fragrance");
    const category = cell("category");

    let ok = true;
    const require = (value: string, field: ImportField, label: string) => {
      if (value === "") {
        fail(rowNumber, field, `${label} не заполнен`);
        ok = false;
      }
    };
    require(sku, "sku", "Артикул");
    require(brand, "brand", "Бренд");
    require(fragrance, "fragrance", "Аромат");
    require(category, "category", "Категория");

    if (sku !== "") {
      const previous = seenSku.get(sku.toLowerCase());
      if (previous !== undefined) {
        fail(
          rowNumber,
          "sku",
          `Дубликат артикула — уже встречался в строке ${previous}`,
          sku,
        );
        ok = false;
      } else {
        seenSku.set(sku.toLowerCase(), rowNumber);
      }
    }

    const volumeRaw = cell("volumeMl");
    const volumeMl = Number.parseInt(volumeRaw.replace(/[^\d]/g, ""), 10);
    if (volumeRaw === "") {
      fail(rowNumber, "volumeMl", "Объём не заполнен");
      ok = false;
    } else if (!Number.isFinite(volumeMl) || volumeMl <= 0) {
      fail(
        rowNumber,
        "volumeMl",
        "Объём должен быть целым числом больше нуля",
        volumeRaw,
      );
      ok = false;
    }

    const priceRaw = cell("priceKop");
    let priceKop = 0;
    if (priceRaw === "") {
      fail(rowNumber, "priceKop", "Цена не заполнена");
      ok = false;
    } else {
      try {
        priceKop = parsePriceToKop(priceRaw);
      } catch {
        fail(rowNumber, "priceKop", "Не похоже на цену", priceRaw);
        ok = false;
      }
    }

    const oldRaw = cell("oldPriceKop");
    let oldPriceKop: number | null = null;
    if (oldRaw !== "") {
      try {
        oldPriceKop = parsePriceToKop(oldRaw);
        if (oldPriceKop <= priceKop) {
          // A struck-through price below the real one reads as a mistake,
          // because it is one.
          fail(
            rowNumber,
            "oldPriceKop",
            "Старая цена должна быть больше текущей",
            oldRaw,
          );
          ok = false;
        }
      } catch {
        fail(rowNumber, "oldPriceKop", "Не похоже на цену", oldRaw);
        ok = false;
      }
    }

    const packRaw = cell("packSize");
    let packSize = 1;
    if (packRaw !== "") {
      packSize = Number.parseInt(packRaw.replace(/[^\d]/g, ""), 10);
      if (!Number.isFinite(packSize) || packSize < 1) {
        fail(rowNumber, "packSize", "Кратность должна быть целым числом от 1", packRaw);
        ok = false;
      }
    }

    const stockRaw = cell("stock");
    let stock: ParsedRow["stock"] = "IN_STOCK";
    if (stockRaw !== "") {
      const found = STOCK_WORDS[fold(stockRaw)];
      if (!found) {
        // Guessing here would silently publish something as available.
        fail(rowNumber, "stock", "Непонятное значение наличия", stockRaw);
        ok = false;
      } else {
        stock = found;
      }
    }

    const statusRaw = cell("status");
    let status: ParsedRow["status"] = null;
    if (statusRaw !== "") {
      status = STATUS_WORDS[fold(statusRaw)] ?? null;
      if (status === null) {
        fail(rowNumber, "status", "Непонятный статус", statusRaw);
        ok = false;
      }
    }

    const genderRaw = cell("gender");
    let gender: ParsedRow["gender"] = null;
    if (genderRaw !== "") {
      gender = GENDER_WORDS[fold(genderRaw)] ?? null;
      if (gender === null) {
        fail(rowNumber, "gender", "Непонятное значение пола", genderRaw);
        ok = false;
      }
    }

    if (!ok) continue;

    const fragrance2 = cell("fragrance2");
    const title = cell("title");

    rows.push({
      row: rowNumber,
      sku,
      brand,
      fragrance,
      fragrance2: fragrance2 === "" ? null : fragrance2,
      category,
      title: title === "" ? null : title,
      volumeMl,
      priceKop,
      oldPriceKop,
      packSize,
      stock,
      status,
      isNew: TRUTHY.has(fold(cell("isNew"))),
      isHit: TRUTHY.has(fold(cell("isHit"))),
      gender,
    });
  }

  return { rows, errors, truncatedErrors };
}
