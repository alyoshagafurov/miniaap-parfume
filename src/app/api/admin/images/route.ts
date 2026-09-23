import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { requirePermission } from "@/server/auth/roles";
import { addProductImages } from "@/server/catalog/mutations/images";
import { fromRoute } from "@/server/catalog/revalidate";
import { EnvError } from "@/lib/env";
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

function refuseTooLarge() {
  return refuse(
    `Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ. Уменьшите его и попробуйте снова.`,
    413,
  );
}

async function findBySku(candidates: readonly string[]) {
  for (const sku of candidates) {
    const found = await prisma.product.findFirst({
      // Case-insensitive: shelf labels are printed in capitals and file names
      // arrive from a phone in whatever case the camera app chose.
      where: { sku: { equals: sku.trim(), mode: "insensitive" } },
      select: { id: true, sku: true },
    });
    if (found) return found;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    await requirePermission("catalog:write");
  } catch {
    // The same answer for "not signed in" and "signed in without the right":
    // neither is anything an anonymous caller should be able to tell apart.
    return refuse("Нет доступа", 403);
  }

  // Before formData(), which reads and buffers the entire body. The check that
  // used to sit after it asserted a protection it did not provide: a 2 GB
  // multipart upload was absorbed in full before the 10 MB limit was consulted.
  // The declared length is the client's to write, so the real ceiling belongs
  // at the relay (`client_max_body_size`); this is the cheap first refusal.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return refuseTooLarge();
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse("Не удалось прочитать файл");
  }

  const productId = form.get("productId");
  // Either an id, from the product form, or an article, from the bulk screen
  // where the filename is all there is to go on.
  const candidates = form
    .getAll("sku")
    .filter((v): v is string => typeof v === "string");
  const file = form.get("file");

  if (typeof productId !== "string" && candidates.length === 0) {
    return refuse("Не указан товар");
  }
  if (!(file instanceof File)) return refuse("Файл не получен");
  // The real size, now that it is known. The content-length check above is the
  // cheap one; this is the true one.
  if (file.size > MAX_UPLOAD_BYTES) return refuseTooLarge();

  // Candidates are tried in the order the parser gave them, so `ARM-1005.jpg`
  // matches ARM-1005 rather than looking for ARM.
  const product =
    typeof productId === "string" && productId !== ""
      ? await prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, sku: true },
        })
      : await findBySku(candidates);

  if (!product) {
    // The LAST candidate is the documented reading — `ARM-9999-1.jpg` means
    // "article ARM-9999, photo 1". The first is the fallback for an article
    // that genuinely ends in a number, and naming it here would tell the owner
    // to look for something they never wrote.
    const meant = candidates[candidates.length - 1];
    return refuse(meant ? `Нет товара с артикулом ${meant}` : "Товар не найден", 404);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // The article makes the key readable in a bucket listing; the random suffix
  // makes a re-upload a new key, so nothing is ever served from a cache that
  // holds the previous picture.
  // Sanitised again here even though the schema constrains it: this key is
  // built from a stored value, and rows predating the constraint — or arriving
  // through the importer — have not been through it.
  const safeSku = product.sku.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
  const prefix = `products/${safeSku}/${randomBytes(6).toString("hex")}`;

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
  } catch (error) {
    // A misconfigured environment is not an outage, and saying it is sends the
    // operator to check a bucket that was never the problem. env() is lazy, so
    // this is the first place a missing S3 variable can surface.
    if (error instanceof EnvError) {
      return refuse(
        `Хранилище не настроено: ${error.variables.join(", ")}. Это конфигурация, не сбой.`,
        500,
      );
    }
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
    sku: product.sku,
  });
}
