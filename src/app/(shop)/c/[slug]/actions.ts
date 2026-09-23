"use server";

import { z } from "zod";

import { clientIp } from "@/server/client-ip";
import { rateLimit } from "@/server/rate-limit";

import { FAMILIES, GENDERS, SORT_KEYS } from "@/lib/list-url";
import { listProducts, PAGE_SIZE, type ListResult } from "@/server/catalog/list";

/**
 * The next page of a listing.
 *
 * A Server Action is a public endpoint — it is reachable by anyone who can POST
 * to the page, with any body, whatever the client actually sends. So the
 * arguments are parsed here rather than trusted: the SQL is parameterised and a
 * hostile value could not inject, but it could ask for sixty rows a call, or
 * for a filter list long enough to make the planner work for nothing.
 *
 * `limit` is deliberately not accepted. The page size is ours.
 */
const Params = z.object({
  categorySlug: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
  brandSlugs: z.array(z.string().regex(/^[a-z0-9-]{1,64}$/)).max(32).optional(),
  gender: z.enum(GENDERS).optional(),
  families: z.array(z.enum(FAMILIES)).max(FAMILIES.length).optional(),
  inStockOnly: z.boolean().optional(),
  sort: z.enum(SORT_KEYS).default("popular"),
  // Opaque, and validated again by decodeCursor, which treats anything it did
  // not produce as "start from the beginning" rather than as an error.
  cursor: z.string().max(256).nullish(),
});

/**
 * Generous, because this is the shop.
 *
 * Sixty a minute is far more than a person scrolling and far less than a script
 * can extract. Each call runs a multi-join raw query with a LATERAL subquery
 * per row against a host this project sizes as a small VPS, and until now
 * nothing bounded how often an anonymous caller could ask for one.
 */
const BROWSE_LIMIT = { limit: 60, windowSeconds: 60 } as const;

export async function loadMoreProducts(input: unknown): Promise<ListResult> {
  const ip = await clientIp();
  if (ip) {
    const allowed = await rateLimit(`browse:${ip}`, BROWSE_LIMIT);
    // An empty page, not an error: this is a "load more" the buyer did not ask
    // for by name, and the list simply stops rather than showing a failure.
    if (!allowed.allowed) return { items: [], nextCursor: null, total: 0 };
  }

  const parsed = Params.safeParse(input);
  // Nothing is logged: the argument came from a buyer's session.
  if (!parsed.success) return { items: [], nextCursor: null, total: 0 };

  const p = parsed.data;
  return listProducts({
    categorySlug: p.categorySlug,
    brandSlugs: p.brandSlugs,
    gender: p.gender,
    families: p.families,
    inStockOnly: p.inStockOnly,
    sort: p.sort,
    cursor: p.cursor,
    limit: PAGE_SIZE,
  });
}
