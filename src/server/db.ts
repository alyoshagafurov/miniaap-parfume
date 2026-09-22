import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * The Prisma client.
 *
 * Prisma 7 no longer reads the connection URL from schema.prisma — the client
 * is constructed with a driver adapter and the URL is supplied here, while
 * prisma.config.ts supplies it to the migration CLI.
 *
 * A single instance is cached on globalThis so Next's dev-mode hot reload does
 * not open a new connection pool on every edit, which exhausts PostgreSQL's
 * connection limit within a few minutes of working on a page.
 */

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL не задан — проверьте .env");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    // Queries are logged in development only. `query` includes parameter
    // values, which for orders means personal data, so it must never be on in
    // production.
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
