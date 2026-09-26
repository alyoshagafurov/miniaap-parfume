"use server";

import { z } from "zod";

import { requirePermission } from "@/server/auth/roles";
import {
  ADMIN_FIELDS,
  AdminConflict,
  createAdmin,
  setAdminActive,
  updateAdmin,
  type AdminFieldErrors,
} from "@/server/admin/admins";

/**
 * The administrator allow-list.
 *
 * `admins:write`, which only an OWNER has — an EDITOR runs the catalog and the
 * requests and cannot add someone who can do more than they can.
 */

export type AdminResult =
  { ok: true } | { ok: false; message: string; fields?: AdminFieldErrors };

/**
 * The shape of the form, and nothing more.
 *
 * Types and length caps only. What makes a login, a Telegram ID or a password
 * acceptable is admins.ts's to say, because that module is reachable from
 * places other than this action — and because it says which field is wrong.
 * This schema used to repeat two of those rules, and a value that broke them
 * stopped here with «Проверьте заполнение формы» instead of the reason.
 */
const Fields = z.object({
  login: z.string().trim().max(64),
  name: z.string().trim().max(120),
  telegramId: z.string().trim().max(32),
  role: z.enum(["OWNER", "EDITOR"]),
  // Never trimmed, never logged, never echoed back to the screen. Empty means
  // "leave the existing one alone" on an edit.
  password: z.string().max(200).default(""),
});

const Input = z.object({
  id: z.string().min(1).max(64).nullish(),
  fields: z.unknown(),
});

/**
 * The caps' words, in Russian.
 *
 * Only a cap can fail from the form itself; the other issues — a number where
 * a string belongs, a role that is not one — take a hand-made request, and
 * whoever sends one does not need the details.
 */
const shapeError: z.core.$ZodErrorMap = (issue) =>
  issue.code === "too_big"
    ? `Не длиннее ${String(issue.maximum)} символов`
    : "Некорректное значение";

async function run(work: () => Promise<unknown>): Promise<AdminResult> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminConflict) {
      return { ok: false, message: error.message, fields: error.fields };
    }
    return { ok: false, message: "Не удалось сохранить" };
  }
}

export async function saveAdmin(input: unknown): Promise<AdminResult> {
  await requirePermission("admins:write");
  const outer = Input.safeParse(input);
  if (!outer.success) return { ok: false, message: "Некорректный запрос" };

  const parsed = Fields.safeParse(outer.data.fields, { error: shapeError });
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors;
    const fields: AdminFieldErrors = {};
    for (const field of ADMIN_FIELDS) {
      const first = flat[field]?.[0];
      if (first) fields[field] = first;
    }
    const message = ADMIN_FIELDS.map((field) => fields[field]).find(Boolean);
    return { ok: false, message: message ?? "Некорректный запрос", fields };
  }

  const { id } = outer.data;
  return run(() => (id ? updateAdmin(id, parsed.data) : createAdmin(parsed.data)));
}

export async function toggleAdmin(input: unknown): Promise<AdminResult> {
  await requirePermission("admins:write");
  const parsed = z
    .object({ id: z.string().min(1).max(64), isActive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };

  return run(() => setAdminActive(parsed.data.id, parsed.data.isActive));
}
