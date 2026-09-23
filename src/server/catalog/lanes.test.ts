import { describe, expect, it } from "vitest";

import { cardIdentity, oneCardPerScent } from "./queries";

/**
 * One card per scent.
 *
 * This catalog is organised around one fragrance existing in several formats,
 * and a card prints the brand and the scent and nothing that separates 35 ml
 * from 100 ml. So the lanes, which pick by popularity, filled with the same
 * scent over and over: «Хиты» showed Hermès H24 eight times and the page read
 * as broken. The rule is small; what it prevents is not.
 */

function product(...scents: string[]) {
  return { fragrances: scents.map((slug) => ({ fragrance: { slug } })) };
}

describe("cardIdentity", () => {
  it("is the scent, not the product", () => {
    expect(cardIdentity(product("coco-mademoiselle"))).toBe("coco-mademoiselle");
  });

  it("keeps a twin apart from either of its scents", () => {
    const twin = cardIdentity(product("bleu-de-chanel", "sauvage"));
    expect(twin).not.toBe(cardIdentity(product("bleu-de-chanel")));
    expect(twin).not.toBe(cardIdentity(product("sauvage")));
  });

  it("orders by position, so the two halves of a twin cannot swap", () => {
    // Position ordering comes from the query; this only records that the key
    // respects it rather than sorting the slugs itself. A twin listed the other
    // way round is a different row in the catalog, not the same one.
    expect(cardIdentity(product("a", "b"))).not.toBe(cardIdentity(product("b", "a")));
  });
});

describe("oneCardPerScent", () => {
  it("keeps the first of each scent and drops the rest", () => {
    const kept = oneCardPerScent(
      [product("h24"), product("h24"), product("h24"), product("terre")],
      8,
    );
    expect(kept.map(cardIdentity)).toEqual(["h24", "terre"]);
  });

  it("preserves the order it was given", () => {
    // The order is popularity or publication date, decided by the database.
    // Re-sorting here would quietly overrule it.
    const kept = oneCardPerScent([product("c"), product("a"), product("b")], 8);
    expect(kept.map(cardIdentity)).toEqual(["c", "a", "b"]);
  });

  it("stops at the limit", () => {
    const kept = oneCardPerScent(
      [product("a"), product("b"), product("c"), product("d")],
      2,
    );
    expect(kept).toHaveLength(2);
  });

  it("returns fewer than the limit rather than repeating to fill it", () => {
    // A brand that genuinely carries two scents shows two cards. Padding the
    // row back to eight is what produced the wall of identical cards.
    expect(oneCardPerScent([product("a"), product("a"), product("b")], 8)).toHaveLength(
      2,
    );
  });

  it("survives an empty lane", () => {
    expect(oneCardPerScent([], 8)).toEqual([]);
  });
});
