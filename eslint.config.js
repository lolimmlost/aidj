import react from "@eslint-react/eslint-plugin";
import js from "@eslint/js";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const { plugins, ...reactHooksConfig } = reactHooks.configs.recommended;

export default tseslint.config({
  ignores: ["dist", ".wrangler", ".vercel", ".netlify", ".output", "build/"],
  files: ["**/*.{ts,tsx}"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    "react-hooks": reactHooks,
  },
  extends: [
    js.configs.recommended,
    ...tseslint.configs.recommended,
    eslintConfigPrettier,
    ...pluginQuery.configs["flat/recommended"],
    ...pluginRouter.configs["flat/recommended"],
    reactHooksConfig,
    react.configs["recommended-type-checked"],
    // ...you can add plugins or configs here
  ],
  rules: {
    // You can override any rules here
    "@typescript-eslint/no-deprecated": "warn",
  },
});
