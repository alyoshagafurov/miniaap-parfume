import type { Metadata, Viewport } from "next";

import { cormorant, manrope } from "@/app/fonts";
import { YandexMetrica } from "@/components/analytics/YandexMetrica";
import { CANVAS } from "@/lib/tokens";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ÁRUMI Parfum & Care — оптовый каталог",
    template: "%s · ÁRUMI",
  },
  description:
    "Оптовый склад парфюмерии и средств ухода. Известные бренды, выгодные условия, " +
    "надёжные поставки. Отправка по всей России.",
  applicationName: "ÁRUMI",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // The canvas colour, so the browser chrome matches the page instead of
  // flashing white on load.
  themeColor: CANVAS,
  width: "device-width",
  initialScale: 1,
  // Deliberately zoomable: the audience reads this outdoors, and locking zoom
  // to make a Mini App feel native would take that away.
  maximumScale: 5,
  viewportFit: "cover",
};

/**
 * Read at module scope, not per render.
 *
 * `NEXT_PUBLIC_*` is inlined at build time, so this is a constant in the bundle
 * — and when it is empty the whole component and its import are dropped by the
 * bundler rather than shipped as a branch that never runs.
 */
const METRICA_ID = process.env.NEXT_PUBLIC_YANDEX_METRICA_ID ?? "";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${cormorant.variable} ${manrope.variable}`}>
      <body>
        {children}
        {METRICA_ID ? <YandexMetrica counterId={METRICA_ID} /> : null}
      </body>
    </html>
  );
}
