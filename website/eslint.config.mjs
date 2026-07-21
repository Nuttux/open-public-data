// =============================================================================
// ESLint Configuration for Next.js + TypeScript (ESLint 9 flat config)
// =============================================================================

import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  {
    // Global rule overrides (apply to all files including .js/.mjs).
    // TypeScript checks identifier resolution far better than ESLint's
    // built-in no-undef, which doesn't know about `window`, `console`,
    // `URL`, etc. without an env config. Keep it off project-wide.
    rules: {
      "no-undef": "off",
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-irregular-whitespace": [
        "error",
        { "skipStrings": true, "skipTemplates": true, "skipComments": true, "skipRegExps": true },
      ],
      "no-control-regex": "off",
      // Honor `_` prefix convention used in dev scripts (mjs/js) for
      // intentionally-unused variables and caught errors.
      "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
    },
  },
  {
    // Dev scripts (smoke tests, audits) aren't shipped — keep ESLint
    // lenient there so a stray unused var doesn't break CI.
    files: ["scripts/**/*.{js,mjs,cjs}"],
    rules: {
      "no-unused-vars": "off",
    },
  },
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
    },
    rules: {
      // TypeScript rules. `_` prefix marks an intentionally-unused name
      // (args, locals, caught errors).
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/no-explicit-any": "warn",
      
      // React rules
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      
      // General
      "no-unused-vars": "off", // Use TypeScript version instead
      "no-undef": "off", // TypeScript handles this
      // Allow `try {} catch {}` swallow patterns (very common for optional
      // JSON loads and Storage probes). Empty blocks elsewhere stay errors.
      "no-empty": ["error", { "allowEmptyCatch": true }],
      // Irregular whitespace happens in editorial FR content (NBSP, narrow
      // NBSP for numbers). Keep the rule on for code, but skip strings/
      // templates/comments/regexes where it's intentional.
      "no-irregular-whitespace": [
        "error",
        { "skipStrings": true, "skipTemplates": true, "skipComments": true, "skipRegExps": true },
      ],
      // Some legacy regexes carry control chars from CSV parsing — keep
      // them for now, codepath unchanged.
      "no-control-regex": "off",
    },
    settings: {
      react: {
        version: "detect",
      },
    },
  },
  {
    // ── City-neutrality boundary (guardrail G4, see docs/adding-a-city.md) ──
    // Shared "surface" components render a typed model handed to them by a
    // per-city adapter — they must NEVER reach into a city's data, components,
    // or i18n. Adapters live in lib/<city>/*-model and ARE allowed those
    // imports; this rule scopes only the neutral component homes, so one
    // template keeps serving every city. Add new neutral surface dirs here as
    // they are extracted (e.g. src/components/fiche/**).
    files: [
      "src/components/landing/**/*.{ts,tsx}",
      "src/components/places/**/*.{ts,tsx}",
      "src/components/fiche/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: [
              "@/lib/us", "@/lib/us/*",
              "@/lib/fusion-data",
              "@/components/us", "@/components/us/*",
              "@/components/fusion", "@/components/fusion/*",
              "@/i18n/*",
              "**/lib/us/*", "**/components/us/*", "**/components/fusion/*",
            ],
            message:
              "Neutral surface component may not import city data/components/i18n. Take a typed model from a per-city adapter (lib/<city>/*-model) instead. See docs/adding-a-city.md.",
          },
        ],
      }],
    },
  },
  {
    ignores: [".next/**", "node_modules/**"],
  },
];
