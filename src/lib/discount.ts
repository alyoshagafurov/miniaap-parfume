/**
 * The volume discount, in one place.
 *
 * A request of more than 10 000 ₽ is 3% cheaper, and of more than 30 000 ₽ 5%.
 * The server decides — the figure on the request is the one it computes — but
 * the basket shows it before the buyer sends anything, and a rule written
 * twice is a rule that disagrees with itself. So this is client-safe and pure,
 * and the quote, the basket and the tests all read it.
 *
 * «Более» is taken literally: exactly 10 000 ₽ is not more than 10 000 ₽. The
 * threshold is compared with the sum of the lines before the discount, never
 * with the sum after it — otherwise a 3% cut could drop a request back under
 * the line that earned it.
 */

export interface DiscountTier {
  /** The request must be worth MORE than this, in kopecks. */
  overKop: number;
  percent: number;
}

/** Highest first. */
export const DISCOUNT_TIERS: readonly DiscountTier[] = [
  { overKop: 3_000_000, percent: 5 },
  { overKop: 1_000_000, percent: 3 },
];

export interface Discount {
  percent: number;
  /** What comes off, in whole kopecks. */
  discountKop: number;
}

export function discountFor(subtotalKop: number): Discount {
  const tier = DISCOUNT_TIERS.find((t) => subtotalKop > t.overKop);
  if (!tier) return { percent: 0, discountKop: 0 };
  // Rounded to a kopeck: a fraction of one cannot be paid, and the same rounding
  // on both ends keeps the basket and the request equal to the kopeck.
  return {
    percent: tier.percent,
    discountKop: Math.round((subtotalKop * tier.percent) / 100),
  };
}

/** What is payable after the discount. */
export function afterDiscount(subtotalKop: number): number {
  return subtotalKop - discountFor(subtotalKop).discountKop;
}

export interface NextDiscount {
  percent: number;
  /** How much more the request must be worth to earn it, in kopecks. */
  moreKop: number;
}

/**
 * The next step up from where the basket is, or null at the top.
 *
 * `moreKop` is the smallest whole kopeck that gets over the line, since the
 * line itself does not count.
 */
export function nextDiscount(subtotalKop: number): NextDiscount | null {
  const ascending = [...DISCOUNT_TIERS].reverse();
  const tier = ascending.find((t) => subtotalKop <= t.overKop);
  if (!tier) return null;
  return { percent: tier.percent, moreKop: tier.overKop + 1 - subtotalKop };
}
