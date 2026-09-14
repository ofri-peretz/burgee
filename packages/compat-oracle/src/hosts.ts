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
  {
    // The closeout layer's first graded host. `restore-cursor` is the smallest package in
    // the shutdown layer and the one with the deepest dependency chain for its size —
    // `cli-cursor` (107.6 M/wk) → `restore-cursor` (107.5 M/wk) → `onetime` → `mimic-fn`,
    // four packages to show a cursor again — which is the whole argument in
    // `closeout/intent.md` for the layer existing.
    //
    // Its suite is one file at the repo root beside the implementation, so `testGlob` names
    // that file rather than a directory: the same shape as ora's and string-width's, and for
    // the same reason — "every `.js` here" would vendor `index.js` and grade the host's own
    // implementation as a test.
    //
    // **Where the control's copy of the incumbent comes from, and why that is fragile.**
    // `restore-cursor@5.1.0` is in the committed `package-lock.json` already, as a transitive
    // dependency of `ora` (`ora` → `cli-cursor` → `restore-cursor`), so `npm ci` installs the
    // exact version this row was measured against and the control reproduces on a clean
    // checkout. Nothing *declares* it, though: it is the `@colors/colors` shape recorded in
    // `compat-oracle/package.json`, one `ora` release away from vanishing, and if it does the
    // control goes red rather than quiet, because `controlShortfall` refuses a run that
    // registers nothing.
    name: 'restore-cursor',
    repo: 'https://github.com/sindresorhus/restore-cursor',
    testDir: '.',
    testGlob: 'index.test.js',
    imports: [{ upstream: './index.js', subpath: '/restore-cursor', reexportDefault: true, control: 'restore-cursor' }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'node:test',
    target: 'closeout',
    status: 'active',
    note: "Graded against `closeout/restore-cursor`, the façade, not against `closeout` itself: the root export is the phase registry, and R6 reserves the root default for `signal-exit`'s. The suite spawns a child per case with `process.stdout.isTTY` / `process.stderr.isTTY` forced, so it grades the *stream choice* (stderr first, then stdout, then neither) as much as the escape sequence — which is exactly the part `closeout.showCursor()` gets wrong for this contract, since it re-reads `isTTY` at exit and the fixture deletes it before exiting.",
  },
  {
    // The second incumbent of the shutdown layer, and the one whose suite grades the part
    // that is actually hard: 21 ava cases, 18 of which spawn a fixture and assert the
    // *observed exit code* and the *bytes that made it out* — `SIGINT` → 130, `SIGTERM` →
    // 143, `process.exitCode` preserved on a graceful exit and ignored on a signal, 20,000
    // lines of stdout flushed under backpressure before the process is allowed to leave.
    // That is `closeout/intent.md`'s R10 and R3 graded by somebody else's assertions.
    //
    // ## Where the control's copy of the incumbent comes from
    //
    // `exit-hook` is not in the root manifest and not in `package-lock.json`, and PLAN 2.14
    // states the rule for this whole wave: a vendored grader's dependency goes *inside*
    // `vendor/<pkg>/`, never into the workspace. So the published 5.1.0 tarball is unpacked
    // at `vendor/exit-hook/node_modules/exit-hook/` and committed, which is where the
    // generated `shim.js` resolves it from — five files, MIT, byte-identical to the tarball
    // (sha256 `644e471d…`), and reproduced by the command in this directory's `PROVENANCE`.
    //
    // **That is necessary and, today, not sufficient.** `run.ts`'s `writeInternalShims()`
    // calls `packageRoot(host.name)` *eagerly* whenever the target is the host itself —
    // before the loop over `internals`, so it runs even for a suite like this one that has
    // none. `packageRoot` resolves by bare name from `packages/compat-oracle/dist/`, which a
    // vendor-local install cannot satisfy, and the control run dies with
    // `ERR_MODULE_NOT_FOUND` instead of grading. Moving that call inside the loop is one
    // line, and it is the line that makes PLAN 2.14's stated arrangement actually work; until
    // it lands, `--control` also needs `exit-hook` resolvable from the oracle's own package
    // (the measurements below were taken with the same tarball unpacked at
    // `packages/compat-oracle/node_modules/exit-hook/`, which `npm ci` does not create).
    // The target run is unaffected: it resolves `closeout/exit-hook` and never calls
    // `packageRoot`.
    //
    // ## The four cases that are a race, measured rather than suspected
    //
    // `SIGINT`, `SIGTERM` and their two `…causes process.exitCode to be ignored` siblings
    // spawn a fixture and kill it after a **fixed 1000 ms**. If the child has not finished
    // evaluating its module graph by then, the signal takes its default action and the child
    // dies *without* its handler — `isTerminated: true`, `exitCode: undefined`, empty stdout,
    // which is exactly the assertion failure observed. Measured 2026-09-14 on a machine at
    // load average 22 on 14 cores, against **real `exit-hook`**: 4 of 10 fixture runs lost
    // that race at 1000 ms, and **0 of 10 lost it when the same fixture was killed on a
    // readiness signal instead of on a clock**. The control's whole-suite rate over nine runs
    // was 21 / 21 six times, 17 / 21 twice and one ava crash, with the same four cases
    // failing together every time; the target's distribution over five runs was identical.
    //
    // So the ceiling for both is 21 / 21, that is what is recorded, and **a 17 / 21 on this
    // row is this race, not a regression** — check the four names before believing anything
    // else. No `controlFailures` allowance is declared on purpose: an allowance of 4 on a
    // 21-case suite would be a 19% blind spot that a genuinely broken implementation could
    // hide in, and this dialect cannot take an `Exclusion` either (`summarize()` refuses one
    // on a runner whose TAP carries only summary counts, which is ava's). A red run here is
    // loud and occasionally wrong, which is the right way round.
    name: 'exit-hook',
    repo: 'https://github.com/sindresorhus/exit-hook',
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '/exit-hook', reexportDefault: true, control: 'exit-hook' }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    target: 'closeout',
    status: 'active',
    note: "Graded against `closeout/exit-hook`. The suite's fixtures live in `fixtures/` and `import … from '../index.js'`, which the vendor step rewrites to the same generated shim the test file gets, so one unedited suite grades either implementation. `ava` and `execa` are declared at the workspace root already, which is what `vendored-suite.test.ts` checks; the incumbent itself is the vendor-local copy described above.",
  },
  {
    // **Not graded, and the reason is the harness rather than the suite.**
    //
    // `signal-exit` is the headline incumbent of this layer — 198.9 M/wk, last published
    // 2023-07-29, inside npm's own dependency tree — and `closeout/intent.md` R4 makes its
    // pass rate the gate on the whole `overrides` recipe. It is deliberately *not* vendored:
    // a directory of tests that cannot be run is worse than no directory, because
    // `vendored-suite.test.ts` would then have to be told to ignore it, and an exclusion
    // that large reads as a decision when it is a blockage.
    //
    // Measured 2026-09-14 against the repo at `v4.1.0`, four separate blockers, each in a
    // file this lane may not write:
    //
    //  1. **Its runner is `tap`, and `Host['runner']` has no such member.** PLAN's wave-2
    //     table says "tap ✅ TAP native"; `src/run.ts`'s `command()` has four branches —
    //     `vitest`, `node:test`, `ava`, `mocha` — and tap is not one of them. The row in the
    //     plan was written from `npm view signal-exit scripts.test` and not from this file.
    //  2. **Half the suite is TypeScript run through a loader.** `test/*.ts` (four files) are
    //     executed by tap with `--loader ts-node/esm`, declared in the host's own
    //     `package.json` `tap.node-arg`. Neither `tap` nor `ts-node` is declared in this
    //     workspace, and `vendored-suite.test.ts` fails any vendored file that names a
    //     package no manifest declares — so vendoring the suite turns that lock red.
    //  3. **Its tests reach into `dist/`, which the vendor step cannot shim.**
    //     `test/all-integration-test.ts`, `test/fallback.ts`, `test/signals.js` and two
    //     fixtures import `../dist/cjs/index.js` and `../dist/cjs/signals.js`.
    //     `INTERNAL_PATTERNS` in `src/vendor.ts` knows `lib` and `src` and *throws* on
    //     anything else, so `internalDir: 'dist'` is a change to that file, not a field here.
    //  4. **`test/signals.js` asserts through `t.matchSnapshot()` against `tap-snapshots/`**,
    //     which is tap's own snapshot format and has no reader outside tap.
    //
    // What unblocks it, in order: a `tap` branch in `command()` plus `'tap'` in the union
    // above; a `dist` entry in `INTERNAL_PATTERNS`; and `tap` + `ts-node` as vendor-local
    // devDependencies under `vendor/signal-exit/` (PLAN 2.14's rule, the same arrangement
    // `exit-hook` uses here). That is the `run.ts`/`vendor.ts` owner's work — one dialect,
    // the same size as PLAN 2.14's `cross-spawn` decision — and it is worth doing, because
    // this is the one row `closeout`'s distribution claim rests on.
    name: 'signal-exit',
    repo: 'https://github.com/tapjs/signal-exit',
    testDir: 'test',
    testGlob: '*.{js,ts}',
    imports: [{ upstream: '../dist/cjs/index.js', subpath: '/signal-exit', reexportDefault: false }],
    surfaceFiles: ['src/index.ts', 'src/signals.ts'],
    // Declared for the day the dialect lands; nothing reads it while the status is `planned`.
    runner: 'node:test',
    target: 'closeout',
    status: 'planned',
    note: '198.9 M/wk and stale since 2023-07-29 — the layer\'s headline incumbent. Blocked on the harness, not on closeout: its suite runs under `tap` with a `ts-node/esm` loader and reaches into `dist/`, and all three are edits to `run.ts` and `vendor.ts`. `runner` reads `node:test` as a placeholder so this entry type-checks; it is wrong on purpose and unread while the status is `planned`, and the dialect that lands must correct it. **No baseline fragment exists for this host, and that is the honest state** — a row here with a number in it would be a number nothing measured.',
  },
];

export const active = (): Host[] => HOSTS.filter((h) => h.status === 'active');
