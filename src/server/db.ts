import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * The Prisma client.
 *
 * Prisma 7 no longer reads the connection URL from schema.prisma — the client
 * takes a driver adapter and is given the URL here, while prisma.config.ts
 * supplies it to the migration CLI.
 *
 * Construction is lazy. Building the client at module scope would mean that
 * merely importing this file opens a connection pool and reads DATABASE_URL,
 * which breaks any script that loads .env in its own body: ES imports are
 * evaluated before the first statement runs, so the variable is not there yet.
 * Deferring to first use makes importing this module free of side effects.
 *
 * The instance is cached on globalThis so Next's dev hot reload reuses one pool
 * instead of opening a new one on every edit, which exhausts PostgreSQL's
 * connection limit within minutes of working on a page.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL не задан — проверьте .env");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // `query` logs include parameter values, which for orders means personal
    // data, so it is never enabled outside development.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function client(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const created = createClient();
    // In production the module scope is stable, so caching globally is only
    // needed to survive dev hot reload — but caching always keeps one code path.
    globalForPrisma.prisma = created;
  }
  return globalForPrisma.prisma;
}

/**
 * Behaves exactly like a PrismaClient; the underlying client is built on the
 * first property access. Methods are bound to the real instance so `this` is
 * correct once they leave the proxy.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const real = client();
    const value = Reflect.get(real, property) as unknown;
    return typeof value === "function" ? value.bind(real) : value;
  },
});
