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
