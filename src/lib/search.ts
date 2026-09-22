/**
 * Search normalisation.
 *
 * This is the single source of truth for what "the same string" means in this
 * catalog. The value it produces is what gets written into products.searchText
 * and products.searchNotes, and it is what every query is run through before it
 * touches the database — so if this function and the stored column ever
 * disagree, search silently stops working. That is why normalisation lives here
 * in one tested place rather than half here and half in SQL.
 */

/**
 * Folds a string to its searchable form:
 *   - lower case
 *   - ё → е, because buyers type both and mean one
 *   - Latin diacritics removed (Chloé → chloe, Hermès → hermes)
 *   - Cyrillic left composed, because й is its own letter
 *   - punctuation becomes a space, not nothing
 *   - whitespace collapsed
 *
 * The Cyrillic caveat is the subtle one. NFD decomposes й into и + U+0306, so
 * the usual "normalize('NFD').replace(/\p{M}/gu, '')" trick turns "Майский"
 * into "маискии" and quietly breaks every match for it. The mark strip below is
 * therefore anchored to a Latin base character.
 */
export function normalizeSearch(input: string): string {
  return (
    input
      .toLowerCase()
      // Before decomposition: ё is a fold we want, unlike й.
      .replace(/ё/g, "е")
      .normalize("NFD")
      // Strip combining marks only where the base letter is Latin.
      .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
      .normalize("NFC")
      // Anything that is not a letter or digit separates words. Replacing with
      // a space rather than deleting keeps "coco-mademoiselle" findable as
      // "coco mademoiselle".
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ")
  );
}

export interface SearchTextParts {
  brandName: string;
  brandAliases: readonly string[];
  /** One name for a normal product, two for a twin. */
  fragranceNames: readonly string[];
  fragranceAliases: readonly string[];
  title: string;
}

/**
 * Builds the ranked haystack for a product.
 *
 * Tokens are de-duplicated. pg_trgm scores similarity over the whole string, so
 * a brand whose name also appears in its aliases and its title would otherwise
 * outrank a better match purely by repetition.
 *
 * The article number is deliberately NOT here. Every SKU in a catalog shares a
 * prefix, so including them made any article-shaped query trigram-match the
 * entire catalog — searching "ARM-1005" reported 1360 results. Articles are
 * matched exactly, by normalizeSku, which is what someone typing one wants.
 */
export function buildSearchText(parts: SearchTextParts): string {
  const source = [
    parts.brandName,
    ...parts.brandAliases,
    ...parts.fragranceNames,
    ...parts.fragranceAliases,
    parts.title,
  ].join(" ");

  return dedupeTokens(normalizeSearch(source));
}

/**
 * Folds an article number to its comparable form, so that "ARM-1005",
 * "arm 1005" and "arm1005" are the same article. Separators carry no meaning
 * in an article number, unlike in a fragrance name.
 */
export function normalizeSku(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The recall-only half: notes and description. Never used for ranking. */
export function buildSearchNotes(parts: {
  notesTop: readonly string[];
  notesHeart: readonly string[];
  notesBase: readonly string[];
  description?: string | null;
}): string {
  const source = [
    ...parts.notesTop,
    ...parts.notesHeart,
    ...parts.notesBase,
    parts.description ?? "",
  ].join(" ");

  return dedupeTokens(normalizeSearch(source));
}

function dedupeTokens(normalized: string): string {
  if (normalized === "") return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of normalized.split(" ")) {
    if (!seen.has(token)) {
      seen.add(token);
      out.push(token);
    }
  }
  return out.join(" ");
}
