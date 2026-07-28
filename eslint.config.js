import react from "@eslint-react/eslint-plugin";
import js from "@eslint/js";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginRouter from "@tanstack/eslint-plugin-router";
import eslintConfigPrettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const { plugins, ...reactHooksConfig } = reactHooks.configs.recommended;

export default tseslint.config({
  // Global ignores — must be a config object with ONLY `ignores`, otherwise
  // ESLint treats them as scoped to this object and still descends into the
  // directories (and loads any nested eslint.config.* it finds there).
  ignores: ["dist", ".wrangler", ".vercel", ".netlify", ".output", ".nitro", ".nitro/**", "build/", "bmad-temp/", "bmad-temp/**"],
}, {
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
    // React-compiler advisory rules: valuable signal, but treat as warnings —
    // "fixing" them in the audio-critical hooks means risky refactors of
    // intentional patterns (latest-ref, hydration-safe setState, rAF loops).
    "react-hooks/set-state-in-effect": "warn",
    "react-hooks/purity": "warn",
    "react-hooks/preserve-manual-memoization": "warn",
    "@typescript-eslint/no-deprecated": "warn",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
      },
    ],
  },
});
