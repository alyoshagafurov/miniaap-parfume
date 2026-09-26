import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { AdminMenu } from "@/components/admin/AdminMenu";
import { currentSession } from "@/server/auth/roles";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
 *
 * ── Why there is no header ──
 *
 * There was one: the wordmark, the role, a logout button, and under them a
 * scrolling row of ten sections. The client found the panel complicated, and
 * that row was most of the reason — ten words competing on every screen for
 * attention the task in front of the owner needed. What is left is the
 * storefront's own top line, the menu button and the wordmark, and it scrolls
 * away with the page instead of standing over it. Everything else lives in the
 * menu.
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
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4">
      <div className="flex items-center gap-2 pt-3">
        <AdminMenu isOwner={session.role === "OWNER"} />
        <Link
          href="/admin"
          className="font-wordmark text-wordmark inline-flex min-h-11 flex-1 items-center text-2xl leading-none font-semibold"
        >
          ÁRUMI
        </Link>
        <span className="caps text-muted">Админка</span>
      </div>

      <main className="flex-1 pt-6 pb-20">{children}</main>
    </div>
  );
}

function Booting() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-5xl px-4 pt-3">
      <div className="bg-primary-wash h-11 w-40 rounded-full" />
      <div className="bg-primary-wash mt-8 h-10 w-56 rounded-md" />
      <div className="stage mt-6 h-40 w-full" />
    </div>
  );
}
