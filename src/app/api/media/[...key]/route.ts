import { NextResponse } from "next/server";

import { MEDIA_KEY_PATTERN } from "@/lib/images";
import { getObject, StorageMiss } from "@/server/storage/s3";

/**
 * Photographs, when the bucket is private.
 *
 * Railway Buckets are S3-compatible and cannot be made public, so there is no
 * origin a browser can fetch a product photograph from. This reads the object
 * with the bucket's own credentials and hands the bytes on.
 *
 * Inert when it is not needed: with a public bucket, `objectUrl` returns that
 * bucket's address and nothing ever reaches this route.
 *
 * ── Why the cache header is safe to make this strong ──
 *
 * Every key contains a content hash written at upload — `…/a1b2c3-800.webp` —
 * so a key never refers to two different pictures. Replacing a photograph
 * writes new keys and the product row starts pointing at them; the old ones are
 * deleted. Nothing can go stale, so a year and `immutable` are honest, and the
 * bytes then cross this process once per browser rather than once per page.
 *
 * ── What it will not serve ──
 *
 * The key comes from the URL, so it is a request parameter and treated as one.
 * It has to match the shape this application writes; anything else is a 404
 * without a lookup. That closes both the traversal («../../.env») and the
 * survey — a bucket holds the Excel exports and the database dumps too, and
 * neither has a key that looks like a rendition.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  const key = segments.join("/");

  if (!MEDIA_KEY_PATTERN.test(key)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const object = await getObject(key);
    // Into a Buffer: NextResponse takes a BodyInit, and a Uint8Array backed by
    // a generic ArrayBufferLike is not one of the types it accepts.
    return new NextResponse(Buffer.from(object.body), {
      headers: {
        "content-type": object.contentType,
        "cache-control": "public, max-age=31536000, immutable",
        // The bucket is not the browser's origin and its own headers do not
        // reach it, so the one that matters is set here.
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof StorageMiss) return new NextResponse(null, { status: 404 });
    // A bucket that is down is not a missing picture, and answering 404 would
    // make a broken deployment look like an empty catalog.
    return new NextResponse(null, { status: 502 });
  }
}
