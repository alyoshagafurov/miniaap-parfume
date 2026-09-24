import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "@/lib/env";

/**
 * Object storage.
 *
 * MinIO in development, an S3-compatible bucket in production. `forcePathStyle`
 * because MinIO serves buckets as a path, not a subdomain, and the
 * virtual-hosted style would resolve `arumi.localhost` to nothing.
 *
 * Kept apart from src/lib/media.ts, which only builds a public URL: that one is
 * imported by client components and by the bot, and neither should be carrying
 * the AWS SDK.
 */

let cached: S3Client | undefined;

function client(): S3Client {
  if (cached) return cached;
  const e = env();
  cached = new S3Client({
    endpoint: e.S3_ENDPOINT,
    // From the environment, because an S3-compatible store decides for itself
    // what it wants here: MinIO ignores it, Yandex wants ru-central1, and a
    // Railway bucket reports `auto`. It is only used to sign, but a signature
    // computed for the wrong region is rejected by the ones that check.
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
  });
  return cached;
}

export interface StoredObject {
  key: string;
  body: Buffer;
  contentType: string;
}

/**
 * Stores every rendition of one photograph.
 *
 * Sequential rather than parallel. A phone upload of five photographs is
 * fifteen to thirty objects; firing them all at once at a small VPS is how a
 * connection pool runs out, and the wall-clock difference on a local bucket is
 * not worth the failure mode.
 */
export async function putObjects(objects: readonly StoredObject[]): Promise<void> {
  const e = env();
  for (const object of objects) {
    await client().send(
      new PutObjectCommand({
        Bucket: e.S3_BUCKET,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        // A year: the key contains a random component, so a changed photograph
        // is a new key and never a stale one served from a cache.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
}

/**
 * Removes objects, reporting nothing.
 *
 * Called after the row is gone. A failure here leaves bytes in a bucket that
 * nothing references, which costs storage; a failure that propagated would roll
 * back a deletion the administrator has already been told succeeded.
 */
export async function deleteObjects(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await client().send(
      new DeleteObjectsCommand({
        Bucket: env().S3_BUCKET,
        Delete: { Objects: keys.map((Key) => ({ Key })) },
      }),
    );
  } catch {
    // Deliberately swallowed; see above.
  }
}

/**
 * Every rendition of a stored key.
 *
 * The database holds one key — the 800px WebP — and the others are its
 * siblings. Derived rather than stored, because a list of six keys per image in
 * a column is six chances for the list and the files to disagree.
 */
export function renditionKeys(key: string): string[] {
  const base = key.replace(/-\d+\.webp$/, "");
  if (base === key) return [key];
  const keys: string[] = [];
  for (const width of [400, 800, 1600]) {
    keys.push(`${base}-${width}.avif`, `${base}-${width}.webp`);
  }
  return keys;
}

/**
 * A key that is not in the bucket.
 *
 * Its own type so the media proxy can tell «this photograph was deleted» from
 * «the bucket is unreachable» — the first is a 404 and the second is a 502, and
 * answering 404 to an outage makes a broken deployment look like an empty
 * catalog.
 */
export class StorageMiss extends Error {
  constructor(key: string) {
    super(`Объект не найден: ${key}`);
    this.name = "StorageMiss";
  }
}

/**
 * Reads one object.
 *
 * Only the media proxy uses this, and only when the bucket is private — a
 * public bucket is read by the browser directly and these bytes never touch the
 * application. Buffered rather than streamed: these are renditions capped at
 * 1600px, tens of kilobytes each, and a buffer is what `NextResponse` wants
 * anyway.
 */
export async function getObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string }> {
  const e = env();
  try {
    const result = await client().send(
      new GetObjectCommand({ Bucket: e.S3_BUCKET, Key: key }),
    );
    if (!result.Body) throw new StorageMiss(key);
    return {
      body: await result.Body.transformToByteArray(),
      // Falls back rather than guessing from the extension: the object was
      // written with its type and this is what came back with it.
      contentType: result.ContentType ?? "application/octet-stream",
    };
  } catch (error) {
    if (error instanceof StorageMiss) throw error;
    const name = (error as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") throw new StorageMiss(key);
    throw error;
  }
}
