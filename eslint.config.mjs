import eslint from "@eslint/js";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

const typescriptRecommended = {
  plugins: {
    "@typescript-eslint": tseslintPlugin
  },
  rules: {
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/no-namespace": "off",
    "@typescript-eslint/no-empty-object-type": "off"
  }
};

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.d.ts",
      "**/*.map",
      "**/src/*.js",
      ".env",
      ".env.local",
      ".env.example"
    ]
  },
  eslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: "module",
        project: [
          "./apps/*/tsconfig.json",
          "./packages/*/tsconfig.json",
          "./plugins/*/tsconfig.json"
        ]
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    ...typescriptRecommended,
    plugins: {
      "@typescript-eslint": tseslintPlugin,
      import: importPlugin
    },
    rules: {
      "import/order": ["warn", {
        "groups": [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index"
        ],
        "newlines-between": "always",
        "alphabetize": { "order": "asc" }
      }],
      "no-console": ["warn", { "allow": ["error", "warn"] }],
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
    }
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-unused-vars": "off"
    }
  }
];
