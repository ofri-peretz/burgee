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
   *
   * **`tap` is declared but not yet executable.** node-tap files emit flat TAP that
   * `summarize()` already reads correctly — measured 2026-09-14, `node tests/test-parse.js`
   * in a dotenv 17.4.2 checkout prints `ok 1 … 1..47` at column zero, which is exactly the
   * dialect `parseFlatTap` counts. What is missing is the *invocation*: `run.ts`'s
   * `command()` has no `tap` arm, and its final `return` is mocha's, so a host declaring
   * `tap` would be handed to mocha and silently graded as zero. A `tap` host must therefore
   * stay `planned` until `run.ts` grows the arm — one spawn per file, outputs concatenated,
   * which is all node-tap needs (`node --test` is not that arm: measured, it collapses a
   * 47-case file to one `ok`).
   */
  runner: 'node:test' | 'mocha' | 'ava' | 'vitest' | 'tap';
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
    // R3's grader. `strip-ansi` is 464 M/wk and ships one dependency (`ansi-regex`, 345 M/wk)
    // for a single scan — the clearest instance of the fragmentation `linegauge` exists to
    // collapse. Its suite is eight cases and every one of them is a shape `strip` has to get
    // right: OSC 8 hyperlinks, the 8-bit CSI introducer ``, and a bare BEL terminator.
    //
    // Its suite is one file at the repo root beside the implementation, so `testGlob` names
    // that file rather than a directory — the ora / string-width shape.
    name: 'strip-ansi',
    repo: 'https://github.com/chalk/strip-ansi',
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    target: 'linegauge/strip',
    status: 'active',
    note: 'Graded against the `linegauge/strip` subpath, not the root: the root default is `width` (R8), so a strip-ansi façade can only be a subpath.',
  },
  {
    // `wrap-ansi` is the one incumbent in this layer with a measured correctness gap, and it
    // is already closed upstream: two family-ZWJ emoji hard-wrapped at three columns come back
    // as **eight** fragments under 8.1.0 and 9.0.2 and as two correct lines under 10.0.1
    // (`cli-foundation-stack/baseline.md`, 2026-09-10). `linegauge/src/wrap.ts` is a port of
    // 10, so this row grades the port against the major it was ported from — which is exactly
    // what `wrap.test.ts` asserts in-package, and what this makes public.
    //
    // `testDir`/`testGlob`/`runner` were wrong here while the row was `planned`, and measuring
    // is what corrected them: 10.0.1 keeps one `test.js` at the repo root and runs it under
    // `node:test`, not a `test/` directory under ava. A planned row's shape is a guess until
    // a vendor run touches it.
    name: 'wrap-ansi',
    repo: 'https://github.com/chalk/wrap-ansi',
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'node:test',
    target: 'linegauge/wrap',
    status: 'active',
    note: "80 / 80 control and 80 / 80 target, measured 2026-09-14 — the port reproduces wrap-ansi 10 exactly, which is what `wrap.test.ts` already asserted in-package and this makes public. Its suite imports `has-ansi`, which is committed under `vendor/wrap-ansi/node_modules/` rather than added to the root manifest; `vendor/wrap-ansi/.gitignore` carries the reason and the one hazard (a `--vendor` re-run deletes it).",
  },
  {
    // R4's grader, and the reason the style stack was extracted from `wrap.ts` at all:
    // `slice-ansi` and `wrap-ansi` each carry their own copy of open/close/reopen and
    // disagree at the edges.
    //
    // **Vendored at 7.1.2, not at the 9.0.0 on npm, and that is a deliberate pin.** The
    // control run grades the suite against the *installed* `slice-ansi`, and this workspace
    // resolves `^7.1.0` from the root manifest. Vendoring 9.0.0's suite against a 7.1.2
    // control would measure the gap between two of the incumbent's own majors and publish it
    // as ours. Moving this row to 9 is a root-manifest bump, which belongs to the integrator
    // lane; `--upstream` reports the gap every day until it happens.
    name: 'slice-ansi',
    repo: 'https://github.com/chalk/slice-ansi',
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    target: 'linegauge/slice',
    status: 'active',
    note: "15 / 15 control, 13 / 15 target, measured 2026-09-14. The two are named rather than excluded, because an ava host's TAP reaches `summarize` through the summary-line dialect and the oracle refuses an exclusion it cannot match by name. (1) `can slice a string with unknown ANSI color` is a real gap: slice-ansi re-emits *any* SGR parameter it saw and closes with a reset, so `ESC[1001m` survives a cut; `linegauge`'s style stack tracks the codes it knows and drops that one, returning bare `TES`. Ours is the wrong answer — the sequence is the caller's, not the library's to vet. (2) `slice links` is `test.failing()` in slice-ansi's *own* suite: the incumbent cannot round-trip an `OSC 8` hyperlink and says so. `linegauge` can, and ava reports a passing `test.failing` as `not ok`. So one of the two failures on this row is the target being **more** correct than the host, which is exactly the sort of number a compat rate must not quietly launder — 13 / 15 stands, with the reason beside it. Its suite imports `random-item`, committed under `vendor/slice-ansi/node_modules/`.",
  },
  {
    // seniority's two incumbents (PLAN 2.2–2.13, `seniority/design.md` R10).
    //
    // `cosmiconfig` is the one the root export is graded against: R8 says the default export
    // matches cosmiconfig's exactly, so its own suite is the only thing that can hold that
    // claim to cosmiconfig's definition of it rather than ours.
    //
    // `test/util.ts` is a helper, not a test — `TempDir`, which ten of the eleven files
    // import as `'./util'`. `copySiblings` looks for a file at that exact name and TypeScript
    // writes it with an extension, so the sibling is never found and every file that imports
    // it fails to load. `extraDirs: ['test']` is the way to bring it: the copy runs before
    // `copyTests`, which then overwrites each `*.test.ts` with its rewritten form and leaves
    // the helper alone. It is not the field's original purpose (yargs uses it for `locales`),
    // and it is the only mechanism here that moves a non-test file into the suite.
    name: 'cosmiconfig',
    repo: 'https://github.com/cosmiconfig/cosmiconfig',
    testDir: 'test',
    testGlob: '*.test.ts',
    internalDir: 'src',
    imports: [{ upstream: '../src', subpath: '', reexportDefault: false }],
    // One *file*, not a directory: `cpSync(…, { recursive: true })` copies either, and this
    // is the narrowest thing that works. Copying the whole `test/` directory also brings
    // `test/tsconfig.json`, which vite's oxc transform reads and then dies on —
    // `[TSCONFIG_ERROR] Failed to load tsconfig ''`, all nine files, measured — because it
    // `extends` a base outside the copy and declares a project `reference` to a directory
    // that is not vendored. Vendoring the base alongside does not help; not vendoring the
    // tsconfig at all does.
    extraDirs: ['test/util.ts'],
    surfaceFiles: ['src/index.ts', 'src/types.ts'],
    runner: 'vitest',
    target: 'seniority',
    status: 'planned',
    note: "Vendored 2026-09-14 at 10.0.1 and NOT activated, because the control cannot reach 100% here and a control below its own reference is a finding, not a number to record. Two reasons, both measured: (1) its suite reaches for `env-paths` and `parent-module`, which neither `compat-oracle/package.json` nor the root manifest declares — `vendored-suite.test.ts`'s install lock is red until one of them does, and both files belong to the harness/integrator lanes; (2) `index.test.ts` imports and `vi.mock`s `../src/Explorer`, `../src/ExplorerSync` and `../src/types`, and cosmiconfig's published tarball is `files: [\"dist\"]` — so the control's internal shims, which resolve against the *installed* package, point at paths npm does not ship. That is a new shape for C4: an internal-reaching file that is also a public-surface file, which the classifier calls `public` and therefore gates.",
  },
  {
    // The load-bearing one. `.sdlc/intents/seniority/issues.md` records 20 closed issues at
    // ten reactions or more against dotenv, topped by #89 "Importing dotenv in ES6" at 165 —
    // the largest closed-issue demand signal of any incumbent in this layer.
    name: 'dotenv',
    repo: 'https://github.com/motdotla/dotenv',
    testDir: 'tests',
    // `test-*.js` and not `*.js`: the directory also holds `.env` fixtures and a `types/`
    // subdirectory whose `test.ts` is a `tsc` type-check, not a runnable case.
    testGlob: 'test-*.js',
    imports: [{ upstream: '../lib/main', subpath: '/dotenv', reexportDefault: false }],
    // Seven files, all of them named individually because `copyTests` copies a *directory*
    // whole and otherwise takes only files the glob matches — and every fixture dotenv reads
    // is a dotfile beside the tests, which no glob of runnable tests can name.
    //
    //   `config.js`  the preload entry `test-config-cli.js` spawns as `node -r ./config`.
    //                It is at the repo root, not under `tests/`, and it reaches the library
    //                through `./lib/main`, which is already a shimmed internal — so
    //                vendoring the file is enough to point it at whatever is being graded.
    //                Measured: without it that file scores 0 / 3, with it 3 / 3.
    //   `tests/.env…` the five fixtures the suite parses.
    extraDirs: ['config.js', 'tests/.env', 'tests/.env-multiline', 'tests/.env.local', 'tests/.env.multiline', 'tests/.env.vault'],
    surfaceFiles: ['lib/main.d.ts', 'lib/main.js'],
    runner: 'tap',
    target: 'seniority/dotenv',
    status: 'planned',
    note: "Vendored 2026-09-14 at 17.4.2 and NOT activated: its suite is node-tap, and `run.ts`'s `command()` has no `tap` arm — see the `runner` field's own comment for what the arm is and for the measurement that rules `node --test` out. Its suite also reaches for `tap`, `sinon` and `decache`, which the oracle does not declare; like cosmiconfig's, that declaration is the harness lane's file. Target `seniority/dotenv` is R8's compatibility subpath and is not built yet, so the target run is an honest 0 the moment the control can run at all.",
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
  // ---------------------------------------------------------------------------------------
  // paratext's three incumbents (PLAN 2.2–2.13, `paratext/design.md` R9). This is the layer
  // with **no demand signal**: `.sdlc/intents/paratext/issues.md` records 2 open issues and 0
  // closed above ten reactions across all three trackers, so nothing here can be justified by
  // "users asked". The compatibility claim rests entirely on these suites, which is why the
  // rows below say what they do *not* measure as loudly as what they do.
  // ---------------------------------------------------------------------------------------
  {
    name: 'ansi-escapes',
    repo: 'https://github.com/sindresorhus/ansi-escapes',
    // One file at the repo root beside the implementation — ora's shape, and the reason the
    // glob names the file: "every `.js` here" would vendor `index.js` and grade it as a test.
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'index.js', 'base.d.ts', 'base.js'],
    runner: 'ava',
    // The entry point that replaces it is the package root: `paratext/design.md` R8 puts the
    // ansi-escapes-compatible default export in `index.ts`, not behind a subpath. Naming a
    // `paratext/ansi-escapes` façade instead would publish the oracle's `target not built
    // yet` note in place of a number, which is the mistake cli-table3's row is written to
    // stop. Today it is a *measured* zero, and the raw TAP says why in one line.
    target: 'paratext',
    status: 'active',
    note: "Vendored 2026-09-14 at 7.3.0 from the tag, never the tarball: `npm pack ansi-escapes && tar tzf ansi-escapes-7.3.0.tgz | grep -c test` is **0**, because its `files` array ships four files and no suite. Control **4 / 4, 100.0%**; target `paratext` **0 / 4**, and the reason is one line of TAP — `SyntaxError: The requested module 'paratext' does not provide an export named 'default'`. That is R8 unbuilt, stated by the host's own suite, which is exactly what design R9 said this row was for (\"it grades R7 and tells us where R8 must match\"). **Its own suite is four tests, and three of them are CSI.** `default export` and `clearTerminal` assert `cursorTo(2, 2)` and the clear sequence, `synchronized output` asserts `ESC [ ? 2026 h/l`; only `named export(s)`, which checks that `setCwd` is the same function object as the default export's member, touches OSC at all. paratext owns OSC and states CSI out of scope, so this row can never legitimately reach 4 / 4 — the ceiling is 1, and a reader who sees 25% must read it as \"the one OSC case\", not as \"a quarter compatible\". The out-of-scope three cannot be recorded as an `excludes` subtraction: ava's TAP prints counts and no per-case names, and `summarize()` refuses an exclusion it cannot name (run.ts). So the ceiling is written here, in prose, and the rate is read with this paragraph or not at all.",
  },
  {
    name: 'terminal-link',
    repo: 'https://github.com/sindresorhus/terminal-link',
    testDir: '.',
    testGlob: 'test.js',
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    target: 'paratext',
    status: 'planned',
    note: "**Not vendored, and that is the lock's decision rather than mine.** The suite was vendored at 5.0.0 on 2026-09-14 (`v5.0.0` -> commit 975358c3, tarball ships no test like the other two) and then deleted again, because committing it turns `vendored-suite.test.ts` > \"declares every package a vendored suite reaches for by name\" red: its ten cases `import supportsHyperlinks from 'supports-hyperlinks'` and reassign `supportsHyperlinks.stdout` per case, and that package is declared in neither manifest — measured, `undeclared` comes back as `['supports-hyperlinks (vendor/terminal-link/test.js)']`. It is needed for the *target* run too, not only the control, because the bare import is in the test rather than in the implementation. The control additionally needs `terminal-link` itself: without it `packageRoot()` throws `ERR_MODULE_NOT_FOUND` out of `writeInternalShims` and takes the whole oracle process down rather than reporting one red row. Both are root-manifest edits, which is the integrator lane's file and not a package lane's. One more thing to settle before grading: upstream declares `ava: { serial: true }` and every case mutates that one shared module object, while `rootPackage()` in vendor.ts writes a fresh manifest carrying name, type, main, version, license and repository and *not* the `ava` block — so the vendored copy would run ten state-mutating cases concurrently. Activate when the root manifest declares `terminal-link` and `supports-hyperlinks` and vendor.ts carries the host's ava config.",
  },
  {
    name: 'term-img',
    repo: 'https://github.com/sindresorhus/term-img',
    testDir: '.',
    testGlob: 'test.js',
    // `fixture.jpg` is not a test and not a directory, and eleven of the sixteen cases call
    // `terminalImage('fixture.jpg')`, which `fs.readFileSync`s it relative to cwd — and cwd
    // is the vendored root. Without this the suite fails on the file system, not on us.
    extraDirs: ['fixture.jpg'],
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    target: 'paratext',
    status: 'planned',
    note: "Vendored 2026-09-14 at 7.1.0 (`v7.1.0` -> commit c495c815). **Its suite runs headless**, which was the open question: term-img draws through the iTerm2 inline-image protocol, so \"can it run without a terminal\" had to be answered before a rate meant anything. Read off the vendored file, the answer is yes — every case sets `TERM_PROGRAM` / `TERM_PROGRAM_VERSION` / `KONSOLE_VERSION` and `process.platform` by hand and asserts the returned string or the thrown `UnsupportedTerminalError`. No tty, no protocol round-trip, nothing rendered. The suite is 13 `test()` calls, one of them a loop over a five-terminal table, so **18 cases**. It is not graded for one reason only: `term-img` is in neither manifest and so not in node_modules (measured 2026-09-14 on a clean `npm ci`), and without it the control does not fail — it throws `ERR_MODULE_NOT_FOUND` out of `packageRoot()` and kills the oracle process. That is a root-manifest edit, the integrator lane's file. Two notes for whoever activates it. Its cases read `fixture.jpg` from cwd, which is why `extraDirs` names that file — it is not a directory, and `cpSync` copies it because the copy is recursive. And `iTerm2 support` is the one case that reaches a real machine: it calls `iterm2-version()`, which reads the installed iTerm2's Info.plist, so on a Linux runner it returns undefined and the case throws. That is a `controlFailures` allowance to declare with this sentence, not a compatibility defect — and it must be declared *before* the row goes active, or the control is red on CI and green on a Mac.",
  },
];

export const active = (): Host[] => HOSTS.filter((h) => h.status === 'active');
