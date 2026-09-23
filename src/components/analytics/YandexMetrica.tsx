"use client";

import { useEffect } from "react";

/**
 * Yandex Metrica, off unless a counter id is configured.
 *
 * Metrica rather than a Western analytics product for the same reason the whole
 * deployment is: this runs on a Russian VPS for Russian wholesalers, and the
 * alternatives are unreliable from there. It is the only third party in the
 * application, and `NEXT_PUBLIC_YANDEX_METRICA_ID` is the whole switch — unset
 * it and nothing loads, nothing is requested, and the Content-Security-Policy
 * stops naming mc.yandex.ru at all.
 *
 * ── Why this is not `next/script` with the official snippet ──
 *
 * Yandex hands out a snippet that is an inline `<script>`. Rendering it means
 * `dangerouslySetInnerHTML`, and this project's CSP comment claims there is not
 * one in the tree — a claim worth keeping true, because it is the argument for
 * why `script-src 'unsafe-inline'` is survivable here.
 *
 * So the snippet is transcribed into an effect instead. What Yandex's version
 * does is create a queueing stub on `window.ym` and append a `<script src>`;
 * both happen below, from this bundle, which `script-src 'self'` already
 * allows. The behaviour is identical and nothing inline is emitted.
 *
 * ── Why the counter is not started on the server ──
 *
 * It measures browsers. Starting it during render would also start it during
 * prerendering, where there is no visitor to count.
 */

declare global {
  interface Window {
    ym?: {
      (...args: unknown[]): void;
      a?: unknown[][];
      l?: number;
    };
  }
}

const SRC = "https://mc.yandex.ru/metrika/tag.js";

export function YandexMetrica({ counterId }: { counterId: string }) {
  useEffect(() => {
    if (!counterId) return;

    // Already initialised — a client navigation must not start a second
    // counter, and React 19 StrictMode runs this effect twice in development.
    if (window.ym?.l) return;

    const stub: NonNullable<Window["ym"]> = (...args: unknown[]) => {
      (stub.a = stub.a ?? []).push(args);
    };
    stub.l = Date.now();
    window.ym = stub;

    window.ym(counterId, "init", {
      // What the client will actually look at: where buyers come from, what
      // they open, and a recording of the session when something goes wrong on
      // a phone nobody can reproduce.
      ssr: true,
      webvisor: true,
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
    });

    if (document.querySelector(`script[src="${SRC}"]`)) return;

    const script = document.createElement("script");
    script.src = SRC;
    script.async = true;
    document.head.appendChild(script);
  }, [counterId]);

  return null;
}
