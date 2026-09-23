import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import sharp from "sharp";

/**
 * The photographs the admin panel is tested against.
 *
 * Generated rather than committed. These are not pictures of perfume — they
 * are the four shapes that broke this pipeline during the build, and each one
 * is defined by a property (an orientation tag, a file magic, a pixel count)
 * that is easy to state in code and easy to lose in a binary somebody replaced
 * to "get a better test image".
 *
 *   npx tsx qa/e2e/make-media.ts
 */

export const MEDIA = "qa/e2e/media";

async function main(): Promise<void> {
  mkdirSync(MEDIA, { recursive: true });

  // 1. What a phone actually writes: landscape pixels plus an orientation tag
  //    saying "turn me". Stripping metadata before rotating lays this on the
  //    storefront sideways, which is the defect dополнение №4 names.
  writeFileSync(
    join(MEDIA, "phone-portrait.jpg"),
    await sharp({
      create: {
        width: 1200,
        height: 600,
        channels: 3,
        background: { r: 77, g: 82, b: 44 },
      },
    })
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 82 })
      .toBuffer(),
  );

  // 2. An ordinary upright photograph, for the case with nothing special in it.
  writeFileSync(
    join(MEDIA, "upright.jpg"),
    await sharp({
      create: {
        width: 1600,
        height: 2000,
        channels: 3,
        background: { r: 200, g: 195, b: 180 },
      },
    })
      .jpeg({ quality: 82 })
      .toBuffer(),
  );

  // 3. A second upright one, so multi-file upload has something to interleave.
  writeFileSync(
    join(MEDIA, "upright-2.jpg"),
    await sharp({
      create: {
        width: 1500,
        height: 1875,
        channels: 3,
        background: { r: 120, g: 130, b: 100 },
      },
    })
      .jpeg({ quality: 82 })
      .toBuffer(),
  );

  // 4. A HEIC, which is what an iPhone hands over by default. sharp here has no
  //    libheif, so this must be refused by name — «Сохраните фото как JPEG» —
  //    and not fall through to a 500. Only the container brand matters for that
  //    refusal, so a real HEIF encoder is not needed to write one.
  const brand = Buffer.from([
    0x00,
    0x00,
    0x00,
    0x18,
    0x66,
    0x74,
    0x79,
    0x70, // size + 'ftyp'
    0x68,
    0x65,
    0x69,
    0x63, // major brand 'heic'
    0x00,
    0x00,
    0x00,
    0x00, // minor version
    0x6d,
    0x69,
    0x66,
    0x31,
    0x68,
    0x65,
    0x69,
    0x63, // compatible brands
  ]);
  writeFileSync(
    join(MEDIA, "iphone.heic"),
    Buffer.concat([brand, Buffer.alloc(2048, 0x11)]),
  );

  // 5. Not an image at all, wearing an image's extension.
  writeFileSync(
    join(MEDIA, "not-an-image.jpg"),
    Buffer.from("это просто текст, а не фотография"),
  );

  console.log(`Фикстуры записаны в ${MEDIA}`);
}

void main();
