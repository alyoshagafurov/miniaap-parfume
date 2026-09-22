import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Server-side logic only. Nothing here boots Next, so these stay fast
    // enough to run on every save.
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    coverage: {
      include: ["src/lib/**", "src/server/**"],
    },
  },
  resolve: {
    alias: { "@": new URL("./src", import.meta.url).pathname },
  },
});
