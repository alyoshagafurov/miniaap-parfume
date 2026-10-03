/**
 * Puts the client's details into the settings row of a fresh database.
 *
 *   pnpm settings:init
 *
 * A database that has never been seeded has no settings row, and the
 * application then falls back to defaults that are empty on purpose — no
 * address, no telephone, no greeting. The home screen loses its contact
 * buttons and the bot answers «Здравствуйте.» and nothing more. This writes
 * the client's details from prisma/seed-data.ts, which is where such details
 * are allowed to live.
 *
 * It is not the seed. The seed also writes a demo catalog, which production
 * must never receive; this writes one row.
 *
 * Safe to repeat. With no row it creates one. With a row it fills only the
 * fields that are empty and leaves everything the owner typed alone — see
 * src/lib/settings-init.ts. Nothing it prints is anything but field names.
 */

import { CLIENT_SETTINGS } from "../prisma/seed-data";
import { loadDotEnv } from "../src/lib/env";
import { emptyFieldsToFill, FILLABLE } from "../src/lib/settings-init";
import { prisma } from "../src/server/db";

loadDotEnv();

async function main() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });

  if (!existing) {
    await prisma.settings.create({ data: { id: 1, ...CLIENT_SETTINGS } });
    console.log(
      "\n  Настройки созданы: контакты, условия доставки и приветствие бота.\n",
    );
    return;
  }

  const fill = emptyFieldsToFill(existing, CLIENT_SETTINGS);
  const fields = FILLABLE.filter((field) => field in fill);
  if (fields.length === 0) {
    console.log("\n  Всё уже заполнено — ничего не изменено.\n");
    return;
  }

  await prisma.settings.update({ where: { id: 1 }, data: fill });
  console.log(`\n  Заполнены пустые поля: ${fields.join(", ")}.`);
  console.log("  Всё, что уже было вписано в «Настройках», осталось как есть.\n");
}

void main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
