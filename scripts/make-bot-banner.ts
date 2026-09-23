/**
 * The greeting banner the bot sends with /start.
 *
 * Telegram shows it above the welcome text at the top of a conversation the
 * buyer has just opened, so it is the first thing this business shows anyone.
 * 1280×640 is the size Telegram renders a photo caption block at without
 * recompressing it twice.
 *
 *   pnpm brand:banner
 *
 * The mark only, on the canvas colour, with nothing written on it. The words
 * are the caption — `botGreeting` in Settings, which the owner edits from the
 * panel — and baking them into a picture would mean regenerating an image every
 * time they change a sentence.
 *
 * ── The white background, solved here rather than worked around ──
 *
 * The supplied logo has an opaque white field and the interface hides it with
 * `mix-blend-mode: multiply`, which works on a page and cannot travel inside a
 * PNG. So the multiply is performed at generation time instead: sharp composites
 * the mark onto the cream ground in `multiply`, and because multiplying by pure
 * white is the identity, the white field disappears into the ground exactly as
 * it does in the browser. The result is a flat image that needs no blend mode
 * from whoever displays it.
 *
 * This is still the workaround, not the answer — it only works because the
 * ground is lighter than every ink in the mark. A transparent PNG or an SVG
 * from the client retires both this and the CSS.
 */

import { writeFileSync } from "node:fs";

import sharp from "sharp";

/** The canvas token from globals.css. One source, written down in two places. */
const CANVAS = { r: 0xf8, g: 0xf5, b: 0xee };

const WIDTH = 1280;
const HEIGHT = 640;

/**
 * How wide the mark sits on the banner.
 *
 * Telegram crops a photo's edges in some layouts and overlays a caption at the
 * bottom, so the mark is kept well inside both. 46% of the width leaves the
 * logo's own braided rule legible at the size a phone actually renders this.
 */
const MARK_WIDTH = Math.round(WIDTH * 0.46);

/** Telegram is unhappy above a few megabytes; the brief asks for 150 KB. */
const MAX_BYTES = 150 * 1024;

const OUT = "brand/bot-banner.png";

async function main(): Promise<void> {
  const mark = await sharp("brand/logo.png")
    .resize({ width: MARK_WIDTH, withoutEnlargement: true })
    .toBuffer();
  const markMeta = await sharp(mark).metadata();

  const banner = await sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 3, background: CANVAS },
  })
    .composite([
      {
        input: mark,
        // Optically centred, not arithmetically: the mark's visual mass sits
        // above its box centre because «PARFUM & CARE» is a hairline of caps.
        left: Math.round((WIDTH - (markMeta.width ?? MARK_WIDTH)) / 2),
        top: Math.round((HEIGHT - (markMeta.height ?? 0)) / 2) - 12,
        blend: "multiply",
      },
    ])
    // A palette, because this is two greens, a gold and a field of one cream —
    // a few dozen colours, not a photograph.
    .png({ palette: true, effort: 9 })
    .toBuffer();

  if (banner.length > MAX_BYTES) {
    throw new Error(
      `Баннер весит ${Math.round(banner.length / 1024)} КБ при потолке ` +
        `${MAX_BYTES / 1024} КБ. Уменьшите MARK_WIDTH или перейдите на JPEG.`,
    );
  }

  writeFileSync(OUT, banner);
  const meta = await sharp(banner).metadata();
  console.log(
    `\n  ${OUT} — ${meta.width}×${meta.height}, ${Math.round(banner.length / 1024)} КБ\n` +
      "  Загрузить в админке: Настройки → Баннер приветствия бота.\n",
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
