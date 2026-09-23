import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { LogoutButton } from "@/components/admin/LogoutButton";
import { GoldRule } from "@/components/ui/GoldRule";
import { currentSession } from "@/server/auth/roles";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Главная" },
  { href: "/admin/orders", label: "Заявки" },
  { href: "/admin/products", label: "Товары" },
  { href: "/admin/fragrances", label: "Ароматы" },
  { href: "/admin/brands", label: "Бренды" },
  { href: "/admin/categories", label: "Категории" },
  { href: "/admin/import", label: "Импорт" },
  { href: "/admin/settings", label: "Настройки" },
  { href: "/admin/admins", label: "Админы" },
] as const;

/**
 * The panel.
 *
 * The guard is inside a Suspense boundary because reading the session reads a
 * cookie, and under cacheComponents dynamic data outside one makes the whole
 * route unprerenderable — Next refuses at build rather than at runtime.
 *
 * This guard is a convenience, not the protection. A Server Action is a POST
 * endpoint that can be invoked with the page never rendered, so every action
 * and every admin read calls requireAdmin or requirePermission for itself. If
 * this layout were the only check, it would be a check in the one place that
 * can be skipped.
 */
export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Booting />}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}

async function Guard({ children }: { children: ReactNode }) {
  const session = await currentSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-canvas sticky top-0 z-20">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/admin"
            className="font-display text-olive inline-flex min-h-11 shrink-0 items-center text-xl leading-none font-semibold"
          >
            ÁRUMI
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-muted hidden text-sm sm:inline">
              {session.role === "OWNER" ? "Владелец" : "Редактор"}
            </span>
            <LogoutButton />
          </div>
        </div>

        {/*
          Horizontally scrollable rather than collapsed behind a menu: nine
          destinations is too few to hide and the client works on a 390 phone
          as often as on a desktop, where a tap is cheaper than a tap that
          opens a thing to tap.
        */}
        <nav aria-label="Разделы админки" className="border-rule border-b">
          <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-muted hover:bg-olive-wash hover:text-ink inline-flex min-h-11 items-center rounded-md px-3 text-sm whitespace-nowrap transition-colors"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</div>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8">
        <GoldRule />
        <p className="text-muted mt-3 text-xs">ÁRUMI Parfum &amp; Care — админ-панель</p>
      </footer>
    </div>
  );
}

function Booting() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="bg-surface h-11 w-full rounded-md" />
      <div className="bg-surface mt-6 h-32 w-full rounded-md" />
    </div>
  );
}
