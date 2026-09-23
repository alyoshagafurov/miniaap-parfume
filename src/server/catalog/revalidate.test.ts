import { beforeEach, describe, expect, it, vi } from "vitest";

const updated: string[] = [];
const revalidated: Array<[string, string]> = [];

vi.mock("next/cache", () => ({
  updateTag: (tag: string) => {
    updated.push(tag);
  },
  revalidateTag: (tag: string, profile: string) => {
    revalidated.push([tag, profile]);
  },
}));

const { fromAction, fromRoute } = await import("./revalidate");

/**
 * The ordering invariant, stated as a test.
 *
 * A mutation's promise resolving IS its transaction committing, so "tags are
 * applied after the commit" reduces to "tags are applied after the promise
 * resolves" — and a rejected promise has none to apply. The cases below are the
 * two halves of that: a rollback must leave the cache alone, because the rows a
 * reader would cache have not changed.
 */
describe("fromAction", () => {
  beforeEach(() => {
    updated.length = 0;
    revalidated.length = 0;
  });

  it("applies every tag the mutation returned, and returns its data", async () => {
    const result = await fromAction(
      Promise.resolve({ data: { id: "p1" }, tags: ["catalog", "product:coco"] }),
    );
    expect(result).toEqual({ id: "p1" });
    expect(updated).toEqual(["catalog", "product:coco"]);
  });

  it("applies nothing when the transaction rolled back", async () => {
    await expect(fromAction(Promise.reject(new Error("откат")))).rejects.toThrow("откат");
    expect(updated).toEqual([]);
  });

  it("applies nothing when a mutation reports it dirtied nothing", async () => {
    await fromAction(Promise.resolve({ data: null, tags: [] }));
    expect(updated).toEqual([]);
  });

  it("does not apply tags before the mutation settles", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = fromAction(
      gate.then(() => ({ data: null, tags: ["catalog"] })),
    );

    // The mutation has not committed yet; nothing may be invalidated, or a
    // request arriving now would re-cache the old rows for another hour.
    await Promise.resolve();
    expect(updated).toEqual([]);

    release?.();
    await pending;
    expect(updated).toEqual(["catalog"]);
  });
});

describe("fromRoute", () => {
  beforeEach(() => {
    updated.length = 0;
    revalidated.length = 0;
  });

  it("uses revalidateTag with a profile, because updateTag throws in a route", async () => {
    await fromRoute(Promise.resolve({ data: null, tags: ["catalog", "settings"] }));
    expect(revalidated).toEqual([
      ["catalog", "max"],
      ["settings", "max"],
    ]);
    expect(updated).toEqual([]);
  });

  it("applies nothing when the transaction rolled back", async () => {
    await expect(fromRoute(Promise.reject(new Error("откат")))).rejects.toThrow("откат");
    expect(revalidated).toEqual([]);
  });
});
