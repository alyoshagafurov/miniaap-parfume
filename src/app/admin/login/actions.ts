"use server";

import { z } from "zod";

import { clientIp } from "@/server/client-ip";
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



export async function login(input: unknown): Promise<LoginResult> {
  const parsed = Credentials.safeParse(input);
  if (!parsed.success) return { outcome: "REJECT", message: GENERIC };

  const ip = await clientIp();
  // An unattributable request is refused rather than sharing one bucket with
  // every other unattributable request.
  if (!ip) return { outcome: "RATE_LIMITED", message: "Сервис временно недоступен." };
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

  const ip = await clientIp();
  if (!ip) return { outcome: "REJECT", message: "Сервис временно недоступен." };

  return confirmLoginCode({ ...parsed.data, ip });
}

export async function logout(): Promise<void> {
  await endSession();
}
