// Flat ESLint config. The `sim` block encodes determinism guardrails:
// no ambient randomness, no wall-clock, no DOM, and no engine-unstable
// transcendentals in the deterministic core. These FAIL CI.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

const DETERMINISM_BANNED_PROPERTIES = [
  { object: "Math", property: "random", message: "Use the seeded PRNG (rng) — Math.random breaks determinism." },
  { object: "Date", property: "now", message: "No wall-clock in sim — time comes from tick count." },
  { object: "performance", property: "now", message: "No wall-clock in sim." },
  // Transcendentals are not bit-identical across JS engines → cross-platform desync.
  // Use vector math (dot product) / project-owned approximations in simMath instead.
  { object: "Math", property: "cos", message: "Banned in sim: use wind-vector dot product (engine-unstable across platforms)." },
  { object: "Math", property: "sin", message: "Banned in sim: use vector math (engine-unstable across platforms)." },
  { object: "Math", property: "tan", message: "Banned in sim (engine-unstable across platforms)." },
  { object: "Math", property: "acos", message: "Banned in sim (engine-unstable across platforms)." },
  { object: "Math", property: "asin", message: "Banned in sim (engine-unstable across platforms)." },
  { object: "Math", property: "atan2", message: "Banned in sim (engine-unstable across platforms)." },
  { object: "Math", property: "exp", message: "Banned in sim (engine-unstable across platforms)." },
  { object: "Math", property: "pow", message: "Banned in sim: use explicit multiplication or integer exponentiation." },
  { object: "Math", property: "hypot", message: "Banned in sim: compare squared distances; hypot is engine-unstable." },
];

const DETERMINISM_BANNED_GLOBALS = [
  { name: "window", message: "No DOM in sim." },
  { name: "document", message: "No DOM in sim." },
  { name: "requestAnimationFrame", message: "No render loop in sim." },
];

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/*.tsbuildinfo", "**/playwright-report/**", "**/test-results/**", "**/*.cjs", "e2e/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Intentionally-unused names are marked with a leading underscore.
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Deterministic core — strictest rules.
    files: ["packages/sim/src/**/*.ts"],
    ignores: ["packages/sim/src/**/simMath.ts"],
    rules: {
      "no-restricted-properties": ["error", ...DETERMINISM_BANNED_PROPERTIES],
      "no-restricted-globals": ["error", ...DETERMINISM_BANNED_GLOBALS],
    },
  },
  {
    // Tests may relax some rules.
    files: ["**/*.test.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
