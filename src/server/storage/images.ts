import sharp, { type Metadata } from "sharp";

import { MAX_UPLOAD_BYTES } from "@/lib/images";

/**
 * Turning an uploaded file into catalog images.
 *
 * The owner photographs the range on a phone, so this has to survive what a
 * phone produces — and the first thing a phone produces is a picture that is
 * not the right way up.
 *
 * `.rotate()` with no arguments applies the EXIF orientation and then drops it.
 * The order is the whole point: every output format here is written without
 * metadata, so stripping EXIF first would throw away the only record of which
 * way up the picture is, and half the catalog would lie on its side. The bug is
 * silent — the file is valid, the dimensions are plausible, and nothing fails.
 *
 * Nothing is trusted from the filename. The format is read from the first bytes
 * by sharp, which is why an .exe renamed to .jpg is refused here rather than
 * stored and served. The limits live in src/lib/images.ts, because the file
 * input needs them too and must not import sharp to get them.
 */

/** The widths a card, a grid and a product page actually ask for. */
const WIDTHS = [400, 800, 1600] as const;

/**
 * The pixel budget, and why the byte budget was not enough.
 *
 * sharp's default limit is 268 megapixels, so a 16384² image sails through —
 * and a single-colour PNG that size compresses to well under the 10 MB upload
 * cap. Measured against this project's own sharp: a 776 KB upload decoded to
 * 16000×16000, peaked at 326 MB of RSS and took 5.1 seconds. That is a 420×
 * memory amplification per request on a host this project describes as a small
 * VPS, and an out-of-memory there takes the storefront down with the panel.
 *
 * 25 megapixels is past any phone this catalog will meet — a 50 MP sensor is
 * already far more than a 1600px rendition can use — and the dimension cap
 * below refuses the pathological shapes (1×250000000) that fit the pixel budget
 * while being useless as photographs.
 */
const SHARP_LIMITS = { limitInputPixels: 25_000_000, sequentialRead: true } as const;
const MAX_DIMENSION = 8000;

export class ImageRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageRejected";
  }
}

export interface ProcessedImage {
  /** The base key; renditions live at deterministic suffixes of it. */
  key: string;
  width: number;
  height: number;
  blurDataUrl: string;
  renditions: Array<{ key: string; body: Buffer; contentType: string }>;
}

/**
 * Rejects what cannot be a catalog photograph, by content rather than by name.
 *
 * HEIC gets its own message. It is what an iPhone saves by default, sharp
 * cannot decode it without libheif, and «Сохраните фото как JPEG» is something
 * the owner can act on in the Photos app in five seconds — where "Input buffer
 * contains unsupported image format" is not.
 */
/**
 * Recognises HEIC before sharp is asked to open it.
 *
 * sharp is built without libheif here, so a HEIC does not merely fail a format
 * check — `metadata()` throws, and the caller's catch produces "не удалось
 * прочитать файл". That is the wrong answer to the most common upload failure
 * this catalog will have: HEIC is what an iPhone saves by default, and the
 * owner photographs the range on one.
 *
 * ISO base media format: a box length, the tag `ftyp`, then the brand. Reading
 * the bytes rather than the extension, like everything else here.
 */
const HEIF_BRANDS = [
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "mif1",
  "msf1",
  "avif",
];

function looksLikeHeif(input: Buffer): boolean {
  if (input.length < 16) return false;
  if (input.toString("latin1", 4, 8) !== "ftyp") return false;
  return HEIF_BRANDS.includes(input.toString("latin1", 8, 12).toLowerCase());
}

function assertUsable(meta: Metadata, bytes: number): void {
  if (bytes > MAX_UPLOAD_BYTES) {
    throw new ImageRejected(
      `Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ. Уменьшите его и попробуйте снова.`,
    );
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
    throw new ImageRejected("Это не фотография. Нужен JPEG, PNG или WebP.");
  }
  // The oriented dimensions, not the stored ones: a phone's 1200×600 landscape
  // with orientation 6 is a 600×1200 portrait, and judging it by the raw
  // numbers judges the wrong picture.
  const { width, height } = uprightSize(meta);
  if (!width || !height) {
    throw new ImageRejected("Не удалось прочитать размеры изображения.");
  }
  if (width < 400 || height < 400) {
    throw new ImageRejected(
      `Слишком маленькое фото (${width}×${height}). Нужно хотя бы 400×400.`,
    );
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new ImageRejected(
      `Слишком большое фото (${width}×${height}). Максимум ${MAX_DIMENSION}×${MAX_DIMENSION}.`,
    );
  }
}

/**
 * The size the picture will actually be once its EXIF orientation is applied.
 *
 * `metadata()` describes the INPUT and does not run the pipeline, so reading
 * `.width` off a `sharp(input).rotate()` chain returns the unrotated number —
 * a portrait photograph recorded as landscape, and a card that reserves the
 * wrong space for it. `autoOrient` is the field that already accounts for it.
 */
function uprightSize(meta: Metadata): { width: number; height: number } {
  return {
    width: meta.autoOrient?.width ?? meta.width ?? 0,
    height: meta.autoOrient?.height ?? meta.height ?? 0,
  };
}

/**
 * Produces every rendition and the inline placeholder.
 *
 * AVIF and WebP at three widths, because next/image is switched off — sharp
 * does this once at upload rather than the server doing it per request, and the
 * production host is a small VPS in Russia.
 *
 * The placeholder is a 16px WebP inlined as a data URL. It is what makes a card
 * reserve its space before the photograph arrives, which is the difference
 * between a list that settles and a list that jumps under a thumb.
 */
export async function processImage(
  input: Buffer,
  keyPrefix: string,
): Promise<ProcessedImage> {
  // Checked before the size, because "сохраните как JPEG" is useful whatever
  // the file weighs, and before sharp, which throws on a format it cannot open.
  if (looksLikeHeif(input)) {
    throw new ImageRejected(
      "iPhone сохранил фото в HEIC. Сохраните его как JPEG и загрузите снова.",
    );
  }

  let meta: Metadata;
  try {
    meta = await sharp(input, SHARP_LIMITS).metadata();
  } catch {
    throw new ImageRejected("Не удалось прочитать файл. Нужен JPEG, PNG или WebP.");
  }
  assertUsable(meta, input.byteLength);

  // Applied before anything else reads the pixels, and before every writer
  // below drops metadata.
  const upright = sharp(input, SHARP_LIMITS).rotate();
  const { width, height } = uprightSize(meta);

  const renditions: ProcessedImage["renditions"] = [];

  for (const target of WIDTHS) {
    // Never upscaled: a 500px original blown up to 1600 is a blurry file that
    // costs bandwidth to deliver.
    if (target > width && target !== WIDTHS[0]) continue;
    const resized = upright
      .clone()
      .resize({ width: Math.min(target, width), withoutEnlargement: true });

    renditions.push({
      key: `${keyPrefix}-${target}.avif`,
      body: await resized.clone().avif({ quality: 55 }).toBuffer(),
      contentType: "image/avif",
    });
    renditions.push({
      key: `${keyPrefix}-${target}.webp`,
      body: await resized.clone().webp({ quality: 78 }).toBuffer(),
      contentType: "image/webp",
    });
  }

  // The key the database stores and the storefront renders: the middle width,
  // in WebP, which every browser this catalog reaches can display.
  const key = `${keyPrefix}-800.webp`;
  if (!renditions.some((r) => r.key === key)) {
    renditions.push({
      key,
      body: await upright.clone().webp({ quality: 78 }).toBuffer(),
      contentType: "image/webp",
    });
  }

  const blur = await upright
    .clone()
    .resize({ width: 16, withoutEnlargement: true })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    key,
    width,
    height,
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
    renditions,
  };
}
