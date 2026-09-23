import { normalizeSearch } from "@/lib/search";

/**
 * Marking the part of a result that the buyer typed.
 *
 * Deliberately word-level, not substring-level. The catalog's search matches on
 * a normalised haystack — diacritics folded, punctuation turned to spaces, ё
 * folded to е — which is a different string from the one on screen and a
 * different length. Mapping a position in the one back to a position in the
 * other means carrying an index table through every fold, and an index table
 * that drifts by one silently highlights the wrong letters on every card.
 *
 * So this walks the displayed string word by word, normalises each word with
 * the same function the search uses, and marks the whole word. "мад" marks
 * «Mademoiselle» entirely rather than its first three letters, which is both
 * easier to read at 390 and impossible to get subtly wrong.
 *
 * A match the buyer cannot see the reason for — a typo corrected by trigram
 * similarity, a hit on a Cyrillic alias of a Latin brand — marks nothing. That
 * is the honest answer: there is no substring of the displayed text to point
 * at, and inventing one would be a lie about why the row is there.
 */

export interface HighlightPart {
  text: string;
  match: boolean;
}

/** Below this, a token matches too much to be worth marking. */
const MIN_PREFIX = 2;

export function highlightParts(text: string, query: string): HighlightPart[] {
  const tokens = normalizeSearch(query).split(" ").filter(Boolean);
  if (tokens.length === 0 || text === "") return [{ text, match: false }];

  const parts: HighlightPart[] = [];
  // Word runs and the gaps between them, with their offsets in the original —
  // so the text is reassembled exactly, spacing and punctuation included.
  const words = /[\p{L}\p{N}]+/gu;
  let cursor = 0;

  for (const m of text.matchAll(words)) {
    const start = m.index;
    const word = m[0];
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false });

    const folded = normalizeSearch(word);
    const hit = tokens.some(
      (t) => folded === t || (t.length >= MIN_PREFIX && folded.startsWith(t)),
    );
    parts.push({ text: word, match: hit });
    cursor = start + word.length;
  }

  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });

  return merge(parts);
}

/**
 * Joins neighbouring runs of the same kind, and bridges the gap between two
 * marked words when the gap is only punctuation or space.
 *
 * Without the bridge, "coco mademoiselle" produces two marks with an unmarked
 * space between them, which at 390 reads as two separate hits rather than as
 * the phrase the buyer typed.
 */
function merge(parts: readonly HighlightPart[]): HighlightPart[] {
  const out: HighlightPart[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const last = out[out.length - 1];
    const bridges =
      last?.match === true &&
      !part.match &&
      parts[i + 1]?.match === true &&
      !/[\p{L}\p{N}]/u.test(part.text);

    if (last && (last.match === part.match || bridges)) {
      last.text += part.text;
      continue;
    }
    out.push({ ...part });
  }

  return out;
}
