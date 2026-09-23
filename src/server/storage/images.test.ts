import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { MAX_UPLOAD_BYTES } from "@/lib/images";

import { ImageRejected, processImage } from "./images";

/**
 * The fixtures are generated rather than committed, so the suite carries no
 * binaries and the expectations are visible: a picture that is 1200 wide and
 * 600 tall with EXIF orientation 6 is a portrait photograph a phone wrote
 * sideways, and there is no other way to say that in a test.
 */

/** Landscape pixels plus "rotate me 90°" — exactly what a phone saves. */
async function sidewaysJpeg() {
  return sharp({
    create: {
      width: 1200,
      height: 600,
      channels: 3,
      background: { r: 77, g: 82, b: 44 },
    },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
}

async function plainPng(width = 800, height = 1000) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer();
}

describe("processImage — фото с телефона", () => {
  it("применяет EXIF-ориентацию, а не выбрасывает её", async () => {
    // The trap this guards: every writer below drops metadata, so stripping
    // EXIF before rotating would leave the picture on its side — a valid file,
    // plausible dimensions, nothing failing, and half the catalog lying down.
    const processed = await processImage(await sidewaysJpeg(), "test/rotate");

    expect(processed.width).toBe(600);
    expect(processed.height).toBe(1200);

    // And the pixels really were turned, not just the numbers.
    const cover = processed.renditions.find((r) => r.key === processed.key);
    const meta = await sharp(cover!.body).metadata();
    expect(meta.width).toBeLessThan(meta.height!);
  });

  it("не оставляет EXIF в отданных файлах", async () => {
    const processed = await processImage(await sidewaysJpeg(), "test/exif");
    for (const rendition of processed.renditions) {
      const meta = await sharp(rendition.body).metadata();
      // Nothing to re-rotate by: the orientation has been baked into the pixels.
      expect(meta.orientation ?? 1).toBe(1);
    }
  });

  it("делает AVIF и WebP и инлайновую заглушку", async () => {
    const processed = await processImage(await plainPng(), "test/renditions");

    expect(processed.renditions.some((r) => r.contentType === "image/avif")).toBe(true);
    expect(processed.renditions.some((r) => r.contentType === "image/webp")).toBe(true);
    expect(processed.blurDataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    // Small enough to inline in HTML without costing more than it saves.
    expect(processed.blurDataUrl.length).toBeLessThan(2000);
    expect(processed.key).toBe("test/renditions-800.webp");
  });

  it("не растягивает маленький оригинал до больших размеров", async () => {
    const processed = await processImage(await plainPng(500, 620), "test/small");
    expect(processed.renditions.every((r) => !r.key.includes("-1600."))).toBe(true);
  });

  it("отказывает HEIC так, чтобы владелец знал, что делать", async () => {
    // The first bytes of an HEIC container. sharp reads the format from the
    // content, so the filename is irrelevant — which is the point.
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from("ftypheic"),
      Buffer.alloc(64),
    ]);
    // Not merely "rejected": sharp here is built without libheif and throws on
    // open, so without the signature check the answer would be the generic
    // "не удалось прочитать файл" — useless for the most common upload failure
    // this catalog will have.
    await expect(processImage(heic, "test/heic")).rejects.toThrow(/HEIC/);
    await expect(processImage(heic, "test/heic")).rejects.toThrow(/JPEG/);
  });

  it("отказывает .exe, переименованному в .jpg", async () => {
    const exe = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(2048, 0x90)]);
    const rejection = processImage(exe, "test/exe");
    await expect(rejection).rejects.toBeInstanceOf(ImageRejected);
    await expect(rejection).rejects.toThrow(/не фотография|прочитать файл/i);
  });

  it("отказывает файлу больше лимита", async () => {
    const huge = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0);
    await expect(processImage(huge, "test/huge")).rejects.toBeInstanceOf(ImageRejected);
  });

  it("отказывает слишком маленькому фото, называя его размер", async () => {
    await expect(processImage(await plainPng(120, 120), "test/tiny")).rejects.toThrow(
      /120×120/,
    );
  });
});

describe("processImage — бюджет ресурсов", () => {
  it("отказывает бомбе сжатия по числу пикселей", async () => {
    // Measured before the cap existed: a single-colour PNG of these dimensions
    // compresses to 776 KB — comfortably inside the 10 MB upload limit — and
    // decoded to 326 MB of RSS in 5.1 s. The upload cap measured the only
    // quantity that did not matter.
    const bomb = await sharp({
      create: {
        width: 16000,
        height: 16000,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(bomb.byteLength).toBeLessThan(MAX_UPLOAD_BYTES);
    await expect(processImage(bomb, "test/bomb")).rejects.toBeInstanceOf(ImageRejected);
  }, 60_000);

  it("пропускает большое, но разумное фото", async () => {
    // A 12 MP phone photograph: the cap must refuse the bomb without refusing
    // the thing the owner actually uploads.
    const real = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 77, g: 82, b: 44 },
      },
    })
      .jpeg()
      .toBuffer();

    const processed = await processImage(real, "test/real");
    expect(processed.width).toBe(4000);
  }, 60_000);
});
