/**
 * Import column dictionary.
 *
 * The one file that knows what a client's spreadsheet column might be called.
 * When the real file arrives and its header says "Арт. номер" or "Цена за шт",
 * the fix is a new string in the list below — not a change to the parser.
 *
 * Unknown columns are a warning shown in the preview, never an error. A real
 * price list carries columns that mean something to the person who maintains it
 * and nothing to us — supplier, shelf, internal note — and refusing the whole
 * file over one of them would be useless behaviour.
 */

export type ImportField =
  | "sku"
  | "brand"
  | "fragrance"
  | "fragrance2"
  | "category"
  | "title"
  | "volumeMl"
  | "priceKop"
  | "oldPriceKop"
  | "packSize"
  | "stock"
  | "status"
  | "isNew"
  | "isHit"
  | "gender";

interface ColumnDef {
  /** Human name, shown in the preview and in the generated template. */
  label: string;
  required: boolean;
  synonyms: readonly string[];
}

export const COLUMNS: Record<ImportField, ColumnDef> = {
  sku: {
    label: "Артикул",
    required: true,
    // "Арт." and "Арт" fold to the same key, so only one is listed.
    synonyms: ["Артикул", "SKU", "Код", "Арт.", "Код товара", "Артикул товара"],
  },
  brand: {
    label: "Бренд",
    required: true,
    synonyms: ["Бренд", "Марка", "Производитель", "Brand"],
  },
  fragrance: {
    label: "Аромат",
    required: true,
    synonyms: ["Аромат", "Название", "Наименование", "Парфюм", "Fragrance"],
  },
  fragrance2: {
    label: "Второй аромат",
    required: false,
    // Twins: one bottle, two fragrances.
    synonyms: ["Второй аромат", "Аромат 2", "Второй", "Аромат2"],
  },
  category: {
    label: "Категория",
    required: true,
    synonyms: ["Категория", "Раздел", "Группа", "Тип"],
  },
  title: {
    label: "Заголовок",
    required: false,
    synonyms: ["Заголовок", "Полное название", "Название товара"],
  },
  volumeMl: {
    label: "Объём",
    required: true,
    // ё folds to е, so "Объём" covers "Объем" too.
    synonyms: ["Объём", "Мл", "Объём мл", "Размер"],
  },
  priceKop: {
    label: "Цена",
    required: true,
    synonyms: ["Цена", "Опт", "Цена опт", "Оптовая цена", "Цена руб", "Стоимость"],
  },
  oldPriceKop: {
    label: "Старая цена",
    required: false,
    synonyms: [
      "Старая цена",
      "Цена до скидки",
      "Розница",
      "Розничная цена",
      "Old price",
    ],
  },
  packSize: {
    label: "Кратность",
    required: false,
    synonyms: ["Кратность", "Упаковка", "В упаковке", "Кратно", "Минимальная партия"],
  },
  stock: {
    label: "Наличие",
    required: false,
    synonyms: ["Наличие", "Остаток", "В наличии", "Склад", "Остатки"],
  },
  status: {
    label: "Статус",
    required: false,
    synonyms: ["Статус", "Публикация", "Опубликован"],
  },
  isNew: {
    label: "Новинка",
    required: false,
    synonyms: ["Новинка", "Новый", "New"],
  },
  isHit: {
    label: "Хит",
    required: false,
    synonyms: ["Хит", "Хит продаж", "Популярное", "Hit"],
  },
  gender: {
    label: "Пол",
    required: false,
    synonyms: ["Пол", "Для кого", "Gender"],
  },
};

/**
 * Folds a header so that spelling, case, punctuation and the ё/е split do not
 * matter. "Объём (мл)", "объем мл" and "ОБЪЕМ, МЛ" are all one header.
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const LOOKUP: ReadonlyMap<string, ImportField> = new Map(
  Object.entries(COLUMNS).flatMap(([field, def]) =>
    def.synonyms.map((s) => [normalizeHeader(s), field as ImportField] as const),
  ),
);

export interface HeaderMatch {
  /** Column index per recognised field. */
  mapping: Partial<Record<ImportField, number>>;
  /** Required fields the file does not provide — the one hard failure. */
  missingRequired: ImportField[];
  /** Columns we do not recognise. A warning, shown in the preview. */
  unknown: Array<{ index: number; header: string }>;
  /** A second column claiming a field already taken; the first one wins. */
  duplicates: Array<{ index: number; header: string; field: ImportField }>;
}

export function matchHeaders(headers: readonly string[]): HeaderMatch {
  const mapping: Partial<Record<ImportField, number>> = {};
  const unknown: HeaderMatch["unknown"] = [];
  const duplicates: HeaderMatch["duplicates"] = [];

  headers.forEach((raw, index) => {
    const header = (raw ?? "").trim();
    // A trailing empty cell is a spreadsheet artefact, not a column.
    if (header === "") return;

    const field = LOOKUP.get(normalizeHeader(header));
    if (!field) {
      unknown.push({ index, header });
      return;
    }
    if (mapping[field] !== undefined) {
      // Two columns for one field: keep the leftmost, which is what a reader
      // would assume, and say so rather than silently using the last.
      duplicates.push({ index, header, field });
      return;
    }
    mapping[field] = index;
  });

  const missingRequired = (Object.keys(COLUMNS) as ImportField[]).filter(
    (f) => COLUMNS[f].required && mapping[f] === undefined,
  );

  return { mapping, missingRequired, unknown, duplicates };
}
