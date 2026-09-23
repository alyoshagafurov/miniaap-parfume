/**
 * The products table's URL contract.
 *
 * Client-safe, like src/lib/list-url.ts and for the same reason: the filter bar
 * and the server query both need this vocabulary, and putting it beside the
 * query would drag Prisma and the permission guards into the browser bundle.
 *
 * Everything the table shows is decided by the address bar — the filter, the
 * sort, the page. Not for elegance: an administrator who has filtered to
 * «без фото», sorted by price and reached page four should be able to open a
 * product, edit it, and come back to exactly that. Browser back is the only
 * mechanism that does this reliably, and it only works if the state is in the
 * URL.
 */

export const PRODUCT_PAGE_SIZE = 50;

export const PRODUCT_SORTS = [
  "updated",
  "sku",
  "title",
  "price_asc",
  "price_desc",
  "stock",
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_SORT_LABELS: Record<ProductSort, string> = {
  updated: "Недавно изменённые",
  sku: "Артикул",
  title: "Название",
  price_asc: "Цена ↑",
  price_desc: "Цена ↓",
  stock: "Наличие",
};

export const DEFAULT_PRODUCT_SORT: ProductSort = "updated";

export const PUBLISH_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type PublishStatusName = (typeof PUBLISH_STATUSES)[number];

export const PUBLISH_STATUS_LABELS: Record<PublishStatusName, string> = {
  DRAFT: "Черновик",
  PUBLISHED: "Опубликован",
  ARCHIVED: "Архив",
};

export const STOCK_STATES = ["IN_STOCK", "LOW", "OUT", "PREORDER"] as const;
export type StockStateName = (typeof STOCK_STATES)[number];

export const STOCK_LABELS: Record<StockStateName, string> = {
  IN_STOCK: "В наличии",
  LOW: "Мало",
  OUT: "Нет",
  PREORDER: "Под заказ",
};

export interface ProductQuery {
  q: string;
  categorySlug: string | null;
  brandSlug: string | null;
  status: PublishStatusName | null;
  stock: StockStateName | null;
  /** Only products with no photograph — the list the owner works through. */
  noPhoto: boolean;
  sort: ProductSort;
  /** 1-based, because it is in a URL a person reads. */
  page: number;
}

export const EMPTY_PRODUCT_QUERY: ProductQuery = {
  q: "",
  categorySlug: null,
  brandSlug: null,
  status: null,
  stock: null,
  noPhoto: false,
  sort: DEFAULT_PRODUCT_SORT,
  page: 1,
};

const SLUG = /^[a-z0-9-]{1,64}$/;
const MAX_QUERY = 100;
/** Deep enough for any real catalog; past this it is a hand-edited URL. */
const MAX_PAGE = 2000;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | null {
  return value !== undefined && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/**
 * Reads the table's state out of a URL.
 *
 * Unknown values are dropped rather than rejected. A stale bookmark from before
 * a category was renamed should show the unfiltered table, not a 400.
 */
export function parseProductQuery(
  searchParams: Record<string, string | string[] | undefined>,
): ProductQuery {
  const slug = (key: string) => {
    const value = first(searchParams[key]);
    return value && SLUG.test(value) ? value : null;
  };
  const page = Number.parseInt(first(searchParams.page) ?? "1", 10);

  return {
    q: (first(searchParams.q) ?? "").slice(0, MAX_QUERY).trim(),
    categorySlug: slug("category"),
    brandSlug: slug("brand"),
    status: oneOf(first(searchParams.status), PUBLISH_STATUSES),
    stock: oneOf(first(searchParams.stock), STOCK_STATES),
    noPhoto: first(searchParams.photo) === "none",
    sort: oneOf(first(searchParams.sort), PRODUCT_SORTS) ?? DEFAULT_PRODUCT_SORT,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/**
 * Writes it back.
 *
 * Defaults are omitted, so the unfiltered table is `/admin/products` and not a
 * line of empty parameters. Page 1 is omitted for the same reason, which also
 * means changing a filter and landing on page 1 produces the plain URL rather
 * than one that says `page=1`.
 */
export function buildProductHref(query: Partial<ProductQuery>): string {
  const q = { ...EMPTY_PRODUCT_QUERY, ...query };
  const params = new URLSearchParams();
  if (q.q) params.set("q", q.q);
  if (q.categorySlug) params.set("category", q.categorySlug);
  if (q.brandSlug) params.set("brand", q.brandSlug);
  if (q.status) params.set("status", q.status);
  if (q.stock) params.set("stock", q.stock);
  if (q.noPhoto) params.set("photo", "none");
  if (q.sort !== DEFAULT_PRODUCT_SORT) params.set("sort", q.sort);
  if (q.page > 1) params.set("page", String(q.page));
  const search = params.toString();
  return search ? `/admin/products?${search}` : "/admin/products";
}

export function activeFilterCount(query: ProductQuery): number {
  return (
    (query.q ? 1 : 0) +
    (query.categorySlug ? 1 : 0) +
    (query.brandSlug ? 1 : 0) +
    (query.status ? 1 : 0) +
    (query.stock ? 1 : 0) +
    (query.noPhoto ? 1 : 0)
  );
}
