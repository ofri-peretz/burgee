/**
 * Root ESLint flat config — dogfoods the Interlace ecosystem at maximum strength.
 *
 * Policy: EVERY rule of every installed Interlace plugin is on at `error`,
 * computed from the plugin's own rule table, so a new rule in a plugin release
 * is on here the day it lands. Only three kinds of exception exist, each named
 * in OFF with its reason: a conflicting pair (one side wins), a rule that
 * cannot apply to this codebase, or a documented false positive tracked in the
 * eslint monorepo. `--max-warnings 0` in CI; nothing is at `warn`.
 */
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import conventions from 'eslint-plugin-conventions';
import importNext from 'eslint-plugin-import-next';
import maintainability from 'eslint-plugin-maintainability';
import modernization from 'eslint-plugin-modernization';
import modularity from 'eslint-plugin-modularity';
import nodeSecurity from 'eslint-plugin-node-security';
import operability from 'eslint-plugin-operability';
import reactA11y from 'eslint-plugin-react-a11y';
import reactFeatures from 'eslint-plugin-react-features';
import reliability from 'eslint-plugin-reliability';
import secureCoding from 'eslint-plugin-secure-coding';

const TSX_FILES = ['apps/**/*.tsx'];

/**
 * Every non-deprecated rule of `plugin`, under `ns`, at `error` unless OFF
 * or OPTIONS says otherwise. Keys containing "/" are the doubled-namespace
 * aliases some plugins still export (`maintainability/cognitive-complexity`
 * next to `cognitive-complexity`) — skipped, the bare key is the rule.
 */
function everyRule(ns, plugin, { off = {}, options = {} } = {}) {
  const table = (plugin.default ?? plugin).rules;
  const rules = {};
  for (const [name, rule] of Object.entries(table)) {
    if (name.includes('/') || rule.meta?.deprecated) continue;
    const id = `${ns}/${name}`;
    if (name in off) rules[id] = 'off';
    else if (name in options) rules[id] = ['error', options[name]];
    else rules[id] = 'error';
  }
  return rules;
}

// ── Exceptions, each with its reason ────────────────────────────────────────
const OFF = {
  'import-next': {
    // Conflicting pairs: this repo uses named exports; default exports only where
    // a framework demands them (Next.js route files, config files — see below).
    'prefer-default-export': 'conflicts with no-default-export; named exports win',
    'no-named-export': 'conflicts with the named-export policy',
    order: 'duplicate of enforce-import-order',
    'no-nodejs-modules': 'this is a Node CLI toolkit; node builtins are the point',
    'no-internal-modules': 'fumadocs and next are consumed via documented subpaths',
    'dynamic-import-chunkname': 'webpack-only annotation; Turbopack ignores it',
    // Resolver noise until a TS-aware import resolver is wired (same as interlace).
    'no-unresolved': 'default resolver cannot map ESM .js specifiers to .ts sources',
  },
  'secure-coding': {},
  'node-security': {},
  conventions: {},
  maintainability: {},
  modernization: {},
  modularity: {},
  operability: {},
  reliability: {},
  'react-a11y': {},
  'react-features': {},
};

const OPTIONS = {
  'import-next': {
    // Side-effect imports are how Next loads global CSS.
    'no-unassigned-import': { allowModules: ['./global.css'] },
    // NodeNext packages must write `./index.js`; TS/TSX source imports never carry one.
    extensions: { default: 'never', pattern: { js: 'always', mjs: 'always', json: 'always', css: 'always' } },
  },
  conventions: {
    // Tool config files are named by their tools (next.config.mjs, vitest.config.ts).
    'filename-case': { case: 'kebabCase', ignore: [/\.config\.m?[jt]s$/] },
  },
};

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
      'apps/docs/next-env.d.ts',
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
  },

  // ── Everything, everywhere ────────────────────────────────────────────────
  {
    plugins: {
      'secure-coding': secureCoding,
      'node-security': nodeSecurity,
      conventions,
      'import-next': importNext,
      maintainability,
      modernization,
      modularity,
      operability,
      reliability,
    },
    rules: {
      ...everyRule('secure-coding', secureCoding, { off: OFF['secure-coding'] }),
      ...everyRule('node-security', nodeSecurity, { off: OFF['node-security'] }),
      ...everyRule('conventions', conventions, { off: OFF.conventions, options: OPTIONS.conventions }),
      ...everyRule('import-next', importNext, { off: OFF['import-next'], options: OPTIONS['import-next'] }),
      ...everyRule('maintainability', maintainability, { off: OFF.maintainability }),
      ...everyRule('modernization', modernization, { off: OFF.modernization }),
      ...everyRule('modularity', modularity, { off: OFF.modularity }),
      ...everyRule('operability', operability, { off: OFF.operability }),
      ...everyRule('reliability', reliability, { off: OFF.reliability }),
    },
  },

  // ── React, docs app only ──────────────────────────────────────────────────
  {
    files: TSX_FILES,
    plugins: { 'react-a11y': reactA11y, 'react-features': reactFeatures },
    rules: {
      ...everyRule('react-a11y', reactA11y, { off: OFF['react-a11y'] }),
      ...everyRule('react-features', reactFeatures, { off: OFF['react-features'] }),
    },
  },

  // ── Framework-mandated default exports ────────────────────────────────────
  {
    files: ['apps/docs/src/app/**', 'apps/docs/source.config.ts', 'apps/docs/src/mdx-components.tsx', '**/*.config.{js,mjs,ts,mts}', 'eslint.config.mjs', 'commitlint.config.mjs'],
    rules: { 'import-next/no-default-export': 'off' },
  },

  // ── Scope-specific exceptions ─────────────────────────────────────────────
  {
    // Tests import the package's public entry on purpose; scripts and tests are
    // entry points with nothing to export.
    files: ['**/*.test.ts', 'scripts/**'],
    rules: {
      'import-next/no-barrel-import': 'off',
      'import-next/no-unused-modules': ['error', { allowImportOnly: true }],
    },
  },
  {
    // Scripts are process entry points; their exit code is their contract (E1).
    files: ['scripts/**'],
    rules: { 'operability/no-process-exit': 'off' },
  },
  {
    // The lint config imports every plugin by design.
    files: ['eslint.config.mjs'],
    rules: { 'import-next/max-dependencies': 'off' },
  },
  {
    // Docs copy is static English; i18n is out of scope (design.md).
    files: TSX_FILES,
    rules: { 'react-features/jsx-no-literals': 'off' },
  },
  {
    // next/og renders this once on the server through satori: inline styles
    // are the only styling it understands, there is no CSS, no token, no
    // re-render. The brand hex values here are the dark-theme tokens verbatim.
    files: ['apps/docs/src/app/opengraph-image.tsx'],
    rules: {
      'react-features/no-raw-color-literal': 'off',
      'react-features/no-inline-style': 'off',
      'react-features/react-render-optimization': 'off',
      'react-features/no-unnecessary-rerenders': 'off',
    },
  },

  // ── Documented false positives (tracked in ofri-peretz/eslint) ────────────
  // void-dom-elements-no-children matches next/link's <Link> as the void <link>
  // element (case-insensitive tag match). Finding 5.
  {
    files: TSX_FILES,
    rules: { 'react-features/void-dom-elements-no-children': 'off' },
  },
  // Two specifiers no package.json can declare: fumadocs' virtual module
  // `fumadocs-mdx:collections/server` and the types-only `mdx/types`.
  {
    files: ['apps/docs/src/lib/source.ts', 'apps/docs/src/mdx-components.tsx'],
    rules: { 'import-next/no-extraneous-dependencies': 'off' },
  },
  // scripts/lint-workflows.ts (copied verbatim from ofri-peretz/eslint):
  //   - no-console-spaces reads a template literal whose interpolation sits
  //     next to a space as whitespace between console parameters. There is
  //     one parameter.
  //   - no-improper-type-validation (secure-coding 5.x) reports the typeof
  //     object check in triggers() although null and arrays have already
  //     returned on that path; its own message says a known-non-null value
  //     is not a finding. Tracked against secure-coding.
  // The xpath / resource-allocation / extraneous-dependencies overrides that
  // used to sit here were fixed upstream (ofri-peretz/eslint#894) and removed.
  {
    files: ['scripts/lint-workflows.ts'],
    rules: {
      'conventions/no-console-spaces': 'off',
      'secure-coding/no-improper-type-validation': 'off',
    },
  },
  // ── SDLC scripts (scripts/control-bands.ts, scripts/run-evals.ts, tests) ──
  {
    // Test files: numbers in fixtures are the fixture.
    files: ['**/*.test.ts'],
    rules: { 'conventions/no-magic-numbers': 'off' },
  },
  {
    files: ['scripts/**'],
    rules: {
      // Findings 3 and 6 (see above), which the ported scripts trip in the same
      // shapes: directory-bounded loops and `${x}` next to a space in console text.
      'secure-coding/no-unlimited-resource-allocation': 'off',
      'conventions/no-console-spaces': 'off',
      // Maps keyed by band id from .agent/control-bands.json, a committed file, not
      // input; the rule cannot tell the two apart.
      'secure-coding/detect-object-injection': 'off',
      // Rethrowing a caught error after an ENOENT check keeps the original error.
      'maintainability/no-missing-error-context': 'off',
    },
  },
  {
    // The watcher imports eslint.config.mjs to count rules; the evals runner runs
    // shell checks written in committed case files. Both are repo-owned inputs.
    files: ['scripts/control-bands.ts'],
    rules: { 'node-security/no-dynamic-dependency-loading': 'off' },
  },
  {
    files: ['scripts/run-evals.ts'],
    rules: { 'node-security/no-dynamic-command-string': 'off' },
  },
  // ── Harness and demo packages (intent cli-testing-harness) ────────────────
  {
    // Tests that prove console capture must call console.
    files: ['**/*.test.ts'],
    rules: {
      'operability/no-console-log': 'off',
      'operability/no-debug-code-in-production': 'off',
    },
  },
  {
    // The two files allowed to touch `process` (process-reference-lock.test.ts):
    // the real runtime's exit, and the harness's env/console swap by enumerated keys.
    files: ['packages/cli-core/src/runtime.ts', 'packages/cli-core/src/testing.ts'],
    rules: {
      'operability/no-process-exit': 'off',
      'secure-coding/detect-object-injection': 'off',
      'maintainability/no-missing-error-context': 'off',
      'reliability/no-missing-error-context': 'off',
    },
  },
  {
    // A package entry re-exports its modules; that is what an entry is for.
    files: ['packages/*/src/index.ts'],
    rules: { 'import-next/no-barrel-file': 'off' },
  },
  {
    // Executable entry points import their own module and export nothing.
    files: ['examples/*/src/bin.ts'],
    rules: {
      'import-next/no-barrel-import': 'off',
      'import-next/no-unused-modules': ['error', { allowImportOnly: true }],
    },
  },
];
