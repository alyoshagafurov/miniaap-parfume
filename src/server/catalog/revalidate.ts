import { revalidateTag, updateTag } from "next/cache";

import type { Mutation } from "@/server/catalog/mutations/run";

/**
 * Applying what a mutation dirtied.
 *
 * The boundary between a catalog write and the cache. Kept apart from
 * src/server/catalog/mutations/** because this file imports Next and those must
 * not: the bot and the scripts call mutations, and a Next cache call in a
 * process with no request context throws on sight.
 *
 * Two entry points because Next has two functions and they are not
 * interchangeable. `updateTag` expires immediately and gives read-your-own-
 * writes, which is what an administrator saving a form needs — but it checks
 * the work store and throws E872 when the caller is a Route Handler.
 * `revalidateTag(tag, "max")` works anywhere and expires on the profile rather
 * than at once. Upload and import are Route Handlers, because a Server Action
 * body is capped at 1 MB; everything else is an action.
 *
 * Both take the mutation's promise rather than its tags, so the tags cannot be
 * applied before the transaction has committed — there is no way to call these
 * with an un-awaited write.
 */

export async function fromAction<T>(mutation: Promise<Mutation<T>>): Promise<T> {
  const { data, tags } = await mutation;
  for (const tag of tags) updateTag(tag);
  return data;
}

export async function fromRoute<T>(mutation: Promise<Mutation<T>>): Promise<T> {
  const { data, tags } = await mutation;
  // "max" rather than the deprecated one-argument form, which warns and will
  // stop working.
  for (const tag of tags) revalidateTag(tag, "max");
  return data;
}
