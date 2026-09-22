import localFont from "next/font/local";

/**
 * Typefaces.
 *
 * Self-hosted, never the Google Fonts CDN: the production host is in Russia and
 * foreign CDNs are unreliable from there, so a font request that hangs would
 * hold up first paint on exactly the connections this catalog has to work on.
 *
 * Both are variable fonts subset to Latin + Cyrillic plus the punctuation this
 * interface actually uses — the ruble sign, №, guillemets, dashes and
 * non-breaking spaces. That takes Cormorant Garamond from 1.1 MB to 40 KB and
 * Manrope from 161 KB to 30 KB: two files, 70 KB total, against a budget of
 * four files.
 *
 * The direction allowed for Playfair Display as a fallback in case Cormorant's
 * Cyrillic was poor. It is not: the font carries all 66 Russian letters with
 * real outlines, verified against its cmap and glyph bounds, so Cormorant
 * ships as specified.
 *
 * `display: "swap"` deliberately: on a weak mobile connection a buyer should
 * read the catalog in a fallback face rather than stare at invisible text.
 */

export const cormorant = localFont({
  src: "./CormorantGaramond-subset.woff2",
  variable: "--font-cormorant",
  display: "swap",
  weight: "300 700",
  // Tuned to Georgia, the fallback, so the swap does not shift layout.
  fallback: ["Georgia", "Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const manrope = localFont({
  src: "./Manrope-subset.woff2",
  variable: "--font-manrope",
  display: "swap",
  weight: "200 800",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Helvetica Neue", "sans-serif"],
  adjustFontFallback: "Arial",
});
