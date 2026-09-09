/**
 * The hosts we claim compatibility with, as data.
 *
 * Adding a competitor is an entry here plus a vendored suite — not new code. The
 * ordering is by *chosen* usage, not by download count: cac and citty are large
 * numbers because vite, vitest and nitro bundle them, so a façade for either
 * converts almost nobody. See `.sdlc/research/competitor-landscape.md` §8.
 */
/**
 * A public specifier the tests use to reach the library. Imports of the host's *internal*
 * modules (`../lib/command.js`, `../build/lib/yerror.js`) are not listed here: the vendor
 * step discovers them and the runner shims them — from the installed host's own file for
 * the control, from the target's main entry for a target — so no file is ever excluded.
 */
export interface HostImport {
  /** As the tests write it: relative to the test dir (`../index.mjs`) or bare (`yargs-parser`). */
  upstream: string;
  subpath: string;
  reexportDefault: boolean;
  /**
   * What the control run re-exports, when it is not `<host><subpath>`: yargs' parser is a
   * separate package, `yargs-parser`, and a program migrating from it imports the same
   * object from `burgee/yargs/parser`.
   */
  control?: string;
}

export interface Host {
  /** npm package we are compatible with. */
  name: string;
  /** Where its suite comes from, recorded so the vendor step is reproducible. */
  repo: string;
  /** Directory inside the repo holding the tests. */
  testDir: string;
  /**
   * Glob of test files within it, matched against the file name with `path.matchesGlob`.
   * Both the vendor step and the runner apply it: ora's suite lives at the repo root
   * beside `index.js`, so "every `.js` in the test dir" would vendor the host's own
   * implementation and then run it as a test.
   */
  testGlob: string;
  /**
   * Every public specifier the tests use to reach the library, each rewritten to a
   * generated shim that re-exports `<target><subpath>`. One entry for most hosts;
   * yargs also imports `yargs/helpers`.
   */
  imports: HostImport[];
  /** Files the runner must load first, relative to the vendored tests dir. */
  preamble?: string;
  /**
   * Upstream directories the suite reads at run time relative to the repo root, vendored
   * beside the tests. Suites are run from `vendor/<host>/` so those paths resolve.
   */
  extraDirs?: string[];
  /** Per-test timeout the suite was written against, ms. */
  timeoutMs?: number;
  /**
   * Environment the host's own `npm test` sets, and the suite depends on: ora's tests read
   * private state through the `_`-prefixed properties its constructor only defines under
   * `NODE_ENV=test`. Merged over the runner's environment for control and target alike.
   */
  env?: Record<string, string>;
  /**
   * Files that define the host's public API surface, relative to the repo root. Their
   * names are fingerprinted in the compatibility record, so a new release's diff says
   * which methods appeared or vanished, not just that a test count moved.
   */
  surfaceFiles?: string[];
  /** Git tag prefix for releases; `v` unless the host does otherwise. */
  tagPrefix?: string;
  /**
   * How its suite is executed. `vitest` is what a jest suite runs under, since jest's
   * globals are vitest's and vitest is already here.
   */
  runner: 'node:test' | 'mocha' | 'ava' | 'vitest';
  /** Our entry point graded against it. */
  target: string;
  status: 'active' | 'planned' | 'rejected';
  /** Why, for anything not active. */
  note?: string;
}

export const HOSTS: Host[] = [
  {
    name: 'commander',
    repo: 'https://github.com/tj/commander.js',
    testDir: 'tests',
    // Four of its suites are .cjs or .mjs on purpose — they test what `require()` and
    // `import` each get — so the glob has to name all three extensions.
    testGlob: '*.test.{js,cjs,mjs}',
    imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false }],
    surfaceFiles: ['typings/index.d.ts', 'index.js'],
    runner: 'node:test',
    target: 'burgee/commander',
    status: 'active',
  },
  {
    name: 'yargs',
    repo: 'https://github.com/yargs/yargs',
    testDir: 'test',
    testGlob: '*.mjs',
    imports: [
      { upstream: '../index.mjs', subpath: '', reexportDefault: true },
      { upstream: '../helpers/helpers.mjs', subpath: '/helpers', reexportDefault: false },
      { upstream: 'yargs-parser', subpath: '/parser', reexportDefault: true, control: 'yargs-parser' },
    ],
    runner: 'mocha',
    preamble: 'before.mjs',
    timeoutMs: 24_000,
    extraDirs: ['locales'],
    surfaceFiles: ['lib/yargs-factory.ts', 'lib/typings/yargs-parser-types.ts', 'helpers/helpers.mjs'],
    target: 'burgee/yargs',
    status: 'active',
    note: '108 methods. Built in wave 4.',
  },
  {
    // The first host graded against a layer other than the engine: chalk 6's suite against
    // `roundel/chalk` (roundel design R6, output-stack-compat U11). Its tests import
    // `../source/index.js` (an ESM default export) and two of its files spawn a fixture
    // beside them with execa, so the fixtures are vendored and rewritten like any test.
    name: 'chalk',
    repo: 'https://github.com/chalk/chalk',
    testDir: 'test',
    testGlob: '*.js',
    imports: [{ upstream: '../source/index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['source/index.d.ts', 'source/index.js'],
    runner: 'ava',
    target: 'roundel/chalk',
    status: 'active',
    note: 'Graded against roundel, not burgee: the colour layer has its own façade.',
  },
  {
    name: 'ora',
    repo: 'https://github.com/sindresorhus/ora',
    // Its suite is one file at the repo root, beside the implementation it tests.
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    env: { NODE_ENV: 'test' },
    surfaceFiles: ['index.d.ts'],
    runner: 'node:test',
    target: 'flagstaff/ora',
    status: 'active',
    note: 'The second output-stack incumbent: 30M/wk, and the loop every other spinner copies.',
  },
  {
    name: 'log-update',
    repo: 'https://github.com/sindresorhus/log-update',
    // One file at the repo root, like ora's.
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts'],
    runner: 'node:test',
    target: 'flagstaff/log-update',
    status: 'active',
    // Its suite renders every frame through a real terminal emulator (`terminal.js`) and
    // asserts the screen, not the bytes — the strongest grading of the four render hosts.
    note: 'Vendored and controlled 2026-09-08; the façade is next (it needs wrap-ansi and slice-ansi ported first).',
  },
  {
    name: 'boxen',
    repo: 'https://github.com/sindresorhus/boxen',
    testDir: 'tests',
    testGlob: '*.js',
    imports: [{ upstream: '../index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts'],
    runner: 'ava',
    target: 'flagstaff/boxen',
    status: 'active',
    note: 'Unblocked 2026-09-08 by the decision in `.sdlc/intents/output-stack-compat/design.md`: a drawing is a contract, and for a pure string function it is the *whole* contract, so every `t.snapshot(box)` case gates. `box()` takes a state and returns a string — that is `static(state)` — so there was never a U3 tension here to resolve.',
  },
  {
    name: 'cli-table3',
    repo: 'https://github.com/cli-table/cli-table3',
    testDir: 'test',
    testGlob: '*-test.js',
    imports: [{ upstream: '../src/table', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'src/table.js'],
    tagPrefix: 'v',
    runner: 'vitest',
    target: 'flagstaff/table',
    status: 'planned',
    note: 'The runner is no longer the blocker: its suite is jest, not mocha as first recorded, and the `vitest` runner added 2026-09-08 covers that. What remains is a decision. Of its 234 cases, 221 `require(\'../src/...\')` — cell, utils, layout-manager — and only 13 reach the package root (table-test.js has 10, test/issues/ has 3). Under the rule that a file importing only the host’s internals is informational and never gated, "cli-table3, graded" means 13 tests. Passing the other 221 means reproducing its src/ file for file, which is the thing that rule exists to refuse. 13 gated with the 221 reported beside them, or the row dropped and the reason published — either is defensible, and it is not this session’s call.',
  },
  {
    name: 'clack',
    repo: 'https://github.com/bombshell-dev/clack',
    testDir: 'packages/prompts/test',
    testGlob: '*.test.ts',
    imports: [{ upstream: '../src/index.js', subpath: '', reexportDefault: false }],
    surfaceFiles: ['packages/prompts/src/index.ts'],
    runner: 'vitest',
    target: 'caique/clack',
    status: 'planned',
    note: 'Measured 2026-09-08 at 1.8.0: 289 of its 444 assertions are `toMatchSnapshot()`, in 17 of its 19 files — the suite grades clack’s exact drawing. A façade that matched those frame for frame would be clack, and caique’s design rejects wrapping clack precisely because it "has no static projection to give" (U3). What is left when the drawings are removed is limit-options (14) and guide (3). Blocked on the decision in output-stack-compat: gate the behaviour and report the drawings as documented divergence, or drop the row and publish why.',
  },
  {
    name: 'inquirer',
    repo: 'https://github.com/SBoudrias/Inquirer.js',
    testDir: 'packages',
    testGlob: '*.test.ts',
    imports: [{ upstream: '../src/index.js', subpath: '', reexportDefault: false }],
    surfaceFiles: ['packages/inquirer/src/index.ts'],
    runner: 'vitest',
    target: 'caique/inquirer',
    status: 'planned',
    note: 'The same shape as clack, measured the same day: 604 of 1,028 assertions are `toMatchInlineSnapshot()`, across 25 files of 400 tests. Behaviour-only files are inquirer.test.ts (57, mostly the legacy façade’s plumbing), prompts (2) and type (3). Its suites are also spread across a workspace rather than one test dir, which the vendor step assumes; that is work, but it is not the blocker. Blocked on the same decision.',
  },
  {
    name: 'meow',
    repo: 'https://github.com/sindresorhus/meow',
    testDir: 'test',
    testGlob: '*.js',
    imports: [{ upstream: '../source/index.js', subpath: '', reexportDefault: false }],
    runner: 'node:test',
    target: 'burgee/meow',
    status: 'planned',
    note: 'The cheapest third host: a small surface and 42.8M/wk of genuinely chosen usage.',
  },
  {
    name: 'cac',
    repo: 'https://github.com/cacjs/cac',
    testDir: 'test',
    testGlob: '*.test.ts',
    imports: [{ upstream: '../src', subpath: '', reexportDefault: false }],
    runner: 'node:test',
    target: 'burgee/cac',
    status: 'planned',
    note: 'Deferred: 49.4M/wk is almost entirely vite and vitest bundling it, not developers choosing it, so a façade converts few people.',
  },
  {
    name: 'citty',
    repo: 'https://github.com/unjs/citty',
    testDir: 'test',
    testGlob: '*.test.ts',
    imports: [{ upstream: '../src', subpath: '', reexportDefault: false }],
    runner: 'node:test',
    target: 'burgee/citty',
    status: 'planned',
    note: 'Deferred for the same reason as cac: nitro and unjs bundle it.',
  },
  {
    name: 'oclif',
    repo: 'https://github.com/oclif/core',
    testDir: 'test',
    testGlob: '*.test.ts',
    imports: [{ upstream: '../src/index.ts', subpath: '', reexportDefault: false }],
    runner: 'mocha',
    target: '—',
    status: 'rejected',
    note: 'Its API is inseparable from its shape: a project layout, a build step and a generator. A façade could not be adopted without adopting the shape that Z1 exists to prevent, and oclif does 10.9M/wk against commander’s 508M, so the shape is also what lost.',
  },
];

export const active = (): Host[] => HOSTS.filter((h) => h.status === 'active');
