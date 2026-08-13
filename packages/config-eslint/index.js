import js from "@eslint/js";
import tseslint from "typescript-eslint";

export const base = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // `**/` prefix matters: without it, these patterns only reliably match
    // relative to the config file's own directory, not the package cwd
    // `eslint .` is actually invoked from — which silently let built dist/
    // output through to lint whenever dist existed at lint time (e.g. lint
    // run locally after build, instead of CI's lint-before-build order).
    ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  }
);

export default base;
