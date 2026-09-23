import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/roles";
import { importProducts } from "@/server/catalog/mutations/import";
import { fromRoute } from "@/server/catalog/revalidate";
import { matchHeaders, COLUMNS, type ImportField } from "@/server/import/columns";
import { readTable } from "@/server/import/read-file";
import { parseRows, type ParsedRow, type RowError } from "@/server/import/rows";

/**
 * Importing a price list.
 *
 * A Route Handler because a Server Action body is capped at 1 MB and a
 * three-hundred-row .xlsx is comfortably past that.
 *
 * Two modes over one endpoint, chosen by a field: `preview` parses and reports,
 * `commit` parses and writes. The file is uploaded again for the commit rather
 * than held server-side between the two — a parked upload is state with a
 * lifetime, an owner, and a way to be replayed, and re-sending three hundred
 * rows costs less than any of that.
 *
 * Invalidation is fromRoute: updateTag throws E872 outside a Server Action.
 */

interface PreviewResponse {
  mode: "preview";
  ok: boolean;
  /** Present when the file cannot be used at all, rather than row by row. */
  fatal?: string;
  missingRequired: string[];
  unknownColumns: string[];
  duplicateColumns: string[];
  total: number;
  errors: RowError[];
  truncatedErrors: boolean;
  /** Enough to see that the columns landed where they were meant to. */
  sample: Array<Pick<ParsedRow, "row" | "sku" | "brand" | "fragrance" | "priceKop" | "volumeMl">>;
}

function label(field: ImportField): string {
  return COLUMNS[field].label;
}

export async function POST(request: Request) {
  try {
    await requirePermission("catalog:write");
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать файл" }, { status: 400 });
  }

  const file = form.get("file");
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
  }

  let table: string[][];
  try {
    table = await readTable(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    // readTable's messages are written for a person: "Файл пустой", "Размер
    // файла слишком велик", "Поддерживаются .xlsx и .csv".
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось прочитать файл" },
      { status: 400 },
    );
  }

  const headerRow = table[0];
  if (!headerRow) {
    return NextResponse.json({ error: "В файле нет строки заголовков" }, { status: 400 });
  }

  const headers = matchHeaders(headerRow);
  if (headers.missingRequired.length > 0) {
    // The one hard failure: without these columns there is nothing to import,
    // and guessing which unnamed column is the article would be worse.
    const response: PreviewResponse = {
      mode: "preview",
      ok: false,
      fatal: `В файле нет обязательных колонок: ${headers.missingRequired.map(label).join(", ")}`,
      missingRequired: headers.missingRequired.map(label),
      unknownColumns: headers.unknown.map((u) => u.header),
      duplicateColumns: headers.duplicates.map((d) => d.header),
      total: 0,
      errors: [],
      truncatedErrors: false,
      sample: [],
    };
    return NextResponse.json(response, { status: 200 });
  }

  const parsed = parseRows(table, headers);

  if (mode === "preview") {
    const response: PreviewResponse = {
      mode: "preview",
      ok: true,
      missingRequired: [],
      unknownColumns: headers.unknown.map((u) => u.header),
      duplicateColumns: headers.duplicates.map((d) => d.header),
      total: parsed.rows.length,
      errors: parsed.errors,
      truncatedErrors: parsed.truncatedErrors,
      sample: parsed.rows.slice(0, 20).map((r) => ({
        row: r.row,
        sku: r.sku,
        brand: r.brand,
        fragrance: r.fragrance,
        priceKop: r.priceKop,
        volumeMl: r.volumeMl,
      })),
    };
    return NextResponse.json(response);
  }

  // The rows that parsed are imported; the ones that did not are reported and
  // left for the owner to fix. Refusing the file over one bad line would mean
  // 299 good rows waiting on a typo.
  const outcome = await fromRoute(importProducts(parsed.rows));

  return NextResponse.json({
    mode: "commit",
    ...outcome,
    // Carried through so the report covers the whole file, not only what the
    // database refused.
    parseErrors: parsed.errors.length,
  });
}
