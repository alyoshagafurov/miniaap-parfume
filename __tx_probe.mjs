import { startPrismaDevServer } from "/Users/mobisop/TG mini app for parfums/node_modules/.pnpm/@prisma+dev@0.24.17_typescript@5.9.3/node_modules/@prisma/dev/dist/index.js";
import { execFile } from "node:child_process"; import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
const pexec = promisify(execFile);
const server = await startPrismaDevServer({ name: "arumi-tx", persistenceMode: "stateless", port: 0, databasePort: 0, shadowDatabasePort: 0 });
const url = server.database.connectionString;
await pexec("npx", ["prisma", "migrate", "deploy"], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url } });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
class Rollback extends Error {}
let inside = null;
try {
  await prisma.$transaction(async (tx) => {
    await tx.brand.create({ data: { name: "TESTBRAND", slug: "testbrand" } });
    inside = await tx.brand.count();
    throw new Rollback();
  }, { timeout: 15000 });
} catch (e) { if (!(e instanceof Rollback)) console.log("ERR:", String(e.message).slice(0, 500)); }
console.log("count inside tx:", inside, "| count after rollback:", await prisma.brand.count());
await prisma.$disconnect(); await server.close();
