import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "data/runs/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: false },
      globals: { ...globals.node, ...globals.browser }
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["fixtures/**/*.js"],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ["scripts/**/*.{js,mjs}", "apps/server/scripts/**/*.{js,mjs}"],
    languageOptions: { globals: globals.node }
  },
  {
    files: ["scripts/ui-*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  }
);
