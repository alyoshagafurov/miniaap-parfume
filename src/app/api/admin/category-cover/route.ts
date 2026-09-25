import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { EnvError } from "@/lib/env";
import { MAX_UPLOAD_BYTES } from "@/lib/images";
import { requirePermission } from "@/server/auth/roles";
import { setCategoryCover } from "@/server/catalog/mutations/categories";
import { fromRoute } from "@/server/catalog/revalidate";
import { prisma } from "@/server/db";
import { ImageRejected, processImage } from "@/server/storage/images";
import { putObjects } from "@/server/storage/s3";

/**
 * A category's cover photograph.
 *
 * A Route Handler for the same reason as the product photographs and the bot's
 * banner: a picture off a phone does not fit in a Server Action's 1 MB body.
 *
 * The mutation this calls was written before anything called it — its own
 * comment said "set by the upload route after the file is stored", and there
 * was no upload route. The home screen has always rendered `coverKey` with the
 * monogram as its fallback, so the four categories stood as monograms with no
 * way in the panel to give them a picture. This is that way.
 *
 * Keys are flat — `categories/<hex12>-800.webp` — rather than nested under the
 * category the way product renditions nest under an article number. A category
 * is renamed and re-slugged freely, and a key that carried the slug would
 * either go stale or force a re-upload on every rename; the hash is the whole
 * identity, and `src/lib/images.ts` had to learn the prefix for the media proxy
 * to serve it at all.
 *
 * Invalidation is fromRoute, not fromAction: updateTag throws E872 outside a
 * Server Action.
 */

function refuseTooLarge() {
  return NextResponse.json(
    { error: `Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ` },
    { status: 413 },
  );
}

async function categoryExists(id: string): Promise<boolean> {
  const found = await prisma.category.findUnique({
    where: { id },
    select: { id: true },
  });
  return found !== null;
}

export async function POST(request: Request) {
  try {
    await requirePermission("catalog:write");
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  // Before formData(), which reads and buffers the entire body — the same
  // ordering the banner route documents. The declared length is the client's
  // to write, so this is the cheap first refusal, not the real ceiling.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return refuseTooLarge();
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать файл" }, { status: 400 });
  }

  const categoryId = form.get("categoryId");
  if (typeof categoryId !== "string" || categoryId === "") {
    return NextResponse.json({ error: "Категория не указана" }, { status: 400 });
  }
  if (!(await categoryExists(categoryId))) {
    return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) return refuseTooLarge();

  const prefix = `categories/${randomBytes(6).toString("hex")}`;
  let processed;
  try {
    processed = await processImage(Buffer.from(await file.arrayBuffer()), prefix);
  } catch (error) {
    if (error instanceof ImageRejected) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Не удалось обработать фото" }, { status: 400 });
  }

  try {
    await putObjects(processed.renditions);
  } catch (error) {
    if (error instanceof EnvError) {
      return NextResponse.json(
        { error: `Хранилище не настроено: ${error.variables.join(", ")}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: "Хранилище недоступно" }, { status: 502 });
  }

  await fromRoute(setCategoryCover(categoryId, processed.key));
  return NextResponse.json({ key: processed.key });
}

/** Removes the cover; the row then shows the monogram again. */
export async function DELETE(request: Request) {
  try {
    await requirePermission("catalog:write");
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const categoryId = new URL(request.url).searchParams.get("categoryId");
  if (!categoryId) {
    return NextResponse.json({ error: "Категория не указана" }, { status: 400 });
  }
  if (!(await categoryExists(categoryId))) {
    return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  }

  await fromRoute(setCategoryCover(categoryId, null));
  return NextResponse.json({ ok: true });
}
