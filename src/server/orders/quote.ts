import { sumKop } from "@/lib/money";

/**
 * Pricing a request.
 *
 * This is the authority on what a request costs. The Mini App keeps a basket in
 * localStorage and shows a running total, but that total is display only —
 * every submission is repriced here from the catalog, because a price the
 * client sent is a price the client could have edited.
 *
 * Deliberately pure: no database, no Settings lookup, no clock. The caller
 * loads the catalog rows and hands them in, which is what makes every rule
 * below directly testable.
 */

/** Guards the Int kopeck column against an absurd quantity. */
const MAX_QTY_PER_LINE = 9999;

export interface CartLine {
  productId: string;
  qty: number;
}

export interface CatalogEntry {
  id: string;
  sku: string;
  title: string;
  brandName: string;
  /** Rendered format, e.g. "100 мл". Snapshotted onto the order line. */
  format: string;
  priceKop: number;
  packSize: number;
  stock: string;
  status: string;
  imageKey: string | null;
}

export interface QuotedLine extends CatalogEntry {
  productId: string;
  qty: number;
  lineTotalKop: number;
}

export type RemovalReason =
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "BAD_QUANTITY";

export type AdjustmentReason = "PACK_SIZE" | "MAX_QUANTITY";

export interface Quote {
  lines: QuotedLine[];
  subtotalKop: number;
  minOrderKop: number;
  /** How much more is needed to reach the minimum; 0 once it is met. */
  shortfallKop: number;
  meetsMinimum: boolean;
  showPrices: boolean;
  removed: Array<{ productId: string; reason: RemovalReason }>;
  adjusted: Array<{ productId: string; from: number; to: number; reason: AdjustmentReason }>;
}

export interface QuoteSettings {
  minOrderKop: number;
  showPrices: boolean;
}

export function quoteCart(
  cart: readonly CartLine[],
  catalog: Readonly<Record<string, CatalogEntry>>,
  settings: QuoteSettings,
): Quote {
  const removed: Quote["removed"] = [];
  const adjusted: Quote["adjusted"] = [];

  // The same product can arrive twice — added from a category listing and again
  // from its own page. Merge before validating, or the pack-size rounding runs
  // twice and inflates the quantity.
  const merged = new Map<string, number>();
  for (const line of cart) {
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.qty);
  }

  const lines: QuotedLine[] = [];

  for (const [productId, rawQty] of merged) {
    const entry = catalog[productId];
    if (!entry) {
      removed.push({ productId, reason: "NOT_FOUND" });
      continue;
    }
    if (entry.status !== "PUBLISHED") {
      removed.push({ productId, reason: "UNAVAILABLE" });
      continue;
    }
    if (entry.stock === "OUT") {
      removed.push({ productId, reason: "OUT_OF_STOCK" });
      continue;
    }
    if (!Number.isInteger(rawQty) || rawQty <= 0) {
      removed.push({ productId, reason: "BAD_QUANTITY" });
      continue;
    }

    let qty = rawQty;

    // Wholesale is sold by the pack. Rounding up rather than down: the buyer
    // asked for at least this much, and a silently smaller order is worse than
    // a slightly larger one they can see and change.
    const pack = Math.max(1, entry.packSize);
    if (qty % pack !== 0) {
      const rounded = Math.ceil(qty / pack) * pack;
      adjusted.push({ productId, from: qty, to: rounded, reason: "PACK_SIZE" });
      qty = rounded;
    }

    if (qty > MAX_QTY_PER_LINE) {
      const capped = Math.floor(MAX_QTY_PER_LINE / pack) * pack;
      adjusted.push({ productId, from: qty, to: capped, reason: "MAX_QUANTITY" });
      qty = capped;
    }

    lines.push({
      ...entry,
      productId,
      qty,
      lineTotalKop: entry.priceKop * qty,
    });
  }

  // When prices are hidden the request is a request for a quotation, so there
  // is no total to compare and no minimum to fail — otherwise the buyer could
  // never submit anything at all.
  if (!settings.showPrices) {
    return {
      lines,
      subtotalKop: 0,
      minOrderKop: settings.minOrderKop,
      shortfallKop: 0,
      meetsMinimum: true,
      showPrices: false,
      removed,
      adjusted,
    };
  }

  const subtotalKop = sumKop(lines.map((l) => l.lineTotalKop));
  const shortfallKop = Math.max(0, settings.minOrderKop - subtotalKop);

  return {
    lines,
    subtotalKop,
    minOrderKop: settings.minOrderKop,
    shortfallKop,
    // An empty cart never qualifies, however low the minimum is set.
    meetsMinimum: lines.length > 0 && shortfallKop === 0,
    showPrices: true,
    removed,
    adjusted,
  };
}
