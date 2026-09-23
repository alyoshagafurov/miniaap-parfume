import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Money, ids and Telegram ids are easy to widen by accident.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    /**
     * The bot process boundary.
     *
     * The bot has no Next request context: a `'use cache'` function throws the
     * moment it runs, and `next/*` is unavailable. This rule gives the feedback
     * in the editor; `pnpm check:bot-boundary` walks the real import graph and
     * is what actually catches a violation three modules deep.
     */
    files: [
      "src/bot/**",
      "src/server/settings.ts",
      "src/server/db.ts",
      "src/server/db-health.ts",
      "src/server/rate-limit.ts",
      "src/server/telegram/**",
      "src/server/orders/quote.ts",
      "src/lib/**",
    ],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message:
                "Процесс бота работает без Next. Вынесите это в отдельный модуль " +
                "и импортируйте только из React-компонентов (как settings.cached.ts).",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ExpressionStatement > Literal[value='use cache']",
          message:
            "Директива 'use cache' бросит в процессе бота — у него нет контекста запроса Next.",
        },
      ],
    },
  },
  {
    // CLI scripts and seeds report progress on stdout; that is their interface.
    files: ["scripts/**", "prisma/seed.ts", "src/bot/index.ts", "*.config.*"],
    rules: { "no-console": "off" },
  },
  {
    // The end-to-end suite. No React here at all — but Playwright's fixtures
    // are written as `async ({ page }, use) => { … await use(value) }`, and the
    // hooks rule sees a bare call named `use` inside a function that is not a
    // component and reports every fixture in the harness as a misplaced hook.
    // It is the same word, not the same thing.
    //
    // The suite also prints: which counters it cleared, what it wrote where.
    // A test harness that runs for a minute and says nothing is worse.
    files: ["qa/e2e/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "no-console": "off",
    },
  },
]);
