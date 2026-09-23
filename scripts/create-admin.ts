/**
 * Creates or updates an administrator.
 *
 * The only way an administrator comes into existence. There is deliberately no
 * self-service registration and no "first visitor becomes owner" — this catalog
 * has a handful of administrators who are known people, and a signup form on a
 * wholesale back office is a door that exists only to be tried.
 *
 *   pnpm admin:create --login magomed --telegram 123456789 --name "Магомед" \
 *     --role OWNER --password '...'
 *
 * Without --password one is generated and printed once. It is never stored
 * anywhere but as an argon2id hash.
 */

import { randomBytes } from "node:crypto";

import { loadDotEnv } from "../src/lib/env";
import { hashPassword } from "../src/server/auth/password";
import { prisma } from "../src/server/db";

loadDotEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  console.error(
    "  pnpm admin:create --login <логин> --telegram <id> --name <имя> " +
      "[--role OWNER|EDITOR] [--password <пароль>]\n",
  );
  process.exit(1);
}

async function main() {
  const login = arg("login")?.trim().toLowerCase();
  const telegram = arg("telegram")?.trim();
  const name = arg("name")?.trim();
  const role = (arg("role") ?? "OWNER").toUpperCase();

  if (!login || !/^[a-z0-9._-]{3,32}$/.test(login)) {
    fail("--login: 3–32 символа, латиница, цифры, точка, дефис, подчёркивание");
  }
  if (!telegram || !/^\d{5,20}$/.test(telegram)) {
    fail("--telegram: числовой Telegram ID администратора");
  }
  if (!name) fail("--name: имя, которое увидят в админке");
  if (role !== "OWNER" && role !== "EDITOR") fail("--role: OWNER или EDITOR");

  // 18 bytes of base64url is ~24 characters of real entropy — long enough that
  // the generated password is never the weak link, short enough to retype once.
  const generated = arg("password") ? undefined : randomBytes(18).toString("base64url");
  const password = arg("password") ?? generated;
  if (!password || password.length < 10) fail("--password: не короче 10 символов");

  const passwordHash = await hashPassword(password);
  const telegramId = BigInt(telegram);

  // Upsert on the allow-list key, not on the login: one Telegram account is one
  // administrator, and re-running this must reset that person's password rather
  // than fail or quietly create a second row for the same human.
  const admin = await prisma.adminUser.upsert({
    where: { telegramId },
    update: { login, name, role, passwordHash, isActive: true },
    create: { telegramId, login, name, role, passwordHash },
    select: { id: true, login: true, name: true, role: true },
  });

  console.log(`\n  Администратор: ${admin.name} (${admin.login}), роль ${admin.role}`);
  if (generated) {
    console.log(`  Пароль: ${generated}`);
    console.log("  Он показан один раз — сохраните его сейчас.\n");
  } else {
    console.log("  Пароль установлен.\n");
  }

  await prisma.$disconnect();
}

void main().catch(async (error: unknown) => {
  // The message may carry the argument list; the password is never in it,
  // because it is hashed before anything that can throw.
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
