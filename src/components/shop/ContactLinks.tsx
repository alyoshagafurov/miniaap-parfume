/**
 * The warehouse's telephone and WhatsApp, as two capsules on a light ground.
 *
 * For the screens where the catalog has nothing to show yet — an empty
 * category, a search over a catalog still being filled. A buyer who reaches
 * one came to order something, and the goods exist on the warehouse shelves
 * before they exist here, so the way on from those screens is a call rather
 * than another search.
 *
 * Both come from Settings and either may be blank: the client fills them in
 * from the panel, and a missing number renders nothing rather than a dead
 * link. The home page's capsules sit on the dark terms block and are inverted;
 * these are the same pair in the light-ground variants — the call as the
 * primary action, WhatsApp as the secondary.
 *
 * No hooks and no directive, so it renders on the server and inside a client
 * component alike.
 */
export function ContactLinks({
  phone,
  whatsappPhone,
  className = "",
}: {
  phone: string | null;
  whatsappPhone: string | null;
  className?: string;
}) {
  if (!phone && !whatsappPhone) return null;

  const tel = phone?.replace(/[^\d+]/g, "") ?? "";
  const wa = whatsappPhone?.replace(/\D/g, "") ?? "";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {phone ? (
        <a
          href={`tel:${tel}`}
          className="bg-primary text-surface hover:bg-primary-hover inline-flex min-h-11 items-center rounded-full px-5 text-sm font-bold tabular-nums transition-colors"
        >
          {phone}
        </a>
      ) : null}
      {whatsappPhone ? (
        <a
          href={`https://wa.me/${wa}`}
          rel="noopener noreferrer"
          target="_blank"
          className="bg-surface text-ink border-control hover:bg-primary-wash inline-flex min-h-11 items-center rounded-full border px-5 text-sm font-bold transition-colors"
        >
          WhatsApp
        </a>
      ) : null}
    </div>
  );
}
