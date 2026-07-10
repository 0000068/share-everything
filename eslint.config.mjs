import js from "@eslint/js";
import globals from "globals";

const sharedRules = {
  "no-console": "off",
  "no-duplicate-imports": "error",
  "no-unused-vars": ["error", {
    argsIgnorePattern: "^_",
    caughtErrors: "none",
    ignoreRestSiblings: true,
  }],
  "no-var": "error",
  "object-shorthand": ["error", "always"],
  "prefer-const": "error",
};

export default [
  {
    ignores: [
      ".claude/**",
      ".git/**",
      ".vercel/**",
      "dist/**",
      "node_modules/**",
      ".output/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["api/**/*.js", "server/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
      sourceType: "commonjs",
    },
    rules: sharedRules,
  },
  {
    files: ["js/**/*.js"],
    ignores: ["js/app.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.browser,
      sourceType: "script",
    },
    rules: sharedRules,
  },
  {
    files: [
      "js/notion-article-renderer.js",
      "js/notion-content-shared.js",
      "js/notion-content-url.js",
      "js/notion-content-utils.js",
      "js/notion-content.js",
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.commonjs,
      },
    },
  },
  {
    files: ["js/app.js"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.browser,
      sourceType: "module",
    },
    rules: sharedRules,
  },
  {
    files: ["scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
      sourceType: "module",
    },
    rules: sharedRules,
  },
];
