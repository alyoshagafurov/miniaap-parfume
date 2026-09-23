"use server";

import { headers } from "next/headers";
import { z } from "zod";

import {
  confirmLoginCode,
  loginFromBrowser,
  loginFromTelegram,
  logout as endSession,
  type CodeResult,
  type LoginResult,
} from "@/server/auth/authenticate";

/**
 * The login endpoints.
 *
 * Every argument arrives as `unknown` and is parsed here. These are the only
 * Server Actions in the admin panel that do not begin with a permission check —
 * they are how permission is obtained — so everything else about them is
 * deliberately narrow.
 */

const Credentials = z.object({
  login: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
  initDataRaw: z.string().max(4096).optional(),
});

const Code = z.object({
  login: z.string().trim().min(1).max(64),
  code: z.string().trim().regex(/^\d{6}$/),
});

/** Never logged and never echoed: it is what an attacker is probing for. */
const GENERIC = "Неверный логин или пароль";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function login(input: unknown): Promise<LoginResult> {
  const parsed = Credentials.safeParse(input);
  if (!parsed.success) return { outcome: "REJECT", message: GENERIC };

  const ip = await clientIp();
  const { login: id, password, initDataRaw } = parsed.data;

  // Inside Telegram the launch string is the second factor and the session is
  // issued at once; in a browser there is nothing to prove who is at it, so the
  // password only earns a code.
  return initDataRaw
    ? loginFromTelegram({ login: id, password, initDataRaw, ip })
    : loginFromBrowser({ login: id, password, ip });
}

export async function confirmCode(input: unknown): Promise<CodeResult> {
  const parsed = Code.safeParse(input);
  if (!parsed.success) return { outcome: "REJECT", message: "Неверный код" };

  return confirmLoginCode({ ...parsed.data, ip: await clientIp() });
}

export async function logout(): Promise<void> {
  await endSession();
}
