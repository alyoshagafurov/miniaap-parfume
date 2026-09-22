import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**"]),
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: "Inject a clock instead of new Date()." },
      ],
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
]);
