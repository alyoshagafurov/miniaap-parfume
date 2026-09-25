/**
 * The golden thread.
 *
 * Taken from the braided rule under the wordmark in the logo, and the only
 * repeating divider in this interface. It is decoration: always aria-hidden,
 * and never the sole thing separating two meanings — at 2.14:1 on the canvas it
 * could not carry that weight even if it tried.
 */
export function GoldRule({ className = "" }: { className?: string }) {
  return <hr aria-hidden className={`gold-rule ${className}`} />;
}

/**
 * A section heading: the name, then the rule beneath it.
 *
 * It used to be centred and flanked — "— КАТЕГОРИИ —", spaced caps at 12px
 * between two rules. That reads as a caption for the block below it, and on a
 * 390px screen four of them down one page gave the screen no skeleton at all:
 * every heading weighed the same as the metadata under the cards.
 *
 * Now it is set in the display face at the size of a heading and aligned left,
 * where the eye already is, with a single rule carrying the full width beneath.
 * The rule stays gold and stays decoration — at 2.14:1 it could not be the
 * thing that separates two sections, and now it does not have to be, because
 * the heading does that.
 *
 * Still an h2 and still one per section, so the document outline is unchanged.
 */
export function RuledHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-ink text-2xl leading-tight font-semibold tracking-tight">
        {children}
      </h2>
      <GoldRule />
    </div>
  );
}
