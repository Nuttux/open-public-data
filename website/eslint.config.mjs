// =============================================================================
// ESLint Configuration for Next.js + TypeScript (ESLint 9 flat config)
// =============================================================================

import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react": reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    rules: {
      // TypeScript rules
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",

      // React rules
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Next.js rules — registered as warnings (we still allow `<img>` where
      // we explicitly opt-out via eslint-disable, but the rule must be known
      // for those directives to parse).
      "@next/next/no-img-element": "warn",

      // General
      "no-unused-vars": "off", // Use TypeScript version instead
      "no-undef": "off",       // TypeScript handles this
      // Empty try/catch is used intentionally as silent fallback (stale data,
      // SSR/private browsing, missing optional files).
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Allow non-breaking space (U+00A0) in chart labels — used as French
      // typographic separator between number and unit (e.g. "11 Mds €").
      "no-irregular-whitespace": ["error", { skipStrings: true, skipTemplates: true, skipRegExps: true }],
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    // Dev-only throwaway scripts at the website/ root and a few sub-folders.
    // Not shipped, not user-facing — keep them out of CI lint.
    ignores: [
      ".next/**",
      "node_modules/**",
      "audit-*.mjs",
      "screenshot-*.mjs",
      "bench_shots.mjs",
      "shot_last.mjs",
      "landing-screenshot.js",
      "reveal-smoke.js",
      "reveal-screenshots.js",
      "scripts/_mockup_screenshot.mjs",
      "scripts/audit-*.mjs",
      "scripts/a11y-*.mjs",
      "scripts/_smoke_*.mjs",
      "scripts/_*.mjs",
      "mdx-components.tsx",
    ],
  },
];
