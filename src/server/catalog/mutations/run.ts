import type { Prisma } from "@prisma/client";

import { prisma } from "@/server/db";

/**
 * How every catalog write is shaped.
 *
 * The storefront caches its reads for an hour and is invalidated by tag. That
 * makes freshness an ordering problem, and ordering problems are the kind that
 * work in testing and fail in production, so it is settled structurally here
 * rather than left to whoever writes the next form.
 *
 * Two rules, both enforced by shape rather than by discipline:
 *
 *   A mutation NEVER invalidates. It returns the tags it dirtied, and the
 *   boundary — a Server Action or a Route Handler — applies them. That is also
 *   why nothing in this directory imports `next/*`: these functions have to be
 *   callable from the bot process and from scripts, which have no request
 *   context and would throw on the first Next cache call.
 *
 *   Tags are applied strictly AFTER the transaction commits. Applying them
 *   before is the subtle version of the bug: another request, arriving in the
 *   window between the invalidation and the commit, re-reads the OLD rows and
 *   caches them again — for another hour, with nothing in any log. Here the
 *   commit is the resolution of the promise, so "after" is not a convention
 *   that can be got wrong. A rollback rejects, and a rejected promise carries
 *   no tags to apply.
 */

export type Tx = Prisma.TransactionClient;

export interface Mutation<T> {
  data: T;
  /** Deduplicated; an empty array is a legitimate answer. */
  tags: string[];
}

/**
 * Collects tags without repeating them.
 *
 * A bulk publish of two hundred products touches CATALOG_TAG two hundred times
 * and each product tag once; invalidating the same tag repeatedly is not wrong,
 * only wasteful, and the waste is per-write in a loop.
 */
export class Tags {
  private readonly set = new Set<string>();

  add(...tags: readonly string[]): this {
    for (const tag of tags) this.set.add(tag);
    return this;
  }

  addAll(tags: Iterable<string>): this {
    for (const tag of tags) this.set.add(tag);
    return this;
  }

  get list(): string[] {
    return [...this.set];
  }
}

/**
 * A transaction whose result carries its tags.
 *
 * Prisma's default interactive-transaction budget is 2 s to acquire and 5 s to
 * run. That is right for a form and wrong for an import of three hundred rows,
 * so the budget is a parameter — but a generous default would hide a mutation
 * that holds locks far longer than it should.
 */
export async function inTransaction<T>(
  work: (tx: Tx) => Promise<Mutation<T>>,
  options: { timeoutMs?: number; maxWaitMs?: number } = {},
): Promise<Mutation<T>> {
  return prisma.$transaction(work, {
    timeout: options.timeoutMs ?? 10_000,
    maxWait: options.maxWaitMs ?? 5_000,
  });
}

/**
 * A refusal an administrator can act on.
 *
 * Distinct from a constraint violation on purpose: "У бренда ещё 12 ароматов"
 * tells someone what to do next, and `Foreign key constraint failed on the
 * field: fragrances_brandId_fkey` does not. Every mutation that can refuse for
 * a reason a person could have foreseen throws this, and the boundary prints
 * its message; anything else stays an error.
 */
export class CatalogConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogConflict";
  }
}
