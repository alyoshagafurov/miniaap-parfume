/**
 * The listing's URL contract.
 *
 * The address bar is the single source of truth for what a listing shows: the
 * filter sheet writes it, the page reads it, and a buyer who sends a link sends
 * what they were actually looking at. So both halves of that round trip belong
 * in one file — a writer and a reader that disagree produce a screen whose
 * controls do not match its contents, and nothing about that is visible in a
 * type.
 *
 * Client-safe on purpose. src/server/catalog/list.ts imports Prisma and the
 * database client; a client component importing SORT_LABELS from there would
 * drag both into the browser bundle.
 */

export const SORT_KEYS = ["popular", "new", "price_asc", "price_desc", "alpha"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

// Written as a literal tuple rather than derived from the labels, so the list
// is a type the server action can validate against rather than string[].
export const SORT_LABELS: Record<SortKey, string> = {
  popular: "Популярные",
  new: "Новинки",
  price_asc: "Сначала дешевле",
  price_desc: "Сначала дороже",
  alpha: "А–Я",
};

export const DEFAULT_SORT: SortKey = "popular";

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === "string" && (SORT_KEYS as readonly string[]).includes(value);
}

export const GENDERS = ["FEMALE", "MALE", "UNISEX"] as const;
export type Gender = (typeof GENDERS)[number];

export const FAMILIES = [
  "FLORAL",
  "ORIENTAL",
  "WOODY",
  "FRESH",
  "CITRUS",
  "AQUATIC",
  "FOUGERE",
  "CHYPRE",
  "GOURMAND",
  "SPICY",
  "LEATHER",
  "MUSK",
] as const;
export type Family = (typeof FAMILIES)[number];

export const GENDER_LABELS: Record<string, string> = {
  FEMALE: "Женский",
  MALE: "Мужской",
  UNISEX: "Унисекс",
};

export const FAMILY_LABELS: Record<string, string> = {
  FLORAL: "Цветочные",
  ORIENTAL: "Восточные",
  WOODY: "Древесные",
  FRESH: "Свежие",
  CITRUS: "Цитрусовые",
  AQUATIC: "Водные",
  FOUGERE: "Фужерные",
  CHYPRE: "Шипровые",
  GOURMAND: "Гурманские",
  SPICY: "Пряные",
  LEATHER: "Кожаные",
  MUSK: "Мускусные",
};

export interface ActiveFilters {
  brands: string[];
  gender: Gender | null;
  families: Family[];
  inStockOnly: boolean;
}

export const NO_FILTERS: ActiveFilters = {
  brands: [],
  gender: null,
  families: [],
  inStockOnly: false,
};

export function filterCount(f: ActiveFilters): number {
  return f.brands.length + f.families.length + (f.gender ? 1 : 0) + (f.inStockOnly ? 1 : 0);
}

/** A slug as the catalog produces them; anything else is not ours. */
const SLUG = /^[a-z0-9-]{1,64}$/;

/** More than this many of anything is a hand-edited URL, not a buyer. */
const MAX_LIST = 32;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function csv(value: string | string[] | undefined): string[] {
  const raw = first(value);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_LIST);
}

/**
 * Reads the filters out of a URL.
 *
 * Unknown values are dropped rather than rejected. A searchParams object is
 * whatever the buyer's address bar contains — a stale link, a truncated share,
 * an old bookmark from before a family was renamed — and a 400 on any of those
 * is a worse answer than the unfiltered category.
 */
export function parseListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): ActiveFilters {
  const gender = first(searchParams.gender);
  return {
    brands: csv(searchParams.brand).filter((s) => SLUG.test(s)),
    gender: (GENDERS as readonly string[]).includes(gender ?? "")
      ? (gender as Gender)
      : null,
    families: csv(searchParams.family).filter((f): f is Family =>
      (FAMILIES as readonly string[]).includes(f),
    ),
    inStockOnly: first(searchParams.stock) === "1",
  };
}

export function parseSort(searchParams: Record<string, string | string[] | undefined>): SortKey {
  const raw = first(searchParams.sort);
  return isSortKey(raw) ? raw : DEFAULT_SORT;
}

/**
 * Writes the filters back into a URL.
 *
 * Defaults are omitted rather than spelled out, so an unfiltered category is
 * `/c/zhenskaya` and not `/c/zhenskaya?sort=popular&stock=0` — the plain link
 * is the one people paste.
 *
 * `extra` carries whatever a particular listing owns beyond the shared filters;
 * on the search screen that is `q`, which must survive every filter change.
 */
export function buildListHref(
  basePath: string,
  filters: ActiveFilters,
  sort: SortKey,
  extra?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value);
  }
  if (filters.brands.length) params.set("brand", filters.brands.join(","));
  if (filters.gender) params.set("gender", filters.gender);
  if (filters.families.length) params.set("family", filters.families.join(","));
  if (filters.inStockOnly) params.set("stock", "1");
  if (sort !== DEFAULT_SORT) params.set("sort", sort);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
