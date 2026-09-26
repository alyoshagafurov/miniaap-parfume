import { hashPassword } from "@/server/auth/password";
import { requirePermission } from "@/server/auth/roles";
import { prisma } from "@/server/db";

/**
 * The administrators.
 *
 * Presence here is the allow-list: the Telegram id is what the Mini App login
 * checks against and what the bot recognises before it shows the «Админ-панель»
 * button. A password is always required as well — a phone left on a counter is
 * exactly the case the second factor guards.
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

/**
 * The form's fields, in the order the form shows them.
 *
 * A refusal names the field it is about, so the screen can put the reason under
 * that field. «Проверьте заполнение формы» over five fields was the whole
 * explanation before, and the owner adding a manager had to guess which of the
 * five was wrong.
 */
export const ADMIN_FIELDS = [
  "name",
  "login",
  "telegramId",
  "role",
  "password",
] as const;
export type AdminField = (typeof ADMIN_FIELDS)[number];
export type AdminFieldErrors = Partial<Record<AdminField, string>>;

export class AdminConflict extends Error {
  /** Empty when the refusal is about the account, not about one field. */
  readonly fields: AdminFieldErrors;

  constructor(message: string, fields: AdminFieldErrors = {}) {
    super(message);
    this.name = "AdminConflict";
    this.fields = fields;
  }
}

/** One refusal per field at once, led by the first in the form's order. */
function fieldConflict(fields: AdminFieldErrors): AdminConflict {
  const first = ADMIN_FIELDS.map((field) => fields[field]).find(Boolean);
  return new AdminConflict(first ?? "Проверьте поля формы", fields);
}

/**
 * Where a Telegram id comes from.
 *
 * Telegram's own interface never shows a person their numeric id, so every
 * message that asks for one says how to get it: the bot answers /id with it.
 * This used to point at /admin, which answers a stranger with «only for
 * administrators» and no number — a dead end for exactly the person being
 * added.
 */
const TELEGRAM_ID_SOURCE = "Человек узнает его, отправив нашему боту /id.";

function telegramIdProblem(digits: string): string | null {
  if (digits === "") return `Укажите Telegram ID. ${TELEGRAM_ID_SOURCE}`;
  if (!/^\d{5,20}$/.test(digits)) {
    return `Telegram ID — это число, а не @имя. ${TELEGRAM_ID_SOURCE}`;
  }
  return null;
}

const LOGIN_RULE = "Логин: 3–32 символа, латиница, цифры, точка, дефис, подчёркивание";

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

function passwordProblem(
  password: string,
  { allowEmpty }: { allowEmpty: boolean },
): string | null {
  if (allowEmpty && password === "") return null;
  if (password.length < MIN_PASSWORD) {
    return `Пароль не короче ${MIN_PASSWORD} символов`;
  }
  return null;
}

/**
 * Every rule for the fields, checked together.
 *
 * All of them rather than the first: a form that reports one mistake per press
 * of «Сохранить» turns three mistakes into three round trips. The rules live
 * here and not in the action's schema because this module is reachable from
 * places other than that action, and a rule stated twice drifts.
 */
function checkInput(
  input: AdminInput,
  { allowEmptyPassword }: { allowEmptyPassword: boolean },
): { login: string; name: string; telegramId: bigint } {
  const errors: AdminFieldErrors = {};

  const name = input.name.trim();
  if (name === "") errors.name = "Укажите имя";

  const login = input.login.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(login)) errors.login = LOGIN_RULE;

  const digits = input.telegramId.trim();
  const telegramId = telegramIdProblem(digits);
  if (telegramId) errors.telegramId = telegramId;

  const password = passwordProblem(input.password, { allowEmpty: allowEmptyPassword });
  if (password) errors.password = password;

  if (Object.keys(errors).length > 0) throw fieldConflict(errors);
  return { login, name, telegramId: BigInt(digits) };
}

/** A login or a Telegram id somebody else already has. */
function clashConflict(clashLogin: string, login: string): AdminConflict {
  return clashLogin === login
    ? fieldConflict({ login: "Такой логин уже занят" })
    : fieldConflict({ telegramId: "Этот Telegram ID уже в списке" });
}

export async function createAdmin(input: AdminInput): Promise<{ id: string }> {
  await requirePermission("admins:write");

  const { login, name, telegramId } = checkInput(input, { allowEmptyPassword: false });

  const clash = await prisma.adminUser.findFirst({
    where: { OR: [{ login }, { telegramId }] },
    select: { login: true },
  });
  if (clash) throw clashConflict(clash.login, login);

  const created = await prisma.adminUser.create({
    data: {
      login,
      name,
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

  const { login, name, telegramId } = checkInput(input, { allowEmptyPassword: true });

  const clash = await prisma.adminUser.findFirst({
    where: { id: { not: id }, OR: [{ login }, { telegramId }] },
    select: { login: true },
  });
  if (clash) throw clashConflict(clash.login, login);

  // Demoting yourself is how a project ends up with no owner at all, and the
  // only way back is the command line.
  if (session.adminId === id && input.role !== "OWNER") {
    throw fieldConflict({ role: "Нельзя снять с себя роль владельца" });
  }

  await prisma.adminUser.update({
    where: { id },
    data: {
      login,
      name,
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
      throw new AdminConflict(
        "Это последний активный владелец — отключать некому будет вернуть",
      );
    }
  }

  await prisma.adminUser.update({ where: { id }, data: { isActive } });
}
