/**
 * The hosts we claim compatibility with, as data.
 *
 * Adding a competitor is an entry here plus a vendored suite — not new code. The
 * ordering is by *chosen* usage, not by download count: cac and citty are large
 * numbers because vite, vitest and nitro bundle them, so a façade for either
 * converts almost nobody. See `docs/research/competitor-landscape.md` §8.
 */
export type HostImport =
  | { kind?: 'public'; upstream: string; subpath: string; reexportDefault: boolean }
  /**
   * A non-public module the suite reaches into incidentally (yargs' tests import
   * `YError` for `instanceof` assertions). For the control it is re-exported from the
   * installed host's own file; for a target, from the target itself. A test that then
   * fails is a real, recordable divergence rather than a whole file thrown away.
   */
  | { kind: 'internal'; upstream: string; file: string; names: string[] };

export interface Host {
  /** npm package we are compatible with. */
  name: string;
  /** Where its suite comes from, recorded so the vendor step is reproducible. */
  repo: string;
  /** Directory inside the repo holding the tests. */
  testDir: string;
  /** Glob of test files within it. */
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
  /** Files excluded, each with the reason. An exclusion that grows silently is a lie. */
  exclude: { file: string; reason: string }[];
  /** How its suite is executed. */
  runner: 'node:test' | 'mocha';
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
    testGlob: '*.test.js',
    imports: [{ upstream: '../index.js', subpath: '', reexportDefault: false }],
    exclude: [{ file: '*.test.js importing ../lib/', reason: 'tests internals, which we never promise' }],
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
      { kind: 'internal', upstream: '../build/lib/yerror.js', file: 'build/lib/yerror.js', names: ['YError'] },
    ],
    exclude: [
      {
        file: 'argsert, is-promise, obj-filter, parse-command',
        reason: 'test internal helper modules only and import no public entry; 23 tests',
      },
    ],
    runner: 'mocha',
    preamble: 'before.mjs',
    timeoutMs: 24_000,
    extraDirs: ['locales'],
    target: 'burgee/yargs',
    status: 'active',
    note: 'The front-end does not exist yet, so this grades at 0 honestly until wave 4 builds it. 108 methods.',
  },
  {
    name: 'meow',
    repo: 'https://github.com/sindresorhus/meow',
    testDir: 'test',
    testGlob: '*.js',
    imports: [{ upstream: '../source/index.js', subpath: '', reexportDefault: false }],
    exclude: [],
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
    exclude: [],
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
    exclude: [],
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
    exclude: [],
    runner: 'mocha',
    target: '—',
    status: 'rejected',
    note: 'Its API is inseparable from its shape: a project layout, a build step and a generator. A façade could not be adopted without adopting the shape that Z1 exists to prevent, and oclif does 10.9M/wk against commander’s 508M, so the shape is also what lost.',
  },
];

export const active = (): Host[] => HOSTS.filter((h) => h.status === 'active');
