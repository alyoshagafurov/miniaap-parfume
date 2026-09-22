import { randomInt } from "node:crypto";

import argon2 from "argon2";

/**
 * Passwords and one-time codes.
 *
 * argon2id, with OWASP's current minimum parameters. The `argon2` package is
 * used rather than `@node-rs/argon2`: the latter exports `Algorithm` as an
 * ambient const enum, which fails to compile under the `isolatedModules: true`
 * that Next writes into tsconfig, and `next build` fails the build on type
 * errors.
 */

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  // OWASP's second recommended configuration: 19 MiB, 2 iterations, 1 lane.
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Returns false rather than throwing for a stored value that is not a valid
 * hash. A corrupted or hand-edited row is an authentication failure, not a
 * 500 — and a login route that crashes on bad input is itself a signal an
 * attacker can read.
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * A six-digit login code.
 *
 * randomInt, not Math.random: this is a credential. Leading zeros are kept —
 * padding to six characters means all 10^6 values are reachable, where
 * formatting a number would quietly shrink the space to 900 000.
 */
export function generateLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Codes are hashed at rest, like passwords.
 *
 * argon2 is slower than a six-digit search space warrants, but the attempt
 * counter caps guesses at five and the code lives five minutes, so the cost is
 * paid a handful of times and the stored value is never a credential someone
 * can read out of the database.
 */
export async function hashLoginCode(code: string): Promise<string> {
  return argon2.hash(code, ARGON2_OPTIONS);
}

export async function verifyLoginCode(hash: string, code: string): Promise<boolean> {
  return verifyPassword(hash, code);
}
