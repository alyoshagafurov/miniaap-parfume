import Link from "next/link";

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
 * A section heading: heavy capitals, and nothing holding them up.
 *
 * The reference sets «NEW ARRIVALS» and «DETAILS» as heavy grotesque capitals
 * standing on their own, and that is what carries a screen here too — scale,
 * not decoration. The gold rule that used to sit beneath every heading is gone
 * from it; a heading that needs a rule to be seen as a heading was set too
 * small.
 *
 * `action` is the reference's small link on the right — «full list», «details».
 * It is set in ink, not amber: amber is spent on money and nothing else, and a
 * link coloured like a price reads as one.
 *
 * Still an h2 and still one per section, so the document outline is unchanged.
 */
export function SectionHeading({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="display-caps text-ink text-2xl">{children}</h2>
      {action ? (
        <Link
          href={action.href}
          className="text-ink inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
