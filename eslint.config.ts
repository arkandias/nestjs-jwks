import eslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tsEslint, { type ConfigArray } from "typescript-eslint";

const config: ConfigArray = defineConfig(
  {
    name: "global-ignores",
    ignores: ["**/dist/", "**/*.d.ts"],
  },
  {
    name: "base-rules",
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      tsEslint.configs.strictTypeChecked,
      tsEslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.node,
      parser: tsEslint.parser,
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.ts"],
        },
      },
    },
    rules: {
      "no-duplicate-imports": "error",
      // https://typescript-eslint.io/troubleshooting/faqs/eslint#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
      "no-undef": "off",
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-extraneous-class": [
        "error",
        { allowWithDecorator: true },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowAny: true,
          allowBoolean: true,
          allowNullish: true,
          allowNumber: true,
          allowRegExp: true,
          allow: [{ name: ["Error", "URL", "URLSearchParams"], from: "lib" }],
        },
      ],
    },
  },
  {
    name: "prettier-compatibility",
    ...eslintConfigPrettier,
  },
);

export default config;
