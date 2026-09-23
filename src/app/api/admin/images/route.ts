import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/roles";
import { addProductImages } from "@/server/catalog/mutations/images";
import { fromRoute } from "@/server/catalog/revalidate";
import { MAX_UPLOAD_BYTES } from "@/lib/images";
import { ImageRejected, processImage } from "@/server/storage/images";
import { putObjects } from "@/server/storage/s3";
import { prisma } from "@/server/db";

/**
 * Uploading product photographs.
 *
 * A Route Handler rather than a Server Action, because an action's body is
 * capped at 1 MB and a photograph off a phone is several times that.
 *
 * One file per request, on purpose. The client sends them in sequence and shows
 * a row per file, so a photograph that is rejected — the wrong format, too
 * large, sideways beyond saving — says so on its own line while the others
 * carry on. A single multipart request with five files would have one outcome
 * for all five, and the owner would have to work out which one was the problem.
 *
 * Invalidation is fromRoute, not fromAction: updateTag throws E872 outside a
 * Server Action.
 *
 * No `export const runtime`: under cacheComponents Next refuses the segment
 * export outright, and the Node runtime is the default anyway — which is what
 * sharp needs, since it is a native binding.
 */

interface Failure {
  error: string;
}

function refuse(message: string, status = 400) {
  return NextResponse.json<Failure>({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    await requirePermission("catalog:write");
  } catch {
    // The same answer for "not signed in" and "signed in without the right":
    // neither is anything an anonymous caller should be able to tell apart.
    return refuse("Нет доступа", 403);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse("Не удалось прочитать файл");
  }

  const productId = form.get("productId");
  const file = form.get("file");

  if (typeof productId !== "string" || productId === "") return refuse("Не указан товар");
  if (!(file instanceof File)) return refuse("Файл не получен");
  // Checked before the bytes are read into memory, not after.
  if (file.size > MAX_UPLOAD_BYTES) {
    return refuse(
      `Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ. Уменьшите его и попробуйте снова.`,
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, sku: true },
  });
  if (!product) return refuse("Товар не найден", 404);

  const buffer = Buffer.from(await file.arrayBuffer());

  // The article makes the key readable in a bucket listing; the random suffix
  // makes a re-upload a new key, so nothing is ever served from a cache that
  // holds the previous picture.
  const prefix = `products/${product.sku.toLowerCase()}/${randomBytes(6).toString("hex")}`;

  let processed;
  try {
    processed = await processImage(buffer, prefix);
  } catch (error) {
    // ImageRejected carries a message written for the person holding the phone.
    if (error instanceof ImageRejected) return refuse(error.message);
    return refuse("Не удалось обработать фото");
  }

  try {
    await putObjects(processed.renditions);
  } catch {
    return refuse("Хранилище недоступно. Попробуйте ещё раз.", 502);
  }

  // The row last: an object with no row is wasted storage, a row with no object
  // is a broken image on the storefront.
  await fromRoute(
    addProductImages(product.id, [
      {
        key: processed.key,
        width: processed.width,
        height: processed.height,
        blurDataUrl: processed.blurDataUrl,
      },
    ]),
  );

  return NextResponse.json({
    key: processed.key,
    width: processed.width,
    height: processed.height,
  });
}
