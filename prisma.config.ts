import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer loads .env itself, and no longer accepts `url` inside
// schema.prisma. Node's built-in loader keeps this dependency-free.
process.loadEnvFile?.(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
