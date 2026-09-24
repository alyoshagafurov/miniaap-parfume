/**
 * What the browser is allowed to offer for upload.
 *
 * Client-safe, and separate from src/server/storage/images.ts for the usual
 * reason: that file imports sharp, and a file input asking for an accept
 * attribute has no business pulling a native image library into the bundle.
 *
 * The accept attribute is a courtesy, not a check. It filters the file picker;
 * everything is verified again on the server from the first bytes, because a
 * filename says nothing about what is in a file.
 */

export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_MIME.join(",");

export const MAX_UPLOAD_MB = 10;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/**
 * Reading an article out of a photograph's filename.
 *
 * The workflow the brief calls «массовые фото»: the owner photographs the
 * range, names the files after the articles already on the shelf labels, and
 * drops the lot in. `ARM-1005-1.jpg` is the first photograph of ARM-1005.
 *
 * The subtlety is that the article contains a hyphen too, so the trailing
 * `-1` cannot simply be split off — `ARM-1005` would become `ARM`. Both
 * readings are returned and the server tries them in order: the whole stem
 * first, then the stem without a trailing number. `ARM-1005.jpg` and
 * `ARM-1005-2.jpg` therefore both resolve, and a genuine article ending in a
 * number is not mangled.
 */
export interface PhotoFilename {
  /** Candidate articles, most likely first. */
  candidates: string[];
  /** Position from the filename; 1 when it carries none. */
  order: number;
}

export function parsePhotoFilename(filename: string): PhotoFilename {
  const stem = filename.replace(/\.[^.]+$/, "").trim();
  const trailing = /^(.*?)[-_ ](\d{1,3})$/.exec(stem);

  if (!trailing?.[1]) return { candidates: [stem], order: 1 };
  return {
    candidates: [stem, trailing[1]],
    order: Number(trailing[2]) || 1,
  };
}

/**
 * The shape of a key this application writes.
 *
 * Used by the media proxy to decide what it will serve at all. The key arrives
 * in a URL, so it is a request parameter: matched against what the uploader
 * actually produces, and anything else refused without a lookup.
 *
 *   products/arm-1040/9f3a1c2b7d4e-800.webp
 *   banner/9f3a1c2b7d4e-1600.avif
 *
 * The article number is lowercased and stripped to `[a-z0-9._-]` on upload, the
 * random part is twelve hex characters, and the width is one of 400, 800 or
 * 1600. Two things this closes, and the second is the one that is easy to miss:
 * a traversal out of the prefix, and a survey of the bucket, which also holds
 * the Excel exports and — on the VPS deployment — the nightly database dumps.
 */
export const MEDIA_KEY_PATTERN =
  /^(?:products\/[a-z0-9._-]{1,64}\/|banner\/)[0-9a-f]{12}-(?:400|800|1600)\.(?:avif|webp)$/;
