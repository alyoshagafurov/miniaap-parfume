"use server";

import { z } from "zod";

import { requirePermission } from "@/server/auth/roles";
import {
  AdminConflict,
  createAdmin,
  setAdminActive,
  updateAdmin,
} from "@/server/admin/admins";

/**
 * The administrator allow-list.
 *
 * `admins:write`, which only an OWNER has — an EDITOR runs the catalog and the
 * requests and cannot add someone who can do more than they can.
 */

export type AdminResult = { ok: true } | { ok: false; message: string };

const Fields = z.object({
  login: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  telegramId: z.string().trim().min(1).max(32),
  role: z.enum(["OWNER", "EDITOR"]),
  // Never trimmed, never logged, never echoed back to the screen. Empty means
  // "leave the existing one alone" on an edit; anything else meets the floor.
  // The same rule is enforced in admins.ts, because that module is reachable
  // from places other than this action.
  password: z
    .string()
    .max(200)
    .default("")
    .refine((v) => v === "" || v.length >= 10, "Пароль не короче 10 символов"),
});

async function run(work: () => Promise<unknown>): Promise<AdminResult> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    if (error instanceof AdminConflict) return { ok: false, message: error.message };
    return { ok: false, message: "Не удалось сохранить" };
  }
}

export async function saveAdmin(input: unknown): Promise<AdminResult> {
  await requirePermission("admins:write");
  const parsed = z
    .object({ id: z.string().min(1).max(64).nullish(), fields: Fields })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Проверьте заполнение формы" };

  const { id, fields } = parsed.data;
  return run(() => (id ? updateAdmin(id, fields) : createAdmin(fields)));
}

export async function toggleAdmin(input: unknown): Promise<AdminResult> {
  await requirePermission("admins:write");
  const parsed = z
    .object({ id: z.string().min(1).max(64), isActive: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Некорректный запрос" };

  return run(() => setAdminActive(parsed.data.id, parsed.data.isActive));
}
