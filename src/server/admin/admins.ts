import { hashPassword } from "@/server/auth/password";
import { requireAdminPage, requirePermission } from "@/server/auth/roles";
import { prisma } from "@/server/db";

/**
 * The administrators.
 *
 * Presence here is the allow-list: the Telegram id is what the Mini App login
 * checks against, and the browser login sends the code to it. A password is
 * always required as well — a phone left on a counter is exactly the case the
 * second factor guards.
 *
 * `telegramId` is a string in every shape below, and that is not cosmetic. It
 * is a BigInt in the database, and a BigInt does not cross into a client
 * component or through JSON.stringify — it throws, at runtime, on the screen
 * that needs it. This is the screen the review flagged; it is handled here
 * rather than discovered there.
 */

export interface AdminRow {
  id: string;
  login: string;
  name: string;
  /** Stringified BigInt. Never the BigInt itself. */
  telegramId: string;
  role: "OWNER" | "EDITOR";
  isActive: boolean;
  createdAt: Date;
}

export async function listAdmins(): Promise<AdminRow[]> {
  await requireAdminPage();
  const rows = await prisma.adminUser.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      login: true,
      name: true,
      telegramId: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({ ...row, telegramId: String(row.telegramId) }));
}

export interface AdminInput {
  login: string;
  name: string;
  telegramId: string;
  role: "OWNER" | "EDITOR";
  /** Empty on an edit means "leave the password alone". */
  password: string;
}

export class AdminConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminConflict";
  }
}

function parseTelegramId(value: string): bigint {
  const digits = value.trim();
  if (!/^\d{5,20}$/.test(digits)) {
    throw new AdminConflict("Telegram ID — это число. Его покажет бот по команде /admin.");
  }
  return BigInt(digits);
}

function normalizeLogin(value: string): string {
  const login = value.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(login)) {
    throw new AdminConflict(
      "Логин: 3–32 символа, латиница, цифры, точка, дефис, подчёркивание",
    );
  }
  return login;
}

export async function createAdmin(input: AdminInput): Promise<{ id: string }> {
  await requirePermission("admins:write");

  const login = normalizeLogin(input.login);
  const telegramId = parseTelegramId(input.telegramId);
  if (input.password.length < 10) {
    throw new AdminConflict("Пароль не короче 10 символов");
  }

  const clash = await prisma.adminUser.findFirst({
    where: { OR: [{ login }, { telegramId }] },
    select: { login: true },
  });
  if (clash) {
    throw new AdminConflict(
      clash.login === login ? "Такой логин уже занят" : "Этот Telegram ID уже в списке",
    );
  }

  const created = await prisma.adminUser.create({
    data: {
      login,
      name: input.name.trim(),
      telegramId,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
    select: { id: true },
  });
  return created;
}

export async function updateAdmin(id: string, input: AdminInput): Promise<void> {
  const session = await requirePermission("admins:write");

  const login = normalizeLogin(input.login);
  const telegramId = parseTelegramId(input.telegramId);

  const clash = await prisma.adminUser.findFirst({
    where: { id: { not: id }, OR: [{ login }, { telegramId }] },
    select: { login: true },
  });
  if (clash) {
    throw new AdminConflict(
      clash.login === login ? "Такой логин уже занят" : "Этот Telegram ID уже в списке",
    );
  }

  // Demoting yourself is how a project ends up with no owner at all, and the
  // only way back is the command line.
  if (session.adminId === id && input.role !== "OWNER") {
    throw new AdminConflict("Нельзя снять с себя роль владельца");
  }

  await prisma.adminUser.update({
    where: { id },
    data: {
      login,
      name: input.name.trim(),
      telegramId,
      role: input.role,
      // An empty field means "leave it": an edit of somebody's name must not
      // silently blank their password.
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
    },
  });
}

/**
 * Deactivating rather than deleting.
 *
 * An AdminUser is referenced by the login codes it was issued, and more to the
 * point the question "who changed this" only has an answer while the row
 * exists. `isActive: false` is checked by currentSession on every request, so
 * an administrator turned off mid-session stops being one on their next click
 * rather than in twelve hours when the cookie expires.
 */
export async function setAdminActive(id: string, isActive: boolean): Promise<void> {
  const session = await requirePermission("admins:write");

  if (session.adminId === id && !isActive) {
    throw new AdminConflict("Нельзя отключить самого себя");
  }

  if (!isActive) {
    const owners = await prisma.adminUser.count({
      where: { role: "OWNER", isActive: true, id: { not: id } },
    });
    if (owners === 0) {
      throw new AdminConflict("Это последний активный владелец — отключать некому будет вернуть");
    }
  }

  await prisma.adminUser.update({ where: { id }, data: { isActive } });
}
