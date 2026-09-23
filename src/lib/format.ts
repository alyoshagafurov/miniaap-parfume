/**
 * Dates, in Russian, on purpose.
 *
 * Hand-rolled for the same reason money is: ICU data changes between Node
 * versions and between a developer's machine and the server, and
 * `Intl.DateTimeFormat` has quietly changed its separators more than once. An
 * order dated differently on two screens is a support call.
 *
 * Everything is rendered in Moscow time, not in the reader's. The warehouse is
 * in Khasavyurt and works to Moscow hours; "заявка от 23 сентября" has to mean
 * the same day to the buyer and to the manager reading it, whichever timezone
 * either of them is in. Russia has had no daylight saving since 2014, so the
 * offset is a constant rather than a lookup.
 */

const MSK_OFFSET_MINUTES = 3 * 60;

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

function mskParts(date: Date) {
  const shifted = new Date(date.getTime() + MSK_OFFSET_MINUTES * 60_000);
  return {
    day: shifted.getUTCDate(),
    month: shifted.getUTCMonth(),
    year: shifted.getUTCFullYear(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "23 сентября 2026" */
export function formatDateRu(date: Date): string {
  const p = mskParts(date);
  return `${p.day} ${MONTHS[p.month] ?? ""} ${p.year}`;
}

/** "23 сентября 2026, 14:32" */
export function formatDateTimeRu(date: Date): string {
  const p = mskParts(date);
  return `${formatDateRu(date)}, ${pad(p.hours)}:${pad(p.minutes)}`;
}

/**
 * How a product is named out loud.
 *
 * The client writes their price list with the brand in the title — «Chanel Coco
 * Mademoiselle», «Dior Sauvage» — so the brand is usually already the first
 * words. Composing an accessible name as brand + title therefore produced
 * «Chanel Chanel Coco Mademoiselle» on every photograph and every placeholder
 * in the catalog: a screen reader said the brand twice, on every card, on every
 * screen.
 *
 * Titles that genuinely lack the brand still need it, so the brand is added
 * only when it is missing. Case-insensitive, because an imported row may say
 * «CHANEL Coco Mademoiselle».
 */
export function productName(brandName: string, title: string): string {
  const name = title.trim();
  const brand = brandName.trim();
  if (!brand) return name;
  const lower = name.toLowerCase();
  const prefix = brand.toLowerCase();
  // Guard the boundary: a brand «Dior» must not swallow a title «Diorama».
  if (lower === prefix) return name;
  if (lower.startsWith(prefix) && !/[\p{L}\p{N}]/u.test(name.charAt(brand.length))) {
    return name;
  }
  return `${brand} ${name}`;
}
