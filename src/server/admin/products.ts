import type { Prisma } from "@prisma/client";

import { normalizeSearch, normalizeSku } from "@/lib/search";
import {
  PRODUCT_PAGE_SIZE,
  type ProductQuery,
  type PublishStatusName,
  type StockStateName,
} from "@/lib/admin-products";
import { requireAdminPage } from "@/server/auth/roles";
import { prisma } from "@/server/db";

/**
 * The products table.
 *
 * Everything happens on the server: the filter, the sort, the search and the
 * page. A catalog of 1 360 products is a megabyte of JSON, and the client would
 * be downloading all of it to show fifty rows — on a phone, on a market floor.
 * So the browser gets one page and the address bar carries the question.
 *
 * Deliberately not cached. This is the administrator's working view of rows
 * they are editing; a fifty-row page that is an hour old would show the edit
 * they just made as not having happened.
 */

export interface AdminProductRow {
  id: string;
  sku: string;
  title: string;
  slug: string;
  volumeMl: number;
  priceKop: number;
  oldPriceKop: number | null;
  packSize: number;
  stock: StockStateName;
  status: PublishStatusName;
  isNew: boolean;
  isHit: boolean;
  categoryName: string;
  brandName: string;
  imageKey: string | null;
  imageCount: number;
  updatedAt: Date;
}

export interface AdminProductPage {
  rows: AdminProductRow[];
  total: number;
  page: number;
  pageCount: number;
}

function where(query: ProductQuery): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];

  if (query.categorySlug) and.push({ category: { slug: query.categorySlug } });
  if (query.brandSlug) {
    and.push({
      fragrances: { some: { fragrance: { brand: { slug: query.brandSlug } } } },
    });
  }
  if (query.status) and.push({ status: query.status });
  if (query.stock) and.push({ stock: query.stock });
  if (query.noPhoto) and.push({ images: { none: {} } });

  if (query.q) {
    // The same normalised haystack the storefront searches, plus the article,
    // which the storefront deliberately keeps out of it — here an administrator
    // typing a partial article means exactly that and nothing else.
    const normalized = normalizeSearch(query.q);
    const sku = normalizeSku(query.q);
    const or: Prisma.ProductWhereInput[] = [];
    if (normalized) or.push({ searchText: { contains: normalized } });
    if (sku) or.push({ sku: { contains: query.q.trim(), mode: "insensitive" } });
    // A query that normalises to nothing — punctuation only — must not widen
    // the result set to everything.
    and.push(or.length > 0 ? { OR: or } : { id: "" });
  }

  return and.length > 0 ? { AND: and } : {};
}

function orderBy(sort: ProductQuery["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  // Every ordering ends in a unique column. Without it two rows with the same
  // price can swap between pages, and page two repeats what page one showed.
  switch (sort) {
    case "sku":
      return [{ sku: "asc" }, { id: "asc" }];
    case "title":
      return [{ title: "asc" }, { id: "asc" }];
    case "price_asc":
      return [{ priceKop: "asc" }, { id: "asc" }];
    case "price_desc":
      return [{ priceKop: "desc" }, { id: "asc" }];
    case "stock":
      return [{ stock: "asc" }, { sku: "asc" }, { id: "asc" }];
    case "updated":
    default:
      return [{ updatedAt: "desc" }, { id: "asc" }];
  }
}

export async function listAdminProducts(
  query: ProductQuery,
): Promise<AdminProductPage> {
  await requireAdminPage();

  const filter = where(query);
  const total = await prisma.product.count({ where: filter });
  const pageCount = Math.max(1, Math.ceil(total / PRODUCT_PAGE_SIZE));
  // A filter that shrank the result set leaves the URL pointing past the end;
  // clamping shows the last page rather than an empty one with no explanation.
  const page = Math.min(query.page, pageCount);

  const rows = await prisma.product.findMany({
    where: filter,
    orderBy: orderBy(query.sort),
    skip: (page - 1) * PRODUCT_PAGE_SIZE,
    take: PRODUCT_PAGE_SIZE,
    select: {
      id: true,
      sku: true,
      title: true,
      slug: true,
      volumeMl: true,
      priceKop: true,
      oldPriceKop: true,
      packSize: true,
      stock: true,
      status: true,
      isNew: true,
      isHit: true,
      updatedAt: true,
      category: { select: { name: true } },
      images: { select: { key: true }, orderBy: { sortOrder: "asc" }, take: 1 },
      _count: { select: { images: true } },
      fragrances: {
        where: { position: 0 },
        select: { fragrance: { select: { brand: { select: { name: true } } } } },
        take: 1,
      },
    },
  });

  return {
    rows: rows.map((row) => ({
      id: row.id,
      sku: row.sku,
      title: row.title,
      slug: row.slug,
      volumeMl: row.volumeMl,
      priceKop: row.priceKop,
      oldPriceKop: row.oldPriceKop,
      packSize: row.packSize,
      stock: row.stock,
      status: row.status,
      isNew: row.isNew,
      isHit: row.isHit,
      categoryName: row.category.name,
      brandName: row.fragrances[0]?.fragrance.brand.name ?? "—",
      imageKey: row.images[0]?.key ?? null,
      imageCount: row._count.images,
      updatedAt: row.updatedAt,
    })),
    total,
    page,
    pageCount,
  };
}

/** The filter bar's options, counted so an empty filter is never offered. */
export interface ProductFacets {
  categories: Array<{ slug: string; name: string; count: number }>;
  brands: Array<{ slug: string; name: string }>;
}

export async function getProductFacets(): Promise<ProductFacets> {
  await requireAdminPage();

  const [categories, brands] = await Promise.all([
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      select: { slug: true, name: true, _count: { select: { products: true } } },
    }),
    // Every brand, including the ones with nothing in them yet: in the panel a
    // brand with no products is exactly what someone is about to fix.
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);

  return {
    categories: categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      count: c._count.products,
    })),
    brands,
  };
}
