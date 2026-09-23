/**
 * The basket.
 *
 * Deliberately a plain data structure with pure functions, separate from React
 * and from storage, so the parts that are easy to get wrong — merging a product
 * added twice, rounding to a pack — are directly testable.
 *
 * This mirrors the server's pricing; it is never a second source of truth. The
 * server reprices everything from the catalog on submission. What is stored
 * here is what the buyer was *shown*, which is what lets the server detect that
 * the catalog moved underneath them.
 */

export interface CartLine {
  productId: string;
  qty: number;
  /** What the storefront displayed. Sent to the server for staleness detection. */
  seenPriceKop: number;
  seenPackSize: number;
  seenStock: "IN_STOCK" | "LOW" | "OUT" | "PREORDER";
  // Enough to render the basket without a round trip.
  slug: string;
  title: string;
  brandName: string;
  format: string;
  imageKey: string | null;
}

export const CART_STORAGE_KEY = "arumi.cart.v1";

const MAX_QTY = 9999;

/** Rounds up to a whole pack, the same way the server does. */
export function roundToPack(qty: number, packSize: number): number {
  const pack = Math.max(1, Math.floor(packSize) || 1);
  if (qty <= 0) return 0;
  const rounded = Math.ceil(qty / pack) * pack;
  return Math.min(rounded, Math.floor(MAX_QTY / pack) * pack);
}

/**
 * Adds to the basket, or increases what is already there.
 *
 * A product reached from a category listing and again from its own page is one
 * line, not two — and the quantities add before rounding, so adding 4 and 4 of
 * something sold in sixes gives 12, not 6 twice.
 */
export function addLine(lines: readonly CartLine[], line: CartLine): CartLine[] {
  const existing = lines.find((l) => l.productId === line.productId);
  if (!existing) {
    return [...lines, { ...line, qty: roundToPack(line.qty, line.seenPackSize) }];
  }
  return lines.map((l) =>
    l.productId === line.productId
      ? // The freshly seen price wins: it is the newer observation.
        { ...line, qty: roundToPack(l.qty + line.qty, line.seenPackSize) }
      : l,
  );
}

export function setQty(
  lines: readonly CartLine[],
  productId: string,
  qty: number,
): CartLine[] {
  return lines
    .map((l) =>
      l.productId === productId ? { ...l, qty: roundToPack(qty, l.seenPackSize) } : l,
    )
    .filter((l) => l.qty > 0);
}

export function removeLine(lines: readonly CartLine[], productId: string): CartLine[] {
  return lines.filter((l) => l.productId !== productId);
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.qty, 0);
}

/**
 * What the buyer currently sees as the total.
 *
 * Display only. The figure that decides whether a request is accepted is
 * computed on the server from the catalog.
 */
export function cartTotalKop(lines: readonly CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.seenPriceKop * l.qty, 0);
}

/** The shape createOrder expects: identity, quantity, and what was displayed. */
export function toOrderItems(lines: readonly CartLine[]) {
  return lines.map((l) => ({
    productId: l.productId,
    qty: l.qty,
    seenPriceKop: l.seenPriceKop,
    seenPackSize: l.seenPackSize,
    seenStock: l.seenStock,
  }));
}

/**
 * The corrections the server sends back when the catalog has moved.
 *
 * Deliberately narrower than CartLine: the server knows the price, the pack and
 * the availability, and has no business restating the buyer's slug or picture.
 */
export interface CorrectedLine {
  productId: string;
  qty: number;
  seenPriceKop: number;
  seenPackSize: number;
  seenStock: string;
}

/**
 * Accepting the server's corrections.
 *
 * Applied only when the buyer has seen the difference and said yes. What is
 * merged is the numbers; the display fields — title, brand, picture — stay as
 * they are, because they came with the product and did not change.
 *
 * A line the server did not return is gone from the catalog and is dropped.
 * Order is preserved, so the basket does not rearrange itself under a buyer who
 * just agreed to a price.
 */
export function applyCorrections(
  lines: readonly CartLine[],
  corrected: readonly CorrectedLine[],
): CartLine[] {
  const byId = new Map(corrected.map((c) => [c.productId, c]));
  const out: CartLine[] = [];

  for (const line of lines) {
    const fix = byId.get(line.productId);
    if (!fix) continue;
    if (!isStock(fix.seenStock)) continue;
    out.push({
      ...line,
      qty: fix.qty,
      seenPriceKop: fix.seenPriceKop,
      seenPackSize: fix.seenPackSize,
      seenStock: fix.seenStock,
    });
  }

  return out;
}

const STOCK_STATES = ["IN_STOCK", "LOW", "OUT", "PREORDER"] as const;

function isStock(value: string): value is CartLine["seenStock"] {
  return (STOCK_STATES as readonly string[]).includes(value);
}

// ── Storage ──────────────────────────────────────────────────────────────────

interface StoredCart {
  v: 1;
  lines: CartLine[];
}

/**
 * Reads the basket.
 *
 * Every access is guarded: localStorage throws in a private window, when site
 * data is blocked, and inside some in-app browsers. A buyer with storage
 * disabled gets an empty basket that works for the session, not a broken page.
 *
 * Anything that does not parse into the current shape is discarded rather than
 * repaired — a half-understood basket would quietly send wrong quantities.
 */
export function readCart(): CartLine[] {
  try {
    const raw = globalThis.localStorage?.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const stored = parsed as Partial<StoredCart>;
    if (stored.v !== 1 || !Array.isArray(stored.lines)) return [];
    return stored.lines.filter(isCartLine);
  } catch {
    return [];
  }
}

export function writeCart(lines: readonly CartLine[]): void {
  try {
    const payload: StoredCart = { v: 1, lines: [...lines] };
    globalThis.localStorage?.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage blocked. The in-memory basket still works for
    // this session, which is better than refusing to add anything.
  }
}

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const l = value as Partial<CartLine>;
  return (
    typeof l.productId === "string" &&
    l.productId !== "" &&
    typeof l.qty === "number" &&
    Number.isInteger(l.qty) &&
    l.qty > 0 &&
    typeof l.seenPriceKop === "number" &&
    Number.isInteger(l.seenPriceKop) &&
    typeof l.seenPackSize === "number" &&
    l.seenPackSize >= 1 &&
    typeof l.slug === "string" &&
    typeof l.title === "string"
  );
}
