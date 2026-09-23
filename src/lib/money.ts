/**
 * Money.
 *
 * Every amount in this system is an integer number of kopecks. Rubles exist
 * only at the edges — what a human types into an import file, and what is
 * rendered on screen. Nothing in between is ever a float, because a wholesale
 * request of 300 lines rounded per line is a request that does not add up.
 */

/**
 * Amounts are stored in Int columns. Anything at or beyond this would be
 * silently truncated by PostgreSQL, so it is rejected in the application
 * instead — 21 474 836 ₽ is far above any plausible request from this trade,
 * so hitting it means something is wrong, not that the ceiling is too low.
 */
export const MAX_KOP = 2_147_483_647;

/** Rubles → kopecks. Rounds; never truncates. */
export function rubToKop(rub: number): number {
  if (!Number.isFinite(rub)) {
    throw new TypeError(`Сумма должна быть конечным числом, получено: ${rub}`);
  }
  // (rub * 100) alone is unsafe: 19.99 * 100 === 1998.9999999999998.
  // Rounding the scaled value is what makes it exact.
  return Math.round(rub * 100);
}

/** Kopecks → rubles. For display and for handing to Intl only. */
export function kopToRub(kop: number): number {
  assertKop(kop);
  return kop / 100;
}

function assertKop(kop: number): void {
  if (!Number.isInteger(kop)) {
    throw new TypeError(`Копейки должны быть целым числом, получено: ${kop}`);
  }
  if (kop > MAX_KOP) {
    throw new RangeError(`Переполнение суммы: ${kop} превышает ${MAX_KOP}`);
  }
}

/**
 * Renders an amount as Russian currency.
 *
 * Grouping is done by hand rather than through Intl.NumberFormat. ICU has
 * changed which space it emits between digit groups (U+0020, U+00A0, U+202F
 * across versions), which would mean this machine and the production VPS could
 * render prices differently and Playwright assertions would pass locally and
 * fail in CI. A non-breaking space throughout also stops a price from ever
 * wrapping between its digits and the ₽.
 */
export function formatRub(kop: number): string {
  assertKop(kop);

  const negative = kop < 0;
  const abs = Math.abs(kop);
  const rubles = Math.floor(abs / 100);
  const kopecks = abs % 100;

  const grouped = String(rubles).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = kopecks === 0 ? "" : `,${String(kopecks).padStart(2, "0")}`;

  return `${negative ? "−" : ""}${grouped}${fraction} ₽`;
}

/**
 * Parses a price as a human typed it into a spreadsheet cell.
 *
 * Accepts the shapes a Russian Excel file actually produces — comma decimals,
 * space or non-breaking-space thousands, a trailing ₽ or "руб" — and rejects
 * everything else loudly. The import preview reports the rejection against its
 * row number rather than quietly storing a zero.
 */
export function parsePriceToKop(input: string): number {
  const cleaned = input
    .replace(/[\s  ]/g, "")
    .replace(/₽|руб\.?|rub\.?|r\.?$/gi, "")
    .trim();

  if (cleaned === "") {
    throw new SyntaxError("Пустая цена");
  }
  // One optional decimal separator, at most two digits after it. Three
  // decimals is not a rounding problem to solve silently — it is a wrong cell.
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(cleaned)) {
    throw new SyntaxError(`Не похоже на цену: ${JSON.stringify(input)}`);
  }

  const [whole, fraction = ""] = cleaned.split(/[.,]/) as [string, string?];
  const kop = Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2) || 0);

  assertKop(kop);
  return kop;
}

/** Adds line totals, refusing to produce a value the column cannot hold. */
export function sumKop(amounts: readonly number[]): number {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isInteger(amount)) {
      throw new TypeError(`Копейки должны быть целым числом, получено: ${amount}`);
    }
    total += amount;
    if (total > MAX_KOP) {
      throw new RangeError(`Переполнение суммы: итог превышает ${MAX_KOP}`);
    }
  }
  return total;
}

/**
 * Kopecks as an administrator types them into a roubles field.
 *
 * The inverse of parsePriceToKop, and beside it on purpose: a form that reads
 * with one and writes with the other must round-trip, and two functions in two
 * files drift. A whole number has no decimals — «1250», not «1250,00» — because
 * that is what somebody would have typed.
 */
export function kopToField(kop: number | null): string {
  if (kop === null) return "";
  const rub = kopToRub(kop);
  return Number.isInteger(rub) ? String(rub) : String(rub).replace(".", ",");
}
