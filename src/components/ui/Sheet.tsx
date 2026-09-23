"use client";

import { Drawer } from "vaul";
import type { ReactNode } from "react";

import { useDisableSwipeToClose } from "@/components/telegram/provider";

/**
 * A bottom sheet.
 *
 * Four things here are load-bearing and none of them are obvious.
 *
 * `Drawer.Overlay` must be rendered: the body scroll lock lives inside it, and
 * without it the storefront keeps scrolling behind an open sheet while
 * everything still looks correct.
 *
 * `Drawer.Title` must be rendered: with the resolved Radix dialog, a missing
 * title produces no `aria-labelledby` and — unlike older versions — no console
 * warning at all. It is shown rather than hidden: a panel that slides over the
 * catalog and covers most of a 390px screen should say what it is to everyone,
 * not only to a screen reader. Pass `hideTitle` where the content names itself.
 * Hidden means `sr-only`, never `hidden` or `display:none`, which would take it
 * out of the accessibility tree and remove the label it exists to provide.
 *
 * `autoFocus` is passed because vaul default-prevents `onOpenAutoFocus` while
 * Radix's focus trap is already armed: without it a keyboard user is trapped
 * with focus still on the trigger.
 *
 * Telegram closes the Mini App on a downward swipe, which fights the sheet's
 * own drag, so vertical swipes are disabled while one is open.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hideTitle?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useDisableSwipeToClose(open);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} autoFocus>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-30 bg-ink/40" />
        <Drawer.Content
          className="bg-canvas fixed inset-x-0 bottom-0 z-40 flex sheet-height flex-col rounded-t-md outline-none"
          style={{ paddingBottom: "var(--tg-safe-bottom)" }}
        >
          <div className="flex shrink-0 flex-col gap-3 px-4 pt-3 pb-2">
            <span aria-hidden className="bg-rule mx-auto h-1 w-10 rounded-full" />
            <Drawer.Title
              className={
                hideTitle ? "sr-only" : "font-display text-ink text-lg font-semibold"
              }
            >
              {title}
            </Drawer.Title>
          </div>

          {/*
            data-vaul-no-drag: without it, scrolling this list fights the
            sheet's drag-to-dismiss and the list feels stuck.
          */}
          <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {children}
          </div>

          {footer ? (
            <div className="border-rule shrink-0 border-t px-4 py-3">{footer}</div>
          ) : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
