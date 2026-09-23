import { defineConfig, env } from "prisma/config";

// Prisma 7 no longer loads .env itself, and no longer accepts `url` inside
// schema.prisma. Node's built-in loader keeps this dependency-free.
//
// In a try, because `?.` guards the function being missing and not the file:
// loadEnvFile throws ENOENT when there is no .env, and in a container there is
// none — the variables come from the environment. Without this, every
// `prisma migrate deploy` in production failed before it read a single
// migration.
try {
  process.loadEnvFile?.(".env");
} catch {
  // Configured from the real environment, which is the production case.
}

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
