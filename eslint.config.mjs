/**
 * Root ESLint flat config — dogfoods the Interlace ecosystem.
 *
 * Wiring mirrors ../interlace/eslint.config.mjs: each plugin's OWN flat
 * `recommended`, spread as-is, except maintainability + operability whose
 * published `recommended` does not resolve under flat config and are hand-wired.
 * React plugins run on the docs app's TSX only.
 *
 * Everything is `error`. This repo starts empty, so there is no backlog to
 * baseline; the first finding is the first thing to fix.
 */
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { configs as conventionsCfg } from 'eslint-plugin-conventions';
import { configs as importNextCfg } from 'eslint-plugin-import-next';
import maintainability from 'eslint-plugin-maintainability';
import { configs as modernizationCfg } from 'eslint-plugin-modernization';
import { configs as modularityCfg } from 'eslint-plugin-modularity';
import { configs as nodeSecurityCfg } from 'eslint-plugin-node-security';
import operability from 'eslint-plugin-operability';
import reactA11y from 'eslint-plugin-react-a11y';
import reactFeatures from 'eslint-plugin-react-features';
import { configs as reliabilityCfg } from 'eslint-plugin-reliability';
import { configs as secureCodingCfg } from 'eslint-plugin-secure-coding';

const TSX_FILES = ['apps/**/*.tsx'];

export default [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/.source/**',
      '**/.turbo/**',
      '**/node_modules/**',
      '**/coverage/**',
      'docs/research/issues/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },

  // Security
  secureCodingCfg.recommended,
  nodeSecurityCfg.recommended,

  // Quality
  conventionsCfg.recommended,
  importNextCfg.recommended,
  modernizationCfg.recommended,
  modularityCfg.recommended,
  reliabilityCfg.recommended,
  {
    plugins: { maintainability, operability },
    rules: {
      'maintainability/cognitive-complexity': 'error',
      'maintainability/identical-functions': 'error',
      'maintainability/max-parameters': 'error',
      // O3 in the floor: command code never writes via console.*; the output layer does.
      'operability/no-console-log': 'error',
      'operability/no-debug-code-in-production': 'error',
      'operability/no-verbose-error-messages': 'error',
    },
  },

  // React — docs app only
  { ...reactA11y.configs.recommended, files: TSX_FILES },
  {
    files: TSX_FILES,
    plugins: { 'react-features': reactFeatures },
    rules: {
      'react-features/jsx-key': 'error',
      'react-features/no-danger': 'error',
      'react-features/no-string-refs': 'error',
      'react-features/jsx-no-target-blank': 'error',
      'react-features/jsx-no-script-url': 'error',
      'react-features/jsx-no-duplicate-props': 'error',
      'react-features/no-danger-with-children': 'error',
      'react-features/hooks-exhaustive-deps': 'error',
    },
  },

  // Resolver noise until a TS-aware import resolver is wired (same as interlace).
  { rules: { 'import-next/no-unresolved': 'off' } },
  // First dogfooding finding (2026-09-05): `no-missing-null-checks` is not
  // type-aware and flags `.data` on a call whose return type is non-nullable
  // (apps/docs/src/lib/source.ts getPageOrNotFound). Off until the rule reads
  // types; tracked against eslint-plugin-reliability.
  { rules: { 'reliability/no-missing-null-checks': 'off' } },
  // Two specifiers no package.json can declare: fumadocs' virtual module
  // `fumadocs-mdx:collections/server` and the types-only `mdx/types` (from
  // @types/mdx). Scoped to the two files that import them.
  {
    files: ['apps/docs/src/lib/source.ts', 'apps/docs/src/mdx-components.tsx'],
    rules: { 'import-next/no-extraneous-dependencies': 'off' },
  },
  // Dogfooding findings 2–4 (2026-09-05), all on scripts/lint-workflows.ts
  // (copied verbatim from ofri-peretz/eslint, where these sit at `warn`):
  //   - no-xpath-injection fires on GitHub Actions annotation strings
  //     (`::error file=…::msg`) — the `::` is not an XPath axis.
  //   - no-unlimited-resource-allocation fires on reading a handful of
  //     workflow files in a loop bounded by a directory listing.
  //   - no-extraneous-dependencies fires on the `node:process` builtin.
  // Scoped to the one file; tracked against secure-coding and import-next.
  {
    files: ['scripts/lint-workflows.ts'],
    rules: {
      'secure-coding/no-xpath-injection': 'off',
      'secure-coding/no-unlimited-resource-allocation': 'off',
      'import-next/no-extraneous-dependencies': 'off',
    },
  },
];
