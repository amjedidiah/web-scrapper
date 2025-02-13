import { includeIgnoreFile } from "@eslint/compat";
import pluginJs from "@eslint/js";
import configPrettier from "eslint-config-prettier";
import pluginPrettier from "eslint-plugin-prettier";
import globals from "globals";
import { resolve } from "path";
import tseslint from "typescript-eslint";

const gitignorePath = resolve("./.gitignore");

/** @type {import('eslint').Linter.Config[]} */
export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  { languageOptions: { globals: globals.node } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  includeIgnoreFile(gitignorePath), // exclude paths in gitignore
  configPrettier, // Disable ESLint rules that conflict with Prettier. Must come before prettier plugin
  {
    plugins: {
      prettier: pluginPrettier,
    },
    rules: {
      "prettier/prettier": "error", // Show Prettier errors as ESLint errors
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
