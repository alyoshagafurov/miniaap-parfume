"use client";

import Link from "next/link";
import { useState } from "react";

import { Sheet } from "@/components/ui/Sheet";

export interface MenuCategory {
  name: string;
  slug: string;
  productCount: number;
}

/**
 * The way to anywhere, from anywhere.
 *
 * The storefront had no navigation at all: the header carried the wordmark, the
 * search field and the basket, and every other screen was reachable only by
 * going back to the home page first. On a catalog whose whole pivot is the
 * format — 35 ml, 100 ml, twins, deodorants — a buyer comparing two formats had
 * to return to the top and start again each time. That is the "inconvenient"
 * this answers, and it is why the categories are the first thing in it.
 *
 * A sheet rather than a drawer off the side, because the component already
 * exists and carries four non-obvious fixes with it: the scroll lock that lives
 * in the overlay, the title that supplies `aria-labelledby` without warning
 * when it is missing, the focus trap that needs `autoFocus`, and Telegram's
 * swipe-to-close fighting the drag. A second implementation would have to
 * rediscover all four.
 *
 * Closed on navigation: a sheet still open over the page it just moved to reads
 * as a failed tap, and client navigation does not unmount this. It closes on
 * the tap itself rather than by watching the path from an effect — setting
 * state from an effect is what `react-hooks/set-state-in-effect` is there to
 * stop, and the tap is the earlier and more honest signal anyway.
 */
export function MainMenu({
  categories,
  adminHref = "/admin",
}: {
  categories: readonly MenuCategory[];
  adminHref?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Меню"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="text-ink hover:bg-surface -ml-2 inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-md transition-colors"
      >
        {/* Three strokes, drawn rather than imported: one icon does not earn a
            dependency, and the line weight is the rule's, not a library's. */}
        <svg aria-hidden viewBox="0 0 20 14" className="h-3.5 w-5">
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1h18" />
            <path d="M1 7h18" />
            <path d="M1 13h18" />
          </g>
        </svg>
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Меню">
        <nav
          className="flex flex-col gap-8 px-4 pb-6"
          onClick={(event) => {
            // Delegated: every destination in here is an anchor, and one
            // handler beats one per link.
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {/* Hidden rather than shown empty: a heading over nothing is a
              promise the menu cannot keep, and the sections below it are still
              worth reaching. */}
          <section hidden={categories.length === 0}>
            <h3 className="caps text-muted">Категории</h3>
            <ul className="border-rule mt-3 flex flex-col border-t">
              {categories.map((category) => (
                <li key={category.slug} className="border-rule border-b">
                  <Link
                    href={`/c/${category.slug}`}
                    className="hover:bg-surface flex min-h-11 items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors"
                  >
                    <span className="text-ink text-base leading-snug">
                      {category.name}
                    </span>
                    <span className="text-muted shrink-0 text-sm tabular-nums">
                      {category.productCount}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="caps text-muted">Разделы</h3>
            <ul className="border-rule mt-3 flex flex-col border-t">
              <MenuLink href="/" label="Главная" />
              <MenuLink href="/cart" label="Заявка" />
              <MenuLink href="/orders" label="Мои заявки" />
            </ul>
          </section>

          <section>
            {/*
              The panel, reachable from the storefront on purpose.

              It is not a secret — /admin has always been one address away and
              answers anyone who is not signed in with a login form. Hiding the
              link only cost the owner a walk to the address bar on a phone,
              which is exactly where they are when a price turns out wrong.
            */}
            <h3 className="caps text-muted">Для владельца</h3>
            <ul className="border-rule mt-3 flex flex-col border-t">
              <MenuLink href={adminHref} label="Админка" separate />
            </ul>
          </section>
        </nav>
      </Sheet>
    </>
  );
}

function MenuLink({
  href,
  label,
  separate = false,
}: {
  href: string;
  label: string;
  separate?: boolean;
}) {
  return (
    <li className="border-rule border-b">
      <Link
        href={href}
        // The panel is a different application under the same domain: its own
        // layout, its own session, none of the storefront's chrome. Not
        // prefetched, so a buyer who never opens it never pays for it.
        {...(separate ? { prefetch: false } : {})}
        className="hover:bg-surface text-ink flex min-h-11 items-center rounded-md px-2 py-3 text-base transition-colors"
      >
        {label}
      </Link>
    </li>
  );
}
