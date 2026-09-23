import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { EnvError } from "@/lib/env";
import { MAX_UPLOAD_BYTES } from "@/lib/images";
import { requirePermission } from "@/server/auth/roles";
import { setBannerKey } from "@/server/catalog/mutations/settings";
import { fromRoute } from "@/server/catalog/revalidate";
import { ImageRejected, processImage } from "@/server/storage/images";
import { putObjects } from "@/server/storage/s3";

/**
 * The bot's greeting banner.
 *
 * A Route Handler for the same reason as the product photographs: a picture off
 * a phone does not fit in a Server Action's 1 MB body.
 *
 * Setting it clears the cached Telegram file_id. The bot re-sends the banner by
 * id after the first upload, so an id pointing at the previous picture would go
 * on showing it to every new buyer with nothing to explain why.
 */
function refuseTooLarge() {
  return NextResponse.json(
    { error: `Файл больше ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} МБ` },
    { status: 413 },
  );
}

export async function POST(request: Request) {
  try {
    await requirePermission("settings:write");
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
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
    return NextResponse.json({ error: "Не удалось прочитать файл" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не получен" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) return refuseTooLarge();

  const prefix = `banner/${randomBytes(6).toString("hex")}`;
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

  await fromRoute(setBannerKey(processed.key));
  return NextResponse.json({ key: processed.key });
}

/** Removes the banner; the bot then greets with text alone. */
export async function DELETE() {
  try {
    await requirePermission("settings:write");
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  await fromRoute(setBannerKey(null));
  return NextResponse.json({ ok: true });
}
