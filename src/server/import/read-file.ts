import { parse as parseCsv } from "csv-parse/sync";
import iconv from "iconv-lite";
import { readSheet } from "read-excel-file/node";

/**
 * Reading an uploaded price list.
 *
 * Returns the sheet as plain strings and interprets nothing: prices, volumes
 * and availability words are the row parser's job. Keeping the two apart is
 * what lets that parser be tested without ever producing a file.
 *
 * The awkward part is CSV. A Russian Excel exports Windows-1251 with a
 * semicolon delimiter, because the comma is already the decimal separator; a
 * CSV from Google Sheets is UTF-8 with commas; and Excel likes to add a
 * byte-order mark which, left in place, glues itself to the first header and
 * stops it ever matching the dictionary.
 */

/** A price list larger than this is not a price list. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Picks the delimiter from the header line.
 *
 * Semicolons win ties on purpose. In a Russian file the comma is the decimal
 * separator, so a legitimate `;`-delimited line can hold more commas than
 * semicolons — counting alone would get it backwards.
 */
export function detectDelimiter(line: string): ";" | "," | "\t" {
  const semicolons = (line.match(/;/g) ?? []).length;
  const tabs = (line.match(/\t/g) ?? []).length;
  const commas = (line.match(/,/g) ?? []).length;

  if (semicolons > 0 && semicolons >= tabs) return ";";
  if (tabs > 0 && tabs >= commas) return "\t";
  if (commas > 0) return ",";
  // A single-column file has no delimiter; any choice yields one column.
  return ",";
}

/**
 * Decodes the buffer.
 *
 * UTF-8 is tried strictly first: invalid bytes make the decoder throw, which is
 * a far more reliable signal than guessing from content, and the only other
 * encoding this trade produces is Windows-1251.
 */
function decode(buffer: Buffer): string {
  // Strip the byte-order mark before anything else sees it.
  const body =
    buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
      ? buffer.subarray(3)
      : buffer;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return iconv.decode(Buffer.from(body), "win1251");
  }
}

export async function readTable(buffer: Buffer, filename: string): Promise<string[][]> {
  if (buffer.length === 0) {
    throw new Error("Файл пустой");
  }
  if (buffer.length > MAX_BYTES) {
    throw new Error(
      `Размер файла слишком велик — максимум ${MAX_BYTES / 1024 / 1024} МБ`,
    );
  }

  const extension = filename.toLowerCase().split(".").pop() ?? "";

  if (extension === "xlsx") {
    // readSheet, not the default export: in read-excel-file v9 the default
    // returns an array of SHEETS, so treating its result as rows silently
    // yields nonsense. readSheet returns the rows of one sheet, the first by
    // default — which is where a price list lives.
    const rows = await readSheet(buffer);
    // Cells come back typed; everything downstream wants strings, and an
    // article arriving as a number would lose its leading zeros.
    return rows.map((row) =>
      row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim())),
    );
  }

  if (extension === "csv") {
    const text = decode(buffer);
    const breakAt = text.search(/\r?\n/);
    const firstLine = breakAt === -1 ? text : text.slice(0, breakAt);

    const rows = parseCsv(text, {
      delimiter: detectDelimiter(firstLine),
      // A price list is written by hand, so rows are ragged and blank lines are
      // everywhere. Neither is an error worth refusing the file over.
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    }) as string[][];

    return rows.map((row) => row.map((cell) => (cell ?? "").trim()));
  }

  throw new Error(
    `Неподдерживаемый формат «${extension || filename}» — нужен .xlsx или .csv`,
  );
}
