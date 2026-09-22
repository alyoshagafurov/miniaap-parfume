import { formatRub } from "@/lib/money";

/**
 * A price.
 *
 * Rendered through formatRub so grouping and the ruble sign are identical
 * everywhere, and never below 16px — this is the number the buyer is here for,
 * read outdoors, on a phone.
 *
 * When the client has hidden prices there is no number to show, and the
 * component says so rather than rendering an empty space that looks broken.
 */
export function Price({
  kop,
  oldKop = null,
  showPrices = true,
  className = "",
}: {
  kop: number;
  oldKop?: number | null;
  showPrices?: boolean;
  className?: string;
}) {
  if (!showPrices) {
    return <span className={`text-muted text-sm ${className}`}>Цена по запросу</span>;
  }

  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span className="text-ink font-semibold tabular-nums">{formatRub(kop)}</span>
      {oldKop !== null && oldKop > kop ? (
        <s className="text-muted text-sm tabular-nums decoration-1">{formatRub(oldKop)}</s>
      ) : null}
    </span>
  );
}
