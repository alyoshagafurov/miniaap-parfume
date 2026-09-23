import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/server/db";

import {
  COOKIE_NAME,
  verifySession,
  type AdminRoleName,
  type SessionPayload,
} from "./session";

/**
 * Authorisation.
 *
 * Every Server Action calls one of the guards below. Not the proxy — the proxy
 * keeps unauthenticated visitors off the admin pages, which is a convenience,
 * but a Server Action is a POST endpoint that can be invoked directly with the
 * page never rendered. Checking only in the proxy means checking nowhere that
 * matters.
 */

export const ALL_PERMISSIONS = [
  "catalog:write",
  "orders:write",
  "settings:write",
  "admins:write",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

/**
 * OWNER does everything. EDITOR runs the catalog and the requests, which is the
 * day-to-day work, but cannot change the contacts and order minimum the
 * storefront reads from Settings, and cannot alter the administrator
 * allow-list.
 */
const ROLE_PERMISSIONS: Record<AdminRoleName, readonly Permission[]> = {
  OWNER: ALL_PERMISSIONS,
  EDITOR: ["catalog:write", "orders:write"],
};

/**
 * Deliberately total and deliberately closed: an unrecognised role or
 * permission is denied rather than falling through. A role could arrive from a
 * cookie signed before a future migration, and "unknown means allowed" is how
 * privilege escalation happens quietly.
 */
export function can(role: AdminRoleName, permission: Permission): boolean {
  const granted = ROLE_PERMISSIONS[role];
  if (!granted) return false;
  return granted.includes(permission);
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Требуется вход в админ-панель");
    this.name = "NotAuthenticatedError";
  }
}

export class NotAuthorisedError extends Error {
  constructor(permission: Permission) {
    super(`Недостаточно прав: ${permission}`);
    this.name = "NotAuthorisedError";
  }
}

/**
 * The signed-in administrator, or null.
 *
 * The cookie is signed, so its contents are trustworthy — but it is re-checked
 * against the database on every call, because a cookie issued twelve hours ago
 * says nothing about whether that administrator has since been deactivated or
 * had their role reduced. The role from the database wins over the role in the
 * cookie for exactly that reason.
 */
export async function currentSession(): Promise<SessionPayload | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const session = verifySession(token, secret);
  if (!session) return null;

  const admin = await prisma.adminUser.findFirst({
    where: { id: session.adminId, isActive: true },
    select: { id: true, role: true },
  });
  if (!admin) return null;

  return { adminId: admin.id, role: admin.role };
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await currentSession();
  if (!session) throw new NotAuthenticatedError();
  return session;
}

/**
 * The guard a page or a read for a page calls.
 *
 * Redirects where requireAdmin throws, and the difference is deliberate. Next
 * renders a layout and the page beneath it concurrently, so the layout's own
 * redirect does not stop the page from running first — with requireAdmin, every
 * unauthenticated visit to the panel threw before the redirect landed, which
 * works but fills the log with errors that are not errors and would surface an
 * error screen the moment a redirect lost the race.
 *
 * A Server Action must keep throwing: an action that quietly redirects looks to
 * its caller like an action that succeeded.
 */
export async function requireAdminPage(): Promise<SessionPayload> {
  const session = await currentSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** The guard every Server Action that changes something must call. */
export async function requirePermission(
  permission: Permission,
): Promise<SessionPayload> {
  const session = await requireAdmin();
  if (!can(session.role, permission)) throw new NotAuthorisedError(permission);
  return session;
}
