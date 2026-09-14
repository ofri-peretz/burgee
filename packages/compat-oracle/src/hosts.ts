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

/**
 * A directory under `testDir` whose files match the host's `testGlob` and are nonetheless
 * **not** graded. Declaring one is the only way a copied directory stays out of the walk,
 * and it costs a written reason: `test/issues/` sat vendored, committed and ungraded for a
 * release because nothing had to say so out loud.
 */
export interface UngradedDir {
  /** Path under `testDir`, posix, as the walk sees it. */
  dir: string;
  /** Why it is copied and not graded. A lock refuses an empty one. */
  why: string;
}

/**
 * A case the gate must not count, named. `match` is a substring of the runner's own case
 * name — file, suite and title, as the flat TAP prints it — so an exclusion says exactly
 * which cases it removes and a reader can grep for them in the raw TAP.
 *
 * The oracle refuses an exclusion that matches nothing, and refuses one on a runner whose
 * TAP has no per-case names: an exclusion that quietly stops applying, or quietly never
 * applied, is how a compat claim becomes a lie (`compat-oracle/intent.md`).
 */
export interface Exclusion {
  match: string;
  why: string;
}

/**
 * Failures the control run is allowed against the host's own package, with the reason. The
 * control exists to prove the gate (criterion 3), so anything above this number is red —
 * a known-good implementation scoring 93.8% must not pass silently.
 */
export interface ControlAllowance {
  count: number;
  why: string;
}

export interface Host {
  /**
   * The host's key here: its vendor directory, its baseline fragment, and the word a
   * reader types on the command line. Usually the npm package's own name — but a scoped
   * package cannot be either of the first two, because `@clack/prompts` names a directory
   * two deep and a baseline file with a slash in it. Those hosts carry a flat key and
   * declare `npmName`.
   */
  name: string;
  /**
   * The package on npm, when it is not `name`: `@clack/prompts`, `@inquirer/core`. It is
   * what the release lookup asks about and what the control resolves, so a host whose key
   * is flattened still grades against the real thing rather than against whatever
   * unrelated package happens to own the flat name.
   */
  npmName?: string;
  /** Where its suite comes from, recorded so the vendor step is reproducible. */
  repo: string;
  /** Directory inside the repo holding the tests. */
  testDir: string;
  /**
   * The sub-package's own directory inside a monorepo, relative to the repo root — the
   * directory the suite's relative paths are written against. Empty for a host whose repo
   * *is* the package, which is every host here until clack and inquirer.
   *
   * It exists because a monorepo breaks one specific thing: the generated internal shims.
   * They are written at the exact path the test reaches for, and a test in
   * `packages/prompts/test/` writing `../src/common.js` means
   * `packages/prompts/src/common.js`, not `src/common.js` at the vendored root. Anchoring
   * them at the root writes a file nothing imports and leaves the real specifier
   * unresolved, which reads as a compatibility failure and is a path bug.
   */
  packageDir?: string;
  /**
   * Glob of test files within it, matched against the file name with `path.matchesGlob`.
   * Both the vendor step and the runner apply it: ora's suite lives at the repo root
   * beside `index.js`, so "every `.js` in the test dir" would vendor the host's own
   * implementation and then run it as a test.
   */
  testGlob: string;
  /**
   * The directory holding the host's own modules — the ones a test may reach into but we
   * never promise. `lib` unless a host files them elsewhere; cli-table3 uses `src`.
   */
  internalDir?: string;
  /**
   * Every public specifier the tests use to reach the library, each rewritten to a
   * generated shim that re-exports `<target><subpath>`. One entry for most hosts;
   * yargs also imports `yargs/helpers`.
   */
  imports: HostImport[];
  /**
   * Directories under `testDir` that the copy step brings along and the runner must not
   * grade. Everything else under `testDir` is discovered recursively.
   */
  ungradedDirs?: UngradedDir[];
  /** Cases excluded from the gate, each named and justified. */
  excludes?: Exclusion[];
  /** What the control may fail against the host's own package, and why. */
  controlFailures?: ControlAllowance;
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
   * What the vendored suite needs installed to run, pinned — and installed **into
   * `vendor/<name>/node_modules`**, never into this workspace's manifest or lockfile.
   *
   * The incumbents graded before this one were single-package repos whose suites needed
   * nothing the workspace did not already have, so their test dependencies went to the
   * root manifest. A monorepo's suite reaches for its own siblings by name
   * (`@clack/core`, `@inquirer/testing`) and for the incumbent itself in the control run,
   * and putting those at the root would mean a workspace dependency per incumbent — the
   * thing PRINCIPLES.md forbids — plus a lockfile edit on every lane that adds a suite.
   * A manifest beside the tests keeps the suite's needs where the suite is.
   *
   * Written as `name@version` specs, exactly pinned. Exactly, because the suite is graded
   * against one release and a caret silently regrades it: `vitest-ansi-serializer` at
   * `^0.1.2` resolves to 0.3.1, whose rendering differs from the committed snapshots, and
   * clack's control read 40 / 606 on 0.3.1 against 576 / 606 on 0.1.2 — same suite, same
   * afternoon, one caret.
   */
  suiteDeps?: string[];
  /**
   * Settings from the host's own vitest config that its suite depends on, merged into the
   * generated one. Upstream's config is not vendored — it sits beside the package, not
   * beside the tests, and the runner writes its own so the file list is the graded one —
   * so anything in it the assertions rely on has to be named here.
   */
  vitestConfig?: Record<string, unknown>;
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
    ungradedDirs: [
      {
        dir: 'fixtures',
        why: "Fixture programs the tests spawn as subprocesses. They match `*.mjs` only because that is how yargs writes an ESM fixture; running one as a test grades nothing.",
      },
      {
        dir: 'helpers',
        why: "`utils.mjs`, the output-capture helper the top-level tests import. A helper, never a test — mocha would load it and register no cases.",
      },
      {
        dir: 'esm',
        why: "yargs' separate ESM suite, which upstream runs under its own command. Found by this walk on 2026-09-09 and deliberately not graded yet: `platform-shim-test.mjs` imports `lib/platform-shims/esm.mjs`, an internal the vendor step's `../lib/` detector does not reach from a subdirectory, so grading the directory today adds three files that fail to load rather than three that measure anything. Named here so it is a decision with a date rather than a silence; grading it is its own piece of work.",
      },
    ],
    controlFailures: {
      count: 2,
      why: "Real yargs reports its own version by reading the nearest package.json, and from inside a vendored copy that lookup finds ours. Two usage tests assert the version string; burgee scores 804 where yargs itself scores 802. Documented since the host was activated.",
    },
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
    internalDir: 'src',
    imports: [{ upstream: '../src/table', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'src/table.js'],
    tagPrefix: 'v',
    runner: 'vitest',
    excludes: [
      {
        match: 'test/verify-legacy-compatibility-test.js > verify original cli-table behavior > ',
        why: "Nine cases that call `commonTests(require('cli-table'))` — the *legacy* incumbent, not the target. They pass whatever `COMPAT_TARGET` names: breaking the target completely still scored 10 / 33, because 27% of the row was a self-test of a third-party package. The other nine, `@api cli-table2 matches verified behavior`, run the same assertions through the shim and are gated. `cli-table` stays a devDependency so the file still loads and the excluded cases still run; they are subtracted from the number, not hidden from the TAP.",
      },
    ],
    target: 'flagstaff/cli-table3',
    status: 'active',
    note: "Decided 2026-09-08 in `.sdlc/intents/output-stack-compat/design.md`; every count corrected 2026-09-09 after measurement, because the ones written here were wrong. The suite runs **235** cases: 197 reach the host's internals (`../src/cell`, `../src/utils`, `../src/layout-manager` — 94 + 63 + 11 + 29 across four files) and **38** reach the package root — table-test.js 10, original-cli-table-newlines-test.js 5, verify-legacy-compatibility-test.js 18 (it runs its nine assertions twice) and test/issues/ 5, in four files that were vendored, committed and graded by nobody until the walk became recursive. Of those 38, the nine excluded above grade cli-table rather than the target, so **29 gate**. Under C4 a file importing only the host's internals is informational and never gated, because passing it means reproducing the host's file layout, which is the thing that rule exists to refuse. The target moved to `flagstaff/cli-table3` when that façade landed — the condition this note set for the move. Until then the target was `flagstaff/table`, the table API that is deliberately *not* a cli-table3 façade, and it measured 0 / 29; that zero was measured, not assumed. The rule the move respects: never name the target after a façade that does not exist, because that publishes `target not built yet` where there had been a real number.",
  },
  {
    // The first host graded against the foundation tier. `string-width` is the package
    // `linegauge`'s `width` replaces head-on, and — measured 2026-09-10 — it is *right*: all
    // six grapheme rows in `linegauge/intent.md` that break a naive implementation, it gets
    // correct. So this row is not evidence that the incumbent is broken. It is the only thing
    // that can hold `linegauge` to the incumbent's own definition of correct while the claim
    // it actually makes — one package where a caller installs fourteen — is argued on weight.
    //
    // Its suite is one file at the repo root beside the implementation, so `testGlob` names
    // that file rather than a directory: "every `.js` here" would vendor the host's own
    // `index.js` and grade it as a test. Same shape as ora's.
    name: 'string-width',
    repo: 'https://github.com/sindresorhus/string-width',
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    target: 'linegauge',
    status: 'active',
    note: 'linegauge exports `width` as its default, which is the shape string-width\'s own tests import.',
  },
  {
    // `wrap-ansi` is the one incumbent in this layer with a measured correctness gap, and it
    // is already closed upstream: two family-ZWJ emoji hard-wrapped at three columns come back
    // as **eight** fragments under 8.1.0 and 9.0.2 and as two correct lines under 10.0.1
    // (`cli-foundation-stack/baseline.md`, 2026-09-10). `linegauge/src/wrap.ts` is a port of
    // 10, so this row grades the port against the major it was ported from — which is exactly
    // what `wrap.test.ts` asserts in-package, and what this makes public.
    name: 'wrap-ansi',
    repo: 'https://github.com/chalk/wrap-ansi',
    testDir: 'test',
    testGlob: '*.js',
    imports: [{ upstream: '../index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    target: 'linegauge',
    status: 'planned',
    note: 'Graded once string-width\'s row is green: two new hosts against one target in one change would make a failure ambiguous.',
  },
  {
    // The first monorepo host. Its key is flat because `@clack/prompts` cannot be a
    // directory name or a baseline filename; `npmName` carries the real one.
    name: 'clack',
    npmName: '@clack/prompts',
    repo: 'https://github.com/bombshell-dev/clack',
    tagPrefix: '@clack/prompts@',
    testDir: 'packages/prompts/test',
    packageDir: 'packages/prompts',
    testGlob: '*.test.ts',
    internalDir: 'src',
    imports: [{ upstream: '../src/index.js', subpath: '', reexportDefault: false }],
    surfaceFiles: ['packages/prompts/src/index.ts'],
    suiteDeps: [
      // The incumbent itself, for the control, at the release the suite comes from.
      '@clack/prompts@1.8.1',
      // Its sibling in the same repo, imported by name from the test files.
      '@clack/core@1.5.1',
      // `memfs` backs the `__mocks__/fs.cjs` the path prompt's tests install, and
      // `vitest-ansi-serializer` is the snapshot serializer upstream's own vitest config
      // declares: without it every `toMatchSnapshot` compares raw escapes against a
      // committed rendering and the whole suite is red for a reason that is not clack's.
      'memfs@4.78.0',
      'vitest-ansi-serializer@0.1.2',
    ],
    // Upstream's own vitest config sets it, and the drawings are the suite: without colour
    // every snapshot differs from the committed one.
    env: { FORCE_COLOR: '1' },
    vitestConfig: { snapshotSerializers: ['vitest-ansi-serializer'] },
    // `path.test.ts` calls `vi.mock('node:fs')` with no factory, which vitest answers from
    // a `__mocks__` directory beside the project root — upstream's `packages/prompts`, not
    // its test dir, so the copy step never saw it. Without it those 30 cases run against
    // the real filesystem and every one of them fails against clack itself.
    extraDirs: ['packages/prompts/__mocks__'],
    controlFailures: {
      count: 30,
      why: "`path.test.ts`'s 30 cases, which fail against clack's own published package here and pass upstream. The suite mocks `node:fs` with `vi.mock('node:fs')` and no factory, answered by upstream's `__mocks__/fs.cjs` — vendored beside the root by `extraDirs`, and still never loaded: measured 2026-09-14 by putting a `console.error` in that file and watching it not print under vitest 5.0.0, which upstream's vitest 3.2.4 does load. A `test.alias` for `node:fs` was tried and is no better. So those 30 read the real filesystem, list the real `/tmp`, and diff against a memfs snapshot. It is a runner-version divergence in the harness, not a fact about clack or about caique, and it is named here rather than hidden so the other 576 are a number and not a rounding.",
    },
    runner: 'vitest',
    target: 'caique',
    status: 'active',
    note: "Measured 2026-09-08 at 1.8.0: 289 of its 444 assertions are `toMatchSnapshot()`, in 17 of its 19 files — the suite grades clack's exact drawing. A façade that matched those frame for frame would be clack, and caique's design rejects wrapping clack precisely because it \"has no static projection to give\" (U3). What is left when the drawings are removed is limit-options (14) and guide (3). Still `planned` after the 2026-09-14 vendoring run: see the control number recorded in `.sdlc/intents/caique/design.md`. The row names `caique` — the package root that exists — and not a `caique/clack` façade that does not, because naming an unbuilt façade publishes \"target not built yet\" where a measured number belongs (the lesson cli-table3's note records).",
  },
  {
    // 2.16: the testable unit of the inquirer monorepo, and the decision that came with it.
    //
    // `inquirer` the package is 34.3M/wk of the *legacy* API and its tarball ships no
    // tests at all, so there is nothing there to grade. The repo's testable units are
    // `@inquirer/core` — one file, `packages/core/core.test.ts`, 41 cases, and the only
    // one that grades the prompt *loop* rather than a drawing — and `@inquirer/prompts`,
    // 28.8M/wk, which is the API a new CLI writes against and the one caique's design
    // mirrors. So: grade core, and name `@inquirer/prompts` as the compatibility target in
    // caique's README. `inquirer@8` legacy is out of scope, and caique's design says so.
    name: 'inquirer-core',
    npmName: '@inquirer/core',
    repo: 'https://github.com/SBoudrias/Inquirer.js',
    tagPrefix: '@inquirer/core@',
    testDir: 'packages/core',
    packageDir: 'packages/core',
    // The suite is one file beside the implementation, like ora's and string-width's, so
    // the glob names the file rather than a directory.
    testGlob: 'core.test.ts',
    internalDir: 'src',
    imports: [{ upstream: './src/index.ts', subpath: '', reexportDefault: false }],
    surfaceFiles: ['packages/core/src/index.ts'],
    suiteDeps: [
      '@inquirer/core@12.0.3',
      '@inquirer/ansi@2.0.8',
      // The harness the suite renders through: a headless xterm that asserts the screen,
      // not the bytes. Same shape as log-update's `terminal.js`.
      '@inquirer/testing@3.3.13',
    ],
    runner: 'vitest',
    target: 'caique',
    status: 'active',
    note: 'Vendored and controlled 2026-09-14. The row names `caique`, the package root that exists today, so the number is measured rather than "target not built yet".',
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
