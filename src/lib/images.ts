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
