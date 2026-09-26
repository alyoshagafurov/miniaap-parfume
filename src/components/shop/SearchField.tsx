"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/**
 * The search field.
 *
 * Sticky at the top of every storefront screen, because a wholesale buyer
 * arrives knowing what they want far more often than they arrive browsing.
 *
 * Typing does not navigate. Navigation happens on submit or after the typing
 * settles, so a buyer entering "шанель" does not issue five requests and does
 * not push five entries onto their history — the back button has to take them
 * where they came from, not through their own keystrokes.
 */
export function SearchField({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [value, setValue] = useState(urlQuery);
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Reflect a query that arrived from the URL — a shared link, or the back
  // button returning to a previous search — without an effect.
  //
  // Adjusting during render is React's own answer to "reset state when a prop
  // changes": React discards this render and re-runs immediately, so nothing is
  // painted twice. Doing it in an effect paints the stale value first and, as
  // eslint pointed out, cascades renders.
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setValue(urlQuery);
  }

  const go = (query: string, replace: boolean) => {
    const trimmed = query.trim();
    const href = trimmed === "" ? "/" : `/search?q=${encodeURIComponent(trimmed)}`;
    startTransition(() => {
      // While typing, replace rather than push: the history should hold where
      // the buyer meant to go, not every intermediate word.
      if (replace) router.replace(href, { scroll: false });
      else router.push(href);
    });
  };

  const onChange = (next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    // 250ms: long enough that a word is finished, short enough to feel live.
    timer.current = setTimeout(() => go(next, true), 250);
  };

  useEffect(() => () => timer.current && clearTimeout(timer.current), []);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(value, false);
      }}
      className="relative"
    >
      <label htmlFor="catalog-search" className="sr-only">
        Поиск по каталогу
      </label>
      <input
        id="catalog-search"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Бренд, аромат или артикул"
        className="bg-surface text-ink border-control placeholder:text-muted focus-visible:border-primary w-full rounded-full border px-5 py-3 text-base transition-colors duration-150 ease-out"
      />
      <span aria-live="polite" className="sr-only">
        {isPending ? "Идёт поиск" : ""}
      </span>
    </form>
  );
}
