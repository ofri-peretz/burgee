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
      '**/.dev-fixtures/**',
      '.sdlc/research/issues/**',
      'apps/docs/next-env.d.ts',
      // Vendored upstream test suites (compat-oracle C6). They are the hosts' own
      // files, unmodified except one import specifier, and are graded, never linted:
      // "fixing" them would grade our reading of the host instead of the host.
      'packages/*/vendor/**',
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
  // FP 15: no-missing-null-checks does not follow an early return or throw — `if (!x)
  //   return;` on the line above still leaves `x.field` reported (yargs-usage.ts unfreeze),
  //   as does a ternary guarded by its own test (`m ? m[0].length : 0`, yargs-cliui.ts).
  // FP 16: no-unchecked-loop-condition reports `for (;;)` whose body breaks (yargs-shim.ts
  //   findUp, escalade's own loop).
  // FP 17: consistent-existence-index-check offers `in` as an *autofix* for
  //   `Object.prototype.hasOwnProperty.call(o, k)`; the two differ on inherited keys, which
  //   is why yargs-parser checks own properties on user-supplied objects. A style rule must
  //   not rewrite semantics.
  // FP 18: prefer-at reports `rows[rows.length - 1] += s` — an assignment target — and its
  //   autofix writes `rows.at(-1) += s`, which does not parse (TS2364). Seen 2026-09-08 in
  //   yargs-cliui.ts, five times; the rule must skip the left-hand side of an assignment.
  // FP 14: no-magic-numbers reports the literal inside a named constant's own definition
  // (`const JSON_RPC_INVALID_REQUEST = -32600`), which is the extraction it asks for. Off
  // for the JSON-RPC module, where the three spec codes are exactly such constants.
  // FP 12 (no exception needed, the code was hoisted): consistent-function-scoping fires on
  // an arrow that is already at module scope when it is wrapped in a type assertion, and on
  // trivial callbacks written inline inside an object literal that is passed as an argument,
  // a shape unicorn's rule exempts. Seen 2026-09-07 in packages/burgee/src/help.test.ts.
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
    rules: {
      'conventions/no-magic-numbers': 'off',
      // FP 9: a test that writes a package.json fixture has a `version` field that
      // must be an exact version, not a caret range. The rule reads any object
      // literal with a `version` key as a dependency map.
      'conventions/prefer-dependency-version-strategy': 'off',
    },
  },
  {
    files: ['scripts/**'],
    rules: {
      // Findings 3 and 6 (see above), which the ported scripts trip in the same
      // shapes: directory-bounded loops and `${x}` next to a space in console text.
      'secure-coding/no-unlimited-resource-allocation': 'off',
      'conventions/no-console-spaces': 'off',
      // Maps keyed by band id from .sdlc/bands/control-bands.json, a committed file, not
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
  {
    // yargs' `extends` contract: a config file names another config *module*, and the
    // parser loads it by that name. The specifier is the user's own config talking about
    // the user's own filesystem — there is no static import that expresses "whatever
    // `extends` says", so reproducing yargs here means reproducing the dynamic load.
    files: ['packages/burgee/src/yargs-parser.ts', 'packages/burgee/src/yargs-utils.ts'],
    rules: { 'node-security/no-dynamic-dependency-loading': 'off' },
  },
  {
    // The one line the compatibility gate turns on. `COMPAT_TARGET` is not ambient input:
    // run.ts sets it on the child it spawns (`env: { ...process.env, COMPAT_TARGET: target }`),
    // so the value is this harness naming its own grading target. compat-oracle is
    // `private: true` and never published.
    files: ['packages/compat-oracle/src/shim.ts'],
    rules: { 'node-security/no-unsafe-dynamic-require': 'off' },
  },
  {
    // The dependents ranker calls three public APIs with no key and no quota to spare:
    // one request at a time, with a pause between pages, is the politeness the sources ask
    // for. Sequential await is the contract (ponytail: parallelise past 2k candidates).
    files: ['scripts/rank-dependents.ts'],
    rules: { 'reliability/no-await-in-loop': 'off' },
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
    // Two of the three files allowed to touch `process` (process-reference-lock.test.ts):
    // the real runtime's exit, and the harness's env/console swap by enumerated keys.
    // The third, burgee/src/index.ts, has its own block above.
    files: ['packages/burgee/src/runtime.ts', 'packages/burgee/src/testing-helpers.ts'],
    rules: {
      'operability/no-process-exit': 'off',
      'secure-coding/detect-object-injection': 'off',
      'maintainability/no-missing-error-context': 'off',
      'reliability/no-missing-error-context': 'off',
    },
  },
  {
    // Measured 2026-09-07: under verbatimModuleSyntax an inline type specifier
    // (`import { type X } from './m.js'`) emits `import {} from './m.js'` — a real
    // module load for no value, worth ~5ms of startup here. A type-only import must
    // be top-level so it erases completely.
    files: ['packages/burgee/src/execute.ts', 'packages/burgee/src/help.ts', 'packages/burgee/src/schema.ts'],
    rules: { 'import-next/consistent-type-specifier-style': 'off' },
  },
  {
    // Config discovery loads the user's own config file: a JSON read, or a dynamic import
    // of a JavaScript config — that import is the feature (V6, yargs #2234), not a
    // dependency loaded by name. `extends` parents are awaited in order because order is the
    // merge semantics (V7). ConfigError takes its message first, like UsageError (FP 10).
    files: ['packages/burgee/src/config.ts'],
    rules: {
      'node-security/no-dynamic-dependency-loading': 'off',
      'performance/no-await-in-loop': 'off',
      'reliability/no-await-in-loop': 'off',
      'maintainability/no-missing-error-context': 'off',
      'reliability/no-missing-error-context': 'off',
      'maintainability/no-unhandled-promise': 'off',
      'reliability/no-unhandled-promise': 'off',
    },
  },
  {
    // FP 14, see the list above. The request loop awaits each JSON-RPC message before
    // reading the next: stdio MCP is ordered, and a tool call runs a command whose output
    // must not interleave with another's.
    files: ['packages/burgee/src/mcp.ts'],
    rules: { 'conventions/no-magic-numbers': 'off', 'performance/no-await-in-loop': 'off', 'reliability/no-await-in-loop': 'off' },
  },
  {
    // Plugin hooks run strictly in order — `enforce: 'pre'`, then unordered, then
    // `'post'` — and a hook may depend on what an earlier one did. Sequential await
    // is the contract, not an oversight.
    files: ['packages/burgee/src/manifest.ts'],
    rules: { 'performance/no-await-in-loop': 'off', 'reliability/no-await-in-loop': 'off' },
  },
  {
    // FP 11: require-data-minimization reads a static host-config literal (test-suite
    // metadata: repo, glob, exclusions) as "excessive data collection". Nothing here
    // collects anything. Tracked in the eslint monorepo.
    files: ['packages/compat-oracle/src/hosts.ts', 'packages/burgee/src/cli.ts'],
    rules: { 'operability/require-data-minimization': 'off' },
  },
  {
    // FP 13: no-missing-error-context reads `throw new Error(message)` as an error without
    // a message when the message arrives through a variable built two lines earlier.
    // The brand CLI composes a multi-line contrast report and throws it. Tracked upstream.
    // flagstaff's cli.ts rethrows what is not a PluginError untouched (`throw e`), which
    // the rule reads as an error without a message.
    files: ['packages/burgee/src/cli.ts', 'packages/flagstaff/src/cli.ts'],
    rules: { 'maintainability/no-missing-error-context': 'off', 'reliability/no-missing-error-context': 'off' },
  },
  {
    // A package's `bin` entry has no exports by design: it is the program, not a module.
    files: ['packages/flagstaff/src/cli.ts'],
    rules: { 'import-next/no-unused-modules': 'off' },
  },
  {
    // FP 8 (also seen in scripts/run-evals.ts): no-unhandled-promise fires on every call
    // to a function-typed *parameter* inside an async function, assuming it returns a
    // promise. The writer parameter returns void. Tracked in the eslint monorepo.
    // dev.ts is the same finding from the other side: it orchestrates promises by design,
    // and every one it creates is returned to the caller or chained into `chain`, whose
    // catch reports; the rule flags each assignment as unhandled.
    // mcp.ts's `reply` is exactly the writer-parameter shape, now called from the async
    // `serve` loop `startMcp` split out.
    // flagstaff's `check` command has the same writer parameter, plus a top-level
    // `main().then(ok, fail)` whose second argument is the handler the rule looks for.
    files: ['packages/compat-oracle/src/report.ts', 'packages/burgee/src/dev.ts', 'packages/burgee/src/mcp.ts', 'packages/flagstaff/src/cli.ts'],
    rules: { 'maintainability/no-unhandled-promise': 'off', 'reliability/no-unhandled-promise': 'off' },
  },
  {
    // FP 12 again (2026-09-08): consistent-function-scoping fires on the ava shim's
    // skip/only/failing arrows assigned as properties of the test function at module scope,
    // which is as high as they go, and on the callback each passes to node:test.
    // FP 21: no-unhandled-promise reports `void nodeTest(...)`, a promise the `void`
    // operator discards on purpose (node:test's `test()` never rejects; the runner reports).
    // The rule must treat `void <call>` as handled. Tracked in the eslint monorepo.
    files: ['packages/compat-oracle/src/shims/ava.ts'],
    rules: {
      'maintainability/consistent-function-scoping': 'off',
      'maintainability/no-unhandled-promise': 'off',
      'reliability/no-unhandled-promise': 'off',
    },
  },
  {
    // A package's bin entry is executed, never imported, so it exports nothing.
    files: ['packages/*/src/bin.ts'],
    rules: { 'import-next/no-unused-modules': 'off' },
  },
  {
    // burgee owns the process: a CLI framework's whole job is to parse, run and
    // exit with the E1 contract. `exit` is injectable (RunOptions.exit) so tests
    // never touch the real one; the default has to call process.exit.
    files: ['packages/burgee/src/execute.ts', 'packages/burgee/src/precedence.ts'],
    rules: {
      'operability/no-process-exit': 'off',
      'secure-coding/detect-object-injection': 'off',
      // FP 10: UsageError's first parameter *is* the message and reaches super();
      // the rule only recognises `new Error(...)`.
      'maintainability/no-missing-error-context': 'off',
      'reliability/no-missing-error-context': 'off',
      // FP 7 (as in scripts/run-evals.ts): checking whether an option declares an environment
      // variable, and whether that variable was set, is read as a timing-unsafe secret
      // comparison because the identifiers contain "env". They compare a declared variable
      // name and presence against undefined, never a secret.
      'secure-coding/no-insecure-comparison': 'off',
      // FP 1 recurs: the parseArgs token union is narrowed with an "in" check, which
      // TypeScript verifies, and the rule still reads the property access afterwards as a
      // dereference of a possible undefined. Three correct rewrites did not satisfy it;
      // the code stays correct and the rule stays off here.
      'reliability/no-missing-null-checks': 'off',
    },
  },
  {
    // The shim exists to load a target chosen at run time — that dynamic import is
    // the entire compatibility mechanism, not an oversight.
    files: ['packages/compat-oracle/src/shim.ts'],
    rules: {
      'node-security/no-dynamic-dependency-loading': 'off',
      'import-next/no-default-export': 'off',
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
  {
    // `burgee/commander` is commander 15 ported method for method and graded by
    // commander's own 1,362 tests (compat-oracle). Its shape — one EventEmitter subclass,
    // the `_`-prefixed package-level fields the upstream tests reach for, the long parse
    // loop, process.exit when no exitOverride is set — *is* the specification, so the
    // structural rules that would reshape it are off here. The oracle is the check.
    // `burgee/yargs` is yargs 18 (with yargs-parser 22, cliui 9 and y18n 5) ported the same
    // way and graded by yargs' own 804 tests; the same rules are off for the same reason.
    // roundel/chalk is chalk 6 ported the same way and graded by chalk's own suite, and
    // flagstaff/ora is ora 9 — its eight dependencies folded in with it — graded by ora's
    // own 99 tests, and flagstaff/log-update is log-update 8 graded by its own 99, with
    // the wrap-ansi port beside it.
    files: [
      'packages/burgee/src/commander-*.ts',
      'packages/burgee/src/commander.ts',
      'packages/burgee/src/yargs-*.ts',
      'packages/burgee/src/yargs.ts',
      'packages/roundel/src/chalk.ts',
      'packages/flagstaff/src/ora.ts',
      'packages/flagstaff/src/log-update.ts',
      'packages/flagstaff/src/wrap.ts',
    ],
    rules: {
      'maintainability/consistent-function-scoping': 'off',
      'maintainability/cognitive-complexity': 'off',
      'maintainability/identical-functions': 'off',
      'maintainability/nested-complexity-hotspots': 'off',
      'maintainability/max-parameters': 'off',
      'maintainability/no-missing-error-context': 'off',
      'reliability/no-missing-error-context': 'off',
      'maintainability/no-unhandled-promise': 'off',
      'reliability/no-unhandled-promise': 'off',
      'reliability/no-unsafe-type-narrowing': 'off',
      'secure-coding/detect-object-injection': 'off',
      'secure-coding/no-improper-type-validation': 'off',
      'conventions/no-magic-numbers': 'off',
      'operability/no-process-exit': 'off',
      'modernization/prefer-event-target': 'off',
      'import-next/exports-last': 'off',
      'import-next/consistent-type-specifier-style': 'off',
      'import-next/no-barrel-file': 'off',
      // The yargs port adds: its module shape (yargs' own `if/else if` chains, nested
      // ternaries, empty catches that yargs documents as deliberate, a logger whose whole job
      // is console.log/console.error, yargs-parser's flag regexes, cliui's RegExp built from
      // a constant pattern, `new YError(msg)` where the message is the caller's).
      'maintainability/no-lonely-if': 'off',
      'maintainability/no-nested-ternary': 'off',
      'maintainability/no-silent-errors': 'off',
      'reliability/no-silent-errors': 'off',
      'operability/no-console-log': 'off',
      'operability/no-debug-code-in-production': 'off',
      'secure-coding/no-redos-vulnerable-regex': 'off',
      'secure-coding/detect-non-literal-regexp': 'off',
      'maintainability/error-message': 'off',
      'reliability/error-message': 'off',
      // FP 15, 16, 17, 18 — see the list above. FP 11 recurs on the yargs façade: the
      // option values handed to a plugin hook *are* the hook's contract.
      'operability/require-data-minimization': 'off',
      'modernization/prefer-at': 'off',
      'reliability/no-missing-null-checks': 'off',
      'secure-coding/no-unchecked-loop-condition': 'off',
      'conventions/consistent-existence-index-check': 'off',
      // FP 22 (wrap.ts): no-insecure-comparison reads a comparison of an SGR parameter
      // against a named constant as a secret compared in variable time. The value is the
      // number 38, off the wire, in a text wrapper; there is no constant-time comparison
      // of an integer to reach for. The rule keys on the shape, not on the value.
      'secure-coding/no-insecure-comparison': 'off',
    },
  },
  {
    // `import yargs from 'burgee/yargs'` is the drop-in: yargs' entry is a default export
    // and every program written for it imports it that way.
    files: ['packages/burgee/src/yargs.ts', 'packages/burgee/src/yargs-parser.ts', 'packages/roundel/src/chalk.ts', 'packages/flagstaff/src/ora.ts', 'packages/flagstaff/src/log-update.ts', 'packages/compat-oracle/src/shims/ava.ts'],
    rules: { 'import-next/no-default-export': 'off' },
  },
  {
    // X7 fixture: the commander demo built on burgee/commander through commander's own
    // types. The one cast *is* the drop-in claim, and commander-parity.test.ts proves it
    // byte for byte — a structural interface here would restate commander's typings.
    files: ['examples/demo-cli-commander/src/burgee.ts', 'examples/conformance/src/hosts.ts'],
    rules: { 'reliability/no-unsafe-type-narrowing': 'off', 'secure-coding/no-unsafe-type-assertion': 'off' },
  },
];
