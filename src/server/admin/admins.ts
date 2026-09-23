import { hashPassword } from "@/server/auth/password";
import { requirePermission } from "@/server/auth/roles";
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
  // admins:write, not merely "signed in". login.ts goes out of its way not to
  // tell an anonymous caller which Telegram ids are administrators; handing an
  // EDITOR the whole list — logins, names, ids, roles — contradicts that for no
  // reason, since an EDITOR cannot change any of it.
  await requirePermission("admins:write");
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

/**
 * The password floor, in one place.
 *
 * It lived only in createAdmin, so an OWNER editing anyone — including
 * themselves — could set a one-character password and nothing refused it.
 * Against a limiter of ten attempts per ten minutes that is hours of work, and
 * saveAdmin takes `unknown`, so the schema was the only other gate and it had
 * no minimum either.
 *
 * An empty string is the documented "leave the existing password alone", and
 * only reaches here from the edit path.
 */
const MIN_PASSWORD = 10;

function assertPassword(password: string, { allowEmpty }: { allowEmpty: boolean }): void {
  if (allowEmpty && password === "") return;
  if (password.length < MIN_PASSWORD) {
    throw new AdminConflict(`Пароль не короче ${MIN_PASSWORD} символов`);
  }
}

export async function createAdmin(input: AdminInput): Promise<{ id: string }> {
  await requirePermission("admins:write");

  const login = normalizeLogin(input.login);
  const telegramId = parseTelegramId(input.telegramId);
  assertPassword(input.password, { allowEmpty: false });

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
  assertPassword(input.password, { allowEmpty: true });

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
