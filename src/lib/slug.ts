/**
 * Slugs.
 *
 * Slugs are user-visible URLs (/p/chanel-coco-mademoiselle-100ml) and are
 * generated from Russian and Latin names alike, so Cyrillic has to become
 * readable Latin rather than be dropped. The table below is the common web
 * transliteration rather than strict GOST: "Шанель" should read as "shanel",
 * not "shanel'".
 */

const CYRILLIC: Readonly<Record<string, string>> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e",
  ю: "yu", я: "ya",
};

/**
 * Returns a URL-safe slug, or an empty string when nothing survives — the
 * caller decides what to do about that, because a product and a category want
 * different fallbacks.
 */
export function slugify(input: string): string {
  const latin = input
    .toLowerCase()
    // Latin diacritics only; Cyrillic is handled by the table, and й must not
    // be decomposed into и + a mark before it is looked up.
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .split("")
    .map((ch) => (ch in CYRILLIC ? CYRILLIC[ch] : ch))
    .join("");

  return latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/**
 * Appends a numeric suffix until the slug is free. Used when two fragrances of
 * different brands transliterate to the same thing.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (base === "") base = "item";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
