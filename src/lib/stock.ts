/**
 * What «сколько есть» means, in one place.
 *
 * A product carries two things about its availability. `stock` is the word —
 * В наличии, Мало, Нет, Под заказ — which is all the catalog said until the
 * owner asked for counts. `stockQty` is the number, and it is optional: an
 * owner who does not count leaves it empty and keeps setting the word by hand,
 * exactly as before.
 *
 * When there is a number, the word follows from it and is never set
 * separately. Two fields an owner has to keep in agreement would disagree by
 * Friday — a card saying «Мало» over a product with four hundred in the
 * warehouse — so there is one source, the number, and the word is computed
 * from it by the function below, at every place that writes either.
 *
 * Client-safe and pure on purpose: the form, the table, the storefront, the
 * request and the Excel import all read these rules, and a rule copied into
 * each of them is a rule that drifts.
 */

export type StockLevel = "IN_STOCK" | "LOW" | "OUT" | "PREORDER";

/** Ceiling for a typed count — far above any shelf, far below an Int's edge. */
export const MAX_STOCK_QTY = 1_000_000;

/**
 * «Мало» is three packs or fewer.
 *
 * Counted in packs, not units, because wholesale is bought by the pack: for a
 * product sold in twelves, thirty-six bottles is three orders' worth and the
 * point at which a buyer should hurry, while for a product sold singly three
 * bottles is the same point. A threshold in units would call the first one
 * plentiful and the second one scarce for the same stock position.
 */
export const LOW_PACKS = 3;

const pack = (packSize: number) => Math.max(1, Math.floor(packSize) || 1);

/** Whole packs in a count. */
export function packsIn(qty: number, packSize: number): number {
  return Math.floor(Math.max(0, qty) / pack(packSize));
}

/**
 * The word a count stands for.
 *
 * Never PREORDER: a product sold to order has no shelf to count, so an owner
 * who wants it must leave the count empty. That is a rule the form states
 * beside the field, not one it leaves to be discovered.
 */
export function stockLevelFor(
  qty: number,
  packSize: number,
): Exclude<StockLevel, "PREORDER"> {
  if (qty <= 0) return "OUT";
  return packsIn(qty, packSize) <= LOW_PACKS ? "LOW" : "IN_STOCK";
}

/**
 * The status to store, given what was asked for and whether there is a count.
 *
 * With a count the word is derived and `requested` is ignored; without one it
 * is what the owner chose. Every write path goes through this so that none of
 * them can store a word the number contradicts.
 */
export function resolveStock(
  stockQty: number | null,
  packSize: number,
  requested: StockLevel,
): StockLevel {
  return stockQty === null ? requested : stockLevelFor(stockQty, packSize);
}

/**
 * The most a buyer may put in one request line, in whole packs.
 *
 * `Infinity` when nothing limits it: no count was entered, or the product is
 * sold to order — a pre-order is exactly a promise beyond what is on the shelf.
 * Zero when the shelf holds less than one pack, which is a product that cannot
 * be bought today although it is not «нет в наличии»: the buyer is told why
 * rather than shown a stepper that will not move.
 */
export function maxOrderableQty(p: {
  stock: string;
  stockQty: number | null;
  packSize: number;
}): number {
  if (p.stock === "PREORDER" || p.stockQty === null) return Infinity;
  return packsIn(p.stockQty, p.packSize) * pack(p.packSize);
}

/**
 * A count as a person typed it, or as a spreadsheet cell holds it.
 *
 * `null` for empty — no count — and `undefined` for something that is not a
 * count at all, so a caller can tell «не веду учёт» from «опечатка». Accepts
 * the shapes a Russian price list produces: «240», «1 200», non-breaking
 * thousands, a trailing «шт». Rejects decimals, signs and anything above
 * MAX_STOCK_QTY rather than storing a guess: half a bottle is a typo, and a
 * count of a billion is a pasted phone number.
 */
export function parseStockQty(raw: string): number | null | undefined {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/[\s  ]+/g, "")
    .replace(/(шт|штук|pcs)\.?$/, "");
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return undefined;
  const n = Number(text);
  return n <= MAX_STOCK_QTY ? n : undefined;
}

/** A count with its thousands apart, the way prices are written. */
export function formatQty(qty: number): string {
  return String(qty).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export type AvailabilityTone = "plain" | "low" | "out";

export interface Availability {
  /** Null where there is nothing worth saying — an untracked product in stock. */
  text: string | null;
  tone: AvailabilityTone;
}

/**
 * What a buyer is told about a product's availability.
 *
 * Two voices. On a card it is brief — a listing of sixteen products has no room
 * for a sentence each, and a plain «В наличии» on every one of them is noise
 * that hides the three that are not. On the product's own page it says
 * everything: how many, and how many packs that is.
 *
 * «Осталось» rather than «Мало» once there is a number, because the number is
 * the point: «Осталось 24 шт» tells a buyer whether their order of 50 fits,
 * and «Мало» does not.
 *
 * Without a count it says what it always said. An owner who has not entered
 * numbers has not changed a single word on the storefront.
 */
export function describeAvailability(
  p: { stock: string; stockQty: number | null; packSize: number },
  where: "card" | "page",
): Availability {
  if (p.stock === "OUT") return { text: "Нет в наличии", tone: "out" };
  if (p.stock === "PREORDER") return { text: "Под заказ", tone: "plain" };

  if (p.stockQty !== null) {
    const qty = formatQty(p.stockQty);
    if (p.stock === "LOW") return { text: `Осталось ${qty} шт`, tone: "low" };

    const packs = packsIn(p.stockQty, p.packSize);
    const inPacks =
      where === "page" && p.packSize > 1 && packs > 0
        ? ` · ${formatQty(packs)} упак. по ${p.packSize}`
        : "";
    return { text: `В наличии ${qty} шт${inPacks}`, tone: "plain" };
  }

  if (p.stock === "LOW") return { text: "Мало", tone: "low" };
  return { text: where === "page" ? "В наличии" : null, tone: "plain" };
}

/**
 * Why a product that is not «нет в наличии» still cannot be added — or null.
 *
 * The case is a count smaller than one pack: three bottles of something sold
 * in twelves. The stepper has nowhere to go, and a disabled control with no
 * reason beside it reads as broken.
 */
export function unorderableReason(p: {
  stock: string;
  stockQty: number | null;
  packSize: number;
}): string | null {
  if (p.stock === "OUT") return null;
  if (maxOrderableQty(p) > 0) return null;
  return `Осталось ${formatQty(p.stockQty ?? 0)} шт — меньше одной упаковки (${p.packSize} шт). Уточните у менеджера.`;
}
