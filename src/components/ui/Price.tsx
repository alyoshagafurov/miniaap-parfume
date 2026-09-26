import { formatRub } from "@/lib/money";

/**
 * A price.
 *
 * Rendered through formatRub so grouping and the ruble sign are identical
 * everywhere, and never below 16px — this is the number the buyer is here for,
 * read outdoors, on a phone.
 *
 * Amber, because amber means money here and nothing else. There are two of
 * them and `tone` picks by ground, not by taste: the reference's own amber is
 * 2.65:1 on white and would vanish in daylight, so a light ground gets the
 * deeper one (4.6:1 on the canvas, 5.2:1 on a card) and only a dark block gets
 * the bright one (6.3:1). `tokens.test.ts` measures both from the stylesheet.
 *
 * When the client has hidden prices there is no number to show, and the
 * component says so rather than rendering an empty space that looks broken.
 */
export function Price({
  kop,
  oldKop = null,
  showPrices = true,
  tone = "light",
  className = "",
}: {
  kop: number;
  oldKop?: number | null;
  showPrices?: boolean;
  /** The ground this sits on. `dark` only inside a night block. */
  tone?: "light" | "dark" | "ink";
  className?: string;
}) {
  const quiet = tone === "dark" ? "text-on-night-muted" : "text-muted";

  if (!showPrices) {
    return <span className={`${quiet} text-sm ${className}`}>Цена по запросу</span>;
  }

  const figure =
    tone === "dark" ? "text-price-bright" : tone === "ink" ? "text-ink" : "text-price";

  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 ${className}`}>
      <span className={`${figure} font-extrabold tracking-tight tabular-nums`}>
        {formatRub(kop)}
      </span>
      {oldKop !== null && oldKop > kop ? (
        <s className={`${quiet} text-sm font-medium tabular-nums decoration-1`}>
          {formatRub(oldKop)}
        </s>
      ) : null}
    </span>
  );
}
