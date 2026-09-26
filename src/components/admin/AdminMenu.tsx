"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoutButton } from "@/components/admin/LogoutButton";
import { Sheet } from "@/components/ui/Sheet";

const SECTIONS = [
  { href: "/admin", label: "Главная" },
  { href: "/admin/products", label: "Товары" },
  { href: "/admin/categories", label: "Категории" },
  { href: "/admin/settings", label: "Настройки", owner: true },
  { href: "/admin/admins", label: "Админы", owner: true },
] as const;

/**
 * The panel's only navigation.
 *
 * Five sections, because that is what the client asked the panel to be:
 * Главная, Товары, Категории, Настройки, Админы. The other screens — orders,
 * fragrances, brands, bulk photos, import — still answer at their addresses:
 * a manager's Telegram notice links straight to an order, and a product's
 * fragrance links to its notes. They are reached from where they are needed
 * rather than listed where they are not.
 *
 * The storefront's menu, deliberately: the same button, the same sheet, the
 * same white stages. The owner moves between the two all day and should not
 * have to learn a second way to get around.
 */
export function AdminMenu({ isOwner }: { isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const current = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <>
      <button
        type="button"
        aria-label="Меню"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="text-ink hover:bg-primary-wash -ml-2 inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors"
      >
        <svg aria-hidden viewBox="0 0 20 14" className="h-3.5 w-5">
          <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M1 1h18" />
            <path d="M1 7h18" />
            <path d="M1 13h18" />
          </g>
        </svg>
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Меню">
        <div
          className="flex flex-col gap-8 pb-6"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          <nav aria-label="Разделы админки">
            <ul className="stage divide-rule flex flex-col divide-y overflow-hidden">
              {SECTIONS.filter((s) => !("owner" in s) || isOwner).map((section) => (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    aria-current={current(section.href) ? "page" : undefined}
                    className="hover:bg-primary-wash text-ink flex min-h-12 items-center justify-between gap-4 px-4 py-3 text-base font-bold transition-colors"
                  >
                    {section.label}
                    {current(section.href) ? (
                      <span aria-hidden className="bg-ink h-2 w-2 rounded-full" />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Link
            href="/admin/products/new"
            className="bg-night text-on-night flex min-h-12 items-center justify-center rounded-full px-6 text-base font-bold transition-opacity hover:opacity-90"
          >
            Новый товар
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              prefetch={false}
              className="text-ink inline-flex min-h-11 items-center text-sm font-semibold underline decoration-rule underline-offset-4 hover:decoration-ink"
            >
              Открыть витрину
            </Link>
            <span className="flex items-center gap-3">
              <span className="text-muted text-sm">
                {isOwner ? "Владелец" : "Редактор"}
              </span>
              <LogoutButton />
            </span>
          </div>
        </div>
      </Sheet>
    </>
  );
}
