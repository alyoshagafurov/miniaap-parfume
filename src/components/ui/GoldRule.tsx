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
 * A section heading flanked by the rule: "— Категории —".
 *
 * Two solid rules rather than one fading line, because the direction bans
 * gradients and the logo's own flourish is solid.
 */
export function RuledHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <GoldRule className="flex-1" />
      <h2 className="caps text-muted whitespace-nowrap">{children}</h2>
      <GoldRule className="flex-1" />
    </div>
  );
}
