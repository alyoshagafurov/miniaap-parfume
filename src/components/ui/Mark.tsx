import { highlightParts } from "@/lib/highlight";

/**
 * Text with the searched-for part marked.
 *
 * `<mark>` rather than a styled span: it is the element that means "relevant to
 * the user's current activity", and a screen reader can announce it. The
 * project's colour reset means it inherits nothing from the UA, so the wash is
 * stated here.
 *
 * With no query, or with a match that has no visible cause, this renders the
 * text and nothing else — no wrapper, no class.
 */
export function Mark({ text, query }: { text: string; query?: string | undefined }) {
  if (!query) return <>{text}</>;

  const parts = highlightParts(text, query);
  if (!parts.some((p) => p.match)) return <>{text}</>;

  return (
    <>
      {parts.map((part, i) =>
        part.match ? (
          <mark key={i} className="bg-primary-wash text-ink px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
