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

/**
 * Cases the suite registers on some platforms and **does not register at all** on others,
 * because the suite itself guards them with the platform.
 *
 * This is not a skip. A skipped case registers, prints `# SKIP`, and `controlShortfall`
 * already accounts for it — that accommodation exists because commander and yargs each skip
 * one OS-specific test on Linux. A case inside `if (process.platform === 'linux') { … }` is
 * never handed to the runner, so it prints nothing, and the only visible effect is that the
 * suite is smaller. There is nothing for an inference to read.
 *
 * Which is exactly how it reached a published page. `cosmiconfig`'s suite is **241 cases on
 * darwin and 243 on ubuntu**, and until this field the reference was whichever machine last
 * recorded it: `compat:page --check` on PR #338 read a row committed from darwin as
 * `186 / 241, 77.2%` and measured the same row on ubuntu at `76.5%`, because `rate()`
 * divides by `max(reference, registered)` and ubuntu registered 243. Same target, same
 * commit, two published rates.
 *
 * The fix is to record the **full** set as the reference and declare what the other
 * platforms lack, rather than to subtract the cases or to let the smaller machine set the
 * number. Both halves matter: the denominator is then 243 everywhere, and the cases a
 * platform does have are still all counted, so nothing is quietly excused. The declaration
 * narrows and never widens — it is spent only on the platforms outside `only`, and only up
 * to `count`.
 */
export interface ConditionalCases {
  /** How many cases the platforms that lack them do not register. Exact, not a ceiling. */
  count: number;
  /**
   * The platforms that register them, for a suite written `if (process.platform === 'x')`.
   * Exactly one of `only` and `notOn` is given, and which one is not a style choice: each
   * mirrors how the guard is actually spelled, so the declaration can be checked against the
   * line it describes instead of being a list somebody derived.
   */
  only?: NodeJS.Platform[];
  /** The platforms that do not, for a suite written `if (process.platform !== 'x')`. */
  notOn?: NodeJS.Platform[];
  /** Which cases, and the line of the suite that guards them. A lock refuses an empty one. */
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
  /** Cases only some platforms register at all, so the reference is the same everywhere. */
  conditionalCases?: ConditionalCases;
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
   * Packages this host's *suite* reaches for by name, written into the vendored root's
   * `package.json` rather than into the workspace.
   *
   * The workspace manifests are where a suite's dependencies have lived until now (yargs'
   * `cpr` and `hashish` are root devDependencies for exactly this reason), and that is
   * still the better home — but it is one lane's to change, because a Mac-regenerated
   * `package-lock.json` fails Lockfile Sync. Declaring them here instead says out loud what
   * the suite needs, and `vendored-suite.test.ts` holds it to something stronger than the
   * root list gets: every name declared here must actually **resolve** from the vendored
   * directory, so the day the hoist stops supplying one the oracle goes red instead of
   * quietly losing a file. That hole is not hypothetical — `@colors/colors` reached four of
   * cli-table3's test files as a hoisted optional dependency of cli-table3 itself.
   */
  vendorDeps?: Record<string, string>;
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
   * The same thing for ava, and it is the same argument: a setting from the host's own
   * manifest that its assertions depend on, carried into the vendored root's `package.json`
   * under its `ava` key so the suite runs the way upstream runs it.
   *
   * It is a *separate* field from `vitestConfig` rather than one generic `runnerConfig`
   * because the two land in different files — vitest's in a generated `vitest.config.mjs`,
   * ava's in the manifest ava reads from cwd — and a single field would hide which.
   *
   * `terminal-link` is why it exists. Upstream declares `ava: { serial: true }`, all ten of
   * its cases mutate one shared module object (`supportsHyperlinks.stdout`), and
   * `rootPackage()` wrote a fresh manifest without the block — so the vendored copy would
   * have run ten state-mutating cases concurrently and the row would have read whatever the
   * interleaving gave it. This is harness, not leniency: it is upstream's own setting, named
   * here, and it touches no assertion.
   */
  avaConfig?: Record<string, unknown>;
  /**
   * The TypeScript loader a `tap` host's suite is run under, when half its files are `.ts`.
   *
   * The `tap` arm is `node <file>` per file, and Node 24 strips types natively — which is
   * enough for some suites and not for `signal-exit`'s. Measured 2026-09-16 on Node 24.18,
   * plain `node`: `fallback.ts` runs, and the other three do not, for two reasons neither of
   * which is about the implementation being graded. `signal-capture.ts` imports a *type* as a
   * value (`import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'`) and
   * type-stripping is erasure without a type-checker, so the binding survives and the module
   * fails to link. `all-integration-test.ts` and `signal-exit-test.ts` import
   * `'./fixtures/exec-err'` without an extension, which is TypeScript's resolution and not
   * ESM's.
   *
   * Upstream handles both with `--loader ts-node/esm`, declared in its own
   * `package.json` `tap.node-arg`. **That does not run on Node 24**: measured, every `.ts`
   * file dies with `ERR_REQUIRE_CYCLE_MODULE` out of `importSyncForRequire`, because
   * `require(esm)` landed after signal-exit was last published in 2023.
   *
   * `tsx` transpiles both constructs and is already a devDependency of this workspace, so
   * it is named here and resolved through the module system rather than by path. This is the
   * same substitution the `runner` field already makes when a jest suite runs under vitest:
   * upstream's transpiler swapped for the equivalent that works here, with no assertion
   * touched and no file edited. A closed set of one, so adding a second is a line somebody
   * wrote on purpose.
   */
  tsLoader?: 'tsx';
  /**
   * How its suite is executed. `vitest` is what a jest suite runs under, since jest's
   * globals are vitest's and vitest is already here. `exit-code` is not a TAP dialect at
   * all: it runs each file with node and grades the whole suite as one pass/fail bit, for
   * a host whose suite prints nothing a parser can read.
   *
   * **`tap` is executable as of 2026-09-16, and it is the arm this comment specified.**
   * node-tap files emit flat TAP that `summarize()` already read correctly — measured
   * 2026-09-14: `node tests/test-parse.js` prints `ok 1 … 1..47` at column zero, exactly the
   * dialect `parseFlatTap` counts. What was missing was the *invocation*: `command()` returns
   * one spawn and this dialect needs one per file, so a host declaring `tap` fell through to
   * mocha's final `return` and would have been graded as zero. `runTapFiles` in `run.ts` is
   * the arm — one spawn per file, outputs concatenated — and `dotenv` is the first row
   * through it, at a 141 / 141 control. `node --test` is **not** that arm: measured, it
   * collapses a 47-case file to one `ok`.
   *
   * One property of this dialect a reader has to carry: node-tap's plan counts **assertions**,
   * so the denominator moves with the branches that ran. dotenv's control plans sum to 141 and
   * its target's to 147. `rate()` divides by the larger, so nothing can score above its own
   * denominator, and the row is coarser than a per-case one without being dishonest.
   */
  runner: 'node:test' | 'mocha' | 'ava' | 'vitest' | 'tap' | 'exit-code';
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
    note: "Decided 2026-09-08 in `.sdlc/intents/output-stack-compat/design.md`; every count corrected 2026-09-09 after measurement, because the ones written here were wrong. The suite runs **235** cases: 197 reach the host's internals (`../src/cell`, `../src/utils`, `../src/layout-manager` — 94 + 63 + 11 + 29 across four files) and **38** reach the package root — table-test.js 10, original-cli-table-newlines-test.js 5, verify-legacy-compatibility-test.js 18 (it runs its nine assertions twice) and test/issues/ 5, in four files that were vendored, committed and graded by nobody until the walk became recursive. Of those 38, the nine excluded above grade cli-table rather than the target, so **29 gate**. Under C4 a file importing only the host's internals is informational and never gated, because passing it means reproducing the host's file layout, which is the thing that rule exists to refuse. The target moved to `flagstaff/cli-table3` when that façade landed — the condition this note set for the move. Until then the target was `flagstaff/table`, the table API that is deliberately *not* a cli-table3 façade, and it measured 0 / 29; that zero was measured, not assumed. The rule the move respects: never name the target after a façade that does not exist, because that publishes `target not built yet` where there had been a real number.\n\n**The internals column, measured 2026-09-20: 0 / 104 -> 90 / 104, against a control of 103 / 104.** Three numbers in the paragraph above need reading together, and only one of them is what the column counts. 197 internal cases are *written* — 94 + 11 + 29 + 63 in `cell-test.js`, `layout-manager-test.js`, `table-layout-test.js` and `utils-test.js`. **103 of them ever register.** `cell-test.js` dies at load, for the control exactly as for the target, so its 94 cases are not failures — they are absent, and the column's denominator of 104 is those 103 plus the one file-level entry the dead file leaves behind. The reason is in the runner's own generated `vitest.setup.mjs` and is not about either implementation: the file opens with `jest.requireActual('../src/utils')`, a *relative* id, and the wrapper that supplies `jest` is anchored at the vendored root and cannot know its caller. That comment already says so. What was missing is that nobody had written down what it costs — 94 cases, 48% of the internals, invisible on both sides of the measurement. It is **not** a `controlFailures` allowance and must not be declared as one: that field is counted against the *gated* row, where this host is 29 / 29 and the correct allowance is zero.\n\n**What moved the 103, and what it cost.** Every one of the 104 failed as `X is not a function`. Not a divergence — a delivery failure. `internalShimBody` writes `module.exports = loaded?.default ?? loaded` for a CommonJS host, and that unwrap is correct for a target whose whole meaning is its default export and lossy for one whose names live beside it: the namespace of `flagstaff/cli-table3` carries `Cell`, `strlen`, `computeWidths` and fifteen more, and `.default` is the `Table` class alone. The fix is one line at the foot of `cli-table3.ts` hanging that surface off the default export — which is how cli-table3's own `src/cell.js` publishes `ColSpanCell` and `RowSpanCell` — and it cost 240 B, the whole of the headroom `flagstaff`'s `weight.test.ts` had left on that entry, so its budget moved 29,000 -> 29,300 with the reasoning written there. The honest reading of that line is that it accommodates the instrument: the names were already public, and the shim is where the loss happens. Fixing `internalShimBody` instead would be the smaller lie and it is `run.ts`'s to make, not this row's.\n\n**CEILING — 13 cases in `table-layout-test.js`, and they are one cause with two faces.** The shim maps all four of cli-table3's internal modules to the target's single entry, so `require('../src/cell')` hands the suite `Table`, not `Cell`. Nine cases — `simple 2x2 layout`, `cross table`, `vertical table`, `colSpan adds RowSpanCells to the right`, `rowSpan adds RowSpanCell below`, `rowSpan and cellSpan together`, `complex layout`, `complex layout2`, `stairstep spans` — die in `checkExpectation` on `expect(actualCell).toBeInstanceOf(Cell)`. Four more — the `fillInTable` block: `will blank out individual cells`, `will autospan to the right`, `will autospan down`, `will autospan right and down` — build their fixtures with `new Cell(opts)`, which constructs a `Table` and leaves `content` undefined. Neither is reachable from this package: a target with one entry point cannot make `../src/cell`'s default both the `Cell` class and the `Table` class, and the only ways to fake it — a `Symbol.hasInstance` on `Table`, or a `Table` constructor that returns a `Cell` for a string — are lies about our own types. **The layout algorithm behind the ceiling was measured anyway**, with a throwaway `Symbol.hasInstance` applied to `dist` and never committed: the column reads 99 / 104, so nine of the thirteen pass on content and the remaining four are the same artifact wearing its other face. No divergence hides there. Closing them needs `internalShimFrom` to resolve an internal path to something other than the target's main entry, which is `run.ts`'s call.",
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
    note: "229 / 229 control and 229 / 229 target, measured 2026-09-15 — up from 201 / 229, and the 28 that moved were four defects rather than twenty-eight, categorised in `.sdlc/intents/linegauge/design.md` § R10 before any of them was touched. (A) `Intl.Segmenter` joins a run of conjoining Hangul jamo into one cluster, and measuring that cluster by its first code point answered 2 where a terminal draws 12; modern Hangul composes L + V (+ T) into one two-column syllable and leaves the rest additive — 10 cases. (B) the zero-width class matched `\\p{Mark}`, which is the spacing marks as well as the non-spacing ones, so Devanagari vowel sign AA measured 0 — 3 cases. (C) a prepended concatenation mark is `Format` but not `Default_Ignorable`, so it missed the zero-width class, was then stripped as leading non-printing, and was charged a column for the code point 0 that remained — 3 cases. (D) `\\p{RGI_Emoji}` matches only the fully-qualified spelling, so the same sequence without its `U+FE0F` fell through to the East Asian Width of its base scalar — 12 cases. Every one of the four was linegauge wrong and the incumbent right; none is a judgement call, which is why the row is now exact rather than argued. linegauge exports `width` as its default, which is the shape string-width's own tests import.",
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
    // The jest host, and the one the plan expected to need a fifth TAP dialect. It does not.
    //
    // `npm view cross-spawn scripts.test` is `jest --env node --coverage`, and jest emits no
    // TAP — which is why `.sdlc/PLAN.md` §2.14 planned a vendored `jest-tap-reporter`. But
    // the dialect that grades a jest suite was already here: cli-table3's suite is jest's
    // too, and it runs under **vitest**, whose `tap-flat` reporter this file's runner has
    // parsed since that host was activated. jest's globals are vitest's; the three this
    // suite reaches for that `globals: true` does not supply (`setTimeout`, `spyOn`,
    // `restoreAllMocks`) are mapped in `run.ts`'s generated setup file beside the existing
    // `fn`, `mock` and `requireActual`. So this row costs no new package in the workspace,
    // no new package under `vendor/`, and no fifth parser — measured 2026-09-14.
    //
    // What it *does* cost is three test dependencies: the suite requires `rimraf`, `mkdirp`
    // and `path-key` by name. They are declared in `vendorDeps` rather than at the root for
    // the reason written there.
    name: 'cross-spawn',
    repo: 'https://github.com/moxystudio/node-cross-spawn',
    testDir: 'test',
    testGlob: '*.test.js',
    // The suite never imports the host directly: `test/util/run.js` does, as `../../index`,
    // and the rewrite resolves it from that file's own directory onto the one shim.
    imports: [{ upstream: '../index', subpath: '', reexportDefault: true }],
    vendorDeps: { mkdirp: '^0.5.1', 'path-key': '^3.1.0', rimraf: '^3.0.0' },
    surfaceFiles: ['index.js'],
    runner: 'vitest',
    target: 'bellpull/cross-spawn',
    status: 'active',
    note: "The suite runs each of its cases four times — `spawn`, `spawn-force-shell`, `sync`, `sync-force-shell` — so a divergence in one path cannot hide behind the other three. It is also the most load-sensitive row here: every case spawns a real subprocess under the suite's own `jest.setTimeout(10000)`, and `sync-force-shell > should support shebang…` spawns three. Measured 2026-09-14 on a 14-core machine at load 16–21 (five agents at once), one `spawn.sync` of the shebang fixture took 0.6–3.5 s and that case timed out in 3 runs of 6; at load ~1 the same call takes 32 ms and the control is 68 / 68 every time. A control of 67 / 68 on this case means the machine, not the target — which is a reason to read the TAP before re-recording anything, not a reason to widen a timeout the suite chose.",
  },
  {
    // The host with no parseable output, and the reason `mode: "exit-code"` exists.
    //
    // `npm view rc scripts.test` is `set -e; node test/test.js; node test/ini.js; node
    // test/nested-env-vars.js`: three scripts of bare `assert` calls that print their config
    // objects with `console.log` and say nothing about cases. There is no reporter to ask for
    // TAP, so the honest grade is one bit — the suite ran against this target and exited 0 —
    // and `baseline/rc.json` has to carry `mode: "exit-code"` so the row says on its face
    // that it is coarser than the others.
    //
    // **The blocker this row carried was a misreading of its own options, and it is gone.**
    // The note said `rc` had to become a root devDependency — a `package-lock.json` edit the
    // integrator lane owns — "because nothing installs a vendored manifest". That is true of
    // `vendorDeps`, which leans on the workspace hoist, and false of `suiteDeps`, which
    // `installSuiteDeps` installs into `vendor/rc/node_modules` at an exact pin on the first
    // grade of a clean checkout. It is the same arrangement clack and `@inquirer/core` use
    // for the incumbent their controls re-export, and `vendored-suite.test.ts` accepts it as
    // a declaration for exactly that reason. So the incumbent is pinned here, the lockfile
    // is untouched, and the control runs on `npm ci`.
    //
    // Also deliberate: `testGlob` names one of the three files. `ini.js` tests `lib/utils`,
    // an internal, and pulls the `ini` package; `nested-env-vars.js` is public and is the
    // obvious second file to grade once the first row exists.
    name: 'rc',
    repo: 'https://github.com/dominictarr/rc',
    testDir: 'test',
    testGlob: 'test.js',
    imports: [{ upstream: '../', subpath: '', reexportDefault: true }],
    // The incumbent, for the control, at the release the suite comes from. Nothing else: the
    // one graded file requires `assert`, `fs` and `path` and no package at all.
    suiteDeps: ['rc@1.2.8'],
    surfaceFiles: ['index.js', 'lib/utils.js'],
    runner: 'exit-code',
    target: 'seniority/rc',
    status: 'active',
    note: "Activated 2026-09-16. Control **1 / 1** by exit code, graded against `rc@1.2.8` installed under `vendor/rc/node_modules` by `suiteDeps`. Target `seniority/rc` is **0 / 1** and the row says `target not built yet`: R8's rc-compatible subpath is not in `seniority`'s exports map, and naming the package root instead would grade rc's `rc(name, defaults, argv)` against the export R8 reserves for cosmiconfig's — a different API, so a zero measured there would be measuring the wrong thing rather than a better number. The zero is the same shape `dotenv`'s row records and it moves the day the subpath lands. **This row is one bit, not one case**, so `baseline/rc.json` declares `mode: \"exit-code\"` and `report.ts` refuses it without that line; read `1 / 1` as \"the suite ran and exited 0\", never as 100% of anything. The suite's own `require('../')` is *not* rewritten — the rewrite matches `'..'` and the source writes `'../'` — and it reaches the shim anyway through the vendored root's `main`, which is the mechanism commander's and yargs' CJS fixtures already rely on.",
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
    note: "15 / 15 control, 15 / 15 target, measured 2026-09-15 — up from 13 / 15 via two separate findings. (1) `can slice a string with unknown ANSI color` **was** a real gap and is now closed: slice-ansi re-emits *any* SGR parameter it saw and closes with a reset, so `ESC[1001m` survives a cut, while `linegauge`'s style stack tracked only the codes in its own close-code table and dropped the rest, returning a bare `TES`. Ours was the wrong answer — the sequence is the caller's, not the library's to vet, and a stack that discards what it cannot name fails in the worst direction: the text survives and its style does not, silently. `style.ts` now carries an unrecognised parameter through as its own family and closes it with `ESC[0m`, which is the only closer correct for a parameter whose meaning is unknown. (2) `slice links` is `test.failing()` in slice-ansi's *own* suite: the incumbent cannot round-trip an `OSC 8` hyperlink and says so. `linegauge` can, so the assertion passes — and ava reports a passing `test.failing` as `not ok`, because from its side an unexpected pass is a stale annotation to clean up. That `not ok` is a statement about the incumbent's expectation, not about us, and counting it as our failure held this row at 14 / 15 on the strength of a case we do **better**. The grader now reads ava's own diagnostic and counts it as a pass, reported as `exceeded` on every line that has one so the judgement is never silent; it cannot misfire on a control run, where the incumbent really does fail the case and ava prints a plain `ok`. Its suite imports `random-item`, committed under `vendor/slice-ansi/node_modules/`.",
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
    // Installed into `vendor/cosmiconfig/node_modules` by the oracle itself on a clean
    // checkout, never into this workspace's manifest or lockfile. All three are what the
    // *suite* reaches for by name: `cosmiconfig` for the control, `env-paths` and
    // `parent-module` because two of its files import them directly. Pinned exactly, because
    // the hoisted copies are a different answer — measured 2026-09-15, the workspace resolves
    // `cosmiconfig` at 9.0.2 (through @commitlint/load) and `parent-module` at 1.0.1 against
    // the 3.x this suite was written for, so a control without these grades the 10.0.1 suite
    // against 9.0.2 and calls the difference incompatibility.
    suiteDeps: ['cosmiconfig@10.0.1', 'env-paths@2.2.1', 'parent-module@3.2.0'],
    surfaceFiles: ['src/index.ts', 'src/types.ts'],
    controlFailures: {
      count: 1,
      why: "`index.test.ts` imports `'../src/index.js'` — cosmiconfig's own entry module, by path — in addition to the public entry, and `vi.mock`s `../src/Explorer` and `../src/ExplorerSync` to assert the CONSTRUCTOR ARGUMENTS the entry passes them. The vendor step generates a shim for every internal specifier the suite names, but `../src/index.js` is the host's public entry reached by an internal path, so no shim is written and the file fails to load. That is one graded case, and it fails identically for the control and for the target: it is the harness's file-layout assumption, not a property of either implementation. This is the C4 shape `seniority/design.md` finding 4 left open, decided here — the fix is in `vendor.ts`'s internal-shim discovery, which is the harness lane's file, and until it lands the honest form is a named allowance of exactly one rather than an unexplained 240.",
    },
    conditionalCases: {
      count: 2,
      only: ['linux'],
      why: "`search-strategies.test.ts` wraps its `global › finds config in OS default directory (XDG)` describe in `if (process.platform === 'linux')`, so its two cases — `async` and `sync` — are **not registered at all** anywhere else. The suite is 241 cases on darwin and 243 on ubuntu, and that is the whole of the difference: no other conditional construct exists in the nine files (`process.platform`, `os.platform`, `describe.each`, `skipIf` and `runIf` return exactly this one hit). The reference is the ubuntu 243, because the reference has to be the full suite or the number means less on the machine that has more. The two are real and we fail both: seniority resolves its global config directory from `os.homedir()` and the platform rather than reading `XDG_CONFIG_HOME` through `env-paths`, which is `seniority/design.md` R11 and a listed divergence. Counting them against us on every platform is the point — excluding them instead would have raised the published rate from 76.5% to 77.2% by dropping two cases we lose.",
    },
    // Upstream's own `vite.config.ts` sets both, and its suite depends on them. Measured
    // 2026-09-14 and again 2026-09-15: without them 28 cases in
    // `successful-directories.test.ts` fail on a `readFileSync` spy that still holds the
    // previous case's calls (`expected [ …(28) ] to deeply equal [ …(19) ]`), and the
    // control reads 210 / 241 instead of 240 / 241. Those 28 were harness noise inside a
    // published compatibility rate — the exact class of error the oracle exists to keep
    // out of the number.
    vitestConfig: {
      restoreMocks: true,
      mockReset: true,
      // A published rate must not read the machine it ran on. Measured 2026-09-15: three
      // oracle runs of the *unchanged control* — real cosmiconfig against its own suite —
      // read 240, 238 and 231 while other work was running on the same laptop, and a direct
      // `vitest run` over the same nine files read 240 / 240 every time. The difference is
      // vitest's 5 s default per test against cases that walk and stat a temp tree: under
      // load some of them cross it. Thirty seconds is far past anything this suite needs
      // when the machine is idle, and it touches no assertion — the same shape as the
      // ambient-colour finding already recorded in `run.ts`, and the reason `timeoutMs`
      // exists for the mocha arm.
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
    runner: 'vitest',
    target: 'seniority',
    status: 'active',
    note: "Activated 2026-09-16, and **corrected the same day for a denominator that read the machine**. The reference is the ubuntu suite's 243, not darwin's 241 — see `conditionalCases` for the two-case difference and for why they are counted rather than subtracted. So: target `seniority` **186 / 243, 76.5%** on every platform, control **240 of the 241 darwin registers** and 242 of 243 on ubuntu, against an allowance of 1 and a declared two-case shortfall off linux. Both reproduced on a clean vendored directory (`rm -rf vendor/cosmiconfig/node_modules` before each). The row as first committed read 77.2% from darwin and measured 76.5% on ubuntu for the same commit, which `compat:page --check` caught on PR #338. The one reason this row stayed `planned` was the `installSuiteDeps` line below, and it is fixed: the check now compares the installed version *and its location* against the pin. The history: Measured 2026-09-15 (PLAN 3.2) and NOT activated — for one reason, and it is a line in `run.ts` rather than anything about either implementation. Target `seniority` grades **186 / 241, 77.2%**, reproducible on a clean checkout with nothing installed beside the suite (verified by removing `vendor/cosmiconfig/node_modules` and re-running). Control grades **240 / 241, 99.6%** — up from 210 / 241 once `vitestConfig` carried upstream's own `restoreMocks`/`mockReset`, measured before and after — but only when the `suiteDeps` pins are actually installed. They are not, on a clean checkout: `installSuiteDeps` skips a package that `resolvesFrom` the vendored directory **by name**, and this workspace hoists `cosmiconfig` at 9.0.2 (through @commitlint/load) and `parent-module` at 1.0.1. So the install never ran, the 10.0.1 suite was graded against 9.0.2, and the control read **234 / 241** — seven failures against an allowance of one. A control below its own reference must not publish a rate, so the row did not. `unsatisfiedPins` in `run.ts` is the fix and its doc comment carries the measurement; the second half of that comment is a second wrong answer the same door let through, found while activating `rc`."
  },
  {
    // seniority's third incumbent, and the one that grades the *claim* rather than the API:
    // `lilconfig` describes itself as "a zero-dependency alternative to cosmiconfig", which is
    // seniority's own sentence, so its suite is the nearest thing to an adversarial reading of
    // R8. Its last case — `npm package api › exports the same things as cosmiconfig` — is
    // literally that comparison, run against the real `cosmiconfig` beside it.
    //
    // ## Two public specifiers for one entry, and why both are listed
    //
    // The suite reaches the library twice and spells it differently: `require('..')` at the
    // top of the file, and `require('../index')` inside the last case. Both name the same
    // module and only the first is the package root, so both are declared and both are
    // rewritten to a generated shim. Leaving the second alone would point it at
    // `vendor/lilconfig/src/index`, a file the vendor step deliberately does not copy, and
    // the file would fail to load — a rewrite gap reading as a compatibility failure.
    //
    // ## Its tests live under `src/`, which is the thing to know before re-vendoring
    //
    // upstream files the suite at `src/spec/`, so `testDir` puts the vendored copy at
    // `vendor/lilconfig/src/spec/`. `packages/compat-oracle/.gitignore` used to ignore
    // `vendor/*/src/` outright — a blanket rule for the generated internal shims — and that
    // rule would have swallowed this entire suite: gitignored, never committed, and on CI
    // "not vendored" rather than a number. The rule now names the two hosts that actually
    // file internals there, and `vendored-suite.test.ts` goes red if a third ever needs one.
    name: 'lilconfig',
    repo: 'https://github.com/antonk52/lilconfig',
    testDir: 'src/spec',
    testGlob: '*.spec.js',
    imports: [
      { upstream: '..', subpath: '', reexportDefault: false },
      { upstream: '../index', subpath: '', reexportDefault: false },
    ],
    // All three are what the *suite* reaches for by name, pinned exactly to what upstream's
    // own manifest declares at this release: the incumbent for the control, `cosmiconfig`
    // because the parity case compares against the real one, and `typescript` because the
    // ts-loader cases transpile through `transpileModule`. `cosmiconfig` is pinned at the 8.x
    // upstream tested against and *not* at the 9.0.2 this workspace hoists — a parity case
    // compared against a different major is measuring the wrong disagreement.
    suiteDeps: ['lilconfig@3.1.3', 'cosmiconfig@8.3.6', 'typescript@5.3.3'],
    surfaceFiles: ['src/index.d.ts', 'src/index.js'],
    // **Seven cases that assert nothing, for anybody.** Each writes
    // `expect(promise).rejects.toThrowError(…)` with no `await`, so the assertion is a
    // promise nobody waits for and the case ends before it settles. jest 29 lets that pass
    // silently — which is how upstream ships them green — and vitest 5 turns it into an
    // error naming the missing `await`. Counting them against either side would score a
    // *vacuous* case, so they are subtracted from the number rather than allowed: an
    // allowance says "this failed and we know why", and the honest statement here is "this
    // measured nothing". `requireMatch` makes the control refuse an exclusion that stops
    // matching, so a reworded title cannot turn this into a silent seven-case discount, and
    // they remain in the raw TAP.
    excludes: [
      { match: '> options > packageProp > string[] with null in the middle > async', why: "Un-awaited `expect(…).rejects.toThrowError`: the assertion never settles before the case ends, so it passes vacuously under jest and errors under vitest 5. Its `> sync` sibling asserts the same thing synchronously and is gated." },
      { match: '> lilconfig > when to throw > non existing file', why: "Un-awaited `expect(…).rejects.toThrowError`, twice — once against lilconfig, once against cosmiconfig. The `lilconfigSync` case of the same name is synchronous, real, and gated." },
      { match: '> lilconfig > when to throw > throws for invalid json', why: 'Un-awaited `expect(…).rejects.toThrowError`. The `lilconfigSync` case of the same name is gated.' },
      { match: '> lilconfig > when to throw > throws for provided filepath that does not exist', why: 'Un-awaited `expect(…).rejects.toThrowError`. The `lilconfigSync` case of the same name is gated.' },
      { match: '> lilconfig > when to throw > no loader specified for the search place', why: 'Un-awaited `expect(…).rejects.toThrowError`. The `lilconfigSync` case of the same name is gated.' },
      { match: '> lilconfig > when to throw > loader is not a function', why: 'Un-awaited `expect(…).rejects.toThrowError`. The `lilconfigSync` case of the same name is gated.' },
      { match: '> lilconfig > when to throw > throws for empty strings passed to load', why: 'Un-awaited `expect(…).rejects.toThrowError`. The `lilconfigSync` case of the same name is gated.' },
    ],
    conditionalCases: {
      count: 2,
      notOn: ['win32'],
      why: "`default for searchFrom till root directory` and `searches root directory correctly`, each wrapped in `if (process.platform !== 'win32')` because both assert an `fs` call list rooted at `/`. They are the only conditional construct in the file — the `isNodeV20orNewer` branches pick an expected *message* and never add or drop a case, and this repository is Node 24 only. So the count does not move between darwin and ubuntu, which is why the reference is 77 on both and no number here changes. It is declared anyway: without it a Windows contributor's control registers 75 of 77 and goes red for doing exactly what the suite told it to, and finding that on their machine is worse than writing it here. Both cases are also two of the ten in `controlFailures`, so on Windows that allowance is spent down to eight.",
    },
    controlFailures: {
      count: 10,
      why: "Ten cases that read `fs.promises.access.mock.calls` and `fs.readFileSync.mock.calls` — eight under `options > cache` and the two `search … root directory` ones — and fail against **lilconfig's own package** here while passing upstream. The suite mocks `fs` with `jest.mock('fs', factory)` at module scope, which jest hoists above the `require('fs')` three lines earlier; `run.ts` maps `jest.mock` to `vi.doMock`, which is the runtime form and cannot hoist, so the test's own `fs` binding is the real module and its methods are not spies. Identical for the control and for the target, and a property of vitest 5 against jest 29 rather than of either implementation — the same divergence `clack`'s 30-case allowance records. Unlike those thirty, these ten *do* grade real behaviour (the load and search caches), so this is a blind spot and is written as one: 10 of 77, and the retirement condition this note used to carry is **false, measured 2026-09-20**. It said the ten retire the day the harness rewrites `jest.mock(` to `vi.mock(` in the transform so vitest's own hoister sees it. That was built — a `pre` plugin on the generated config, rewriting the text of the graded file before vitest parses it, verified to fire on `src/spec/index.spec.js` — and the file read **67 passed, 17 failed with the rewrite and 67 passed, 17 failed without it**. Identical. clack's control read 576 / 606 with it, the same number as without. The cause is a layer below the hoist: `index.spec.js` is CJS and takes its `fs` through `require('fs')`, which resolves through Node rather than through vitest's module runner, so no `vi.mock` of a builtin can reach the test's own binding however early it is hoisted — `fs.promises.access.mock` is `undefined` at the assertion, which is exactly what the failures say. Inlining the target (`server.deps.inline`) was tried too and moved nothing. So these ten cannot be graded under vitest without editing upstream's suite, which is the one thing this oracle may never do. They stay a declared blind spot with no retirement date, and the transform was reverted rather than kept: a harness change that fixes nothing is a harness change that will be mistaken for one.",
    },
    runner: 'vitest',
    target: 'seniority',
    status: 'active',
    note: "Vendored and activated 2026-09-16 at 3.1.3 (`v3.1.3` -> commit 77d7186c). Control **67 / 77** against a declared allowance of 10; target `seniority` **0 / 77**, and the reason is one line of TAP repeated 77 times — `TypeError: lilconfigSync is not a function`. seniority's root export is cosmiconfig's surface (R8) and carries no `lilconfig` / `lilconfigSync`, so this row measures the *absence* of the lilconfig façade rather than a partial one. That zero is measured, not assumed, and the row can only go up. It is named against the package root and not against a `seniority/lilconfig` that does not exist, for the reason cli-table3's note records. The denominator is 77 and not 84 because of the seven vacuous cases subtracted above; read it with that paragraph or not at all.",
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
    // `control` is load-bearing and was missing until the control first ran: without it the
    // control's shim re-exports `${target}${subpath}` — `dotenv/dotenv`, a subpath dotenv's
    // exports map does not have — and the whole suite fails to load. Every host whose
    // façade sits behind a subpath needs it, which is why `restore-cursor` and `exit-hook`
    // carry one.
    imports: [{ upstream: '../lib/main', subpath: '/dotenv', reexportDefault: false, control: 'dotenv' }],
    // Everything the suite reaches for by name, installed into `vendor/dotenv/node_modules`
    // and pinned to what upstream's own manifest declares at 17.4.2. This is the route the
    // earlier note called closed: it said `tap` "pulls 203 packages and 140 MB, which this
    // repository will not commit beside a suite or put in its lockfile" — both true, and
    // neither is what `suiteDeps` does. They are installed on the first grade of a clean
    // checkout, under a gitignored directory, and touch no manifest and no lockfile.
    // Measured 2026-09-16: 319 packages, 86 MB, once.
    suiteDeps: ['dotenv@17.4.2', 'tap@19.2.0', 'sinon@14.0.2', 'decache@4.6.2'],
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
    // The package **root**, with the façade reached through the import's own `/dotenv`
    // subpath — the `restore-cursor` / `exit-hook` shape. It read `seniority/dotenv` while
    // the row was `planned` and nothing ever composed the two: `missingTarget` concatenates
    // them, looked for `seniority/dotenv/dotenv`, and the first real target run reported
    // "target not built yet" for a subpath that exists. A planned row's shape is a guess
    // until a run touches it, which is the same lesson `wrap-ansi`'s note records.
    target: 'seniority',
    status: 'active',
    note: "Activated 2026-09-16. Control **141 / 141, 100%** — the first row graded through the `tap` arm, which is one `node <file>` spawn per file with the outputs concatenated, exactly as the `runner` field's comment specified. Target `seniority/dotenv` **74 passing, 50.3%**: R8's compatibility subpath exists, every one of the seven files loads and prints its plan, and the 73 failures are dotenv behaviour rather than harness — `DOTENV_KEY`/`.env.vault`, the debug logging and the CLI options, readable case by case in the raw TAP. **One thing to read carefully in this row and in any `tap` row after it:** node-tap's plan counts *assertions*, not cases, so the size of the suite depends on which branches ran — the control plans sum to 141 and the target's to 147. `rate()` divides by `max(reference, registered)`, so a target can never score above its own denominator, and the printed `74 / 141` is against the control's total while the percentage is against the larger one. That is the honest pair; it is not a per-case row and must not be read as one. Three things had to change together and none of them is about dotenv: the arm in `run.ts`; `control: 'dotenv'` on the import, without which the control's shim re-exported the non-existent `dotenv/dotenv`; and `target` reading the package root rather than the subpath it was already composing. The suite's own `tap`, `sinon` and `decache` are `suiteDeps` — 319 packages and 86 MB installed once into a gitignored `vendor/dotenv/node_modules`, in no manifest and no lockfile, which is the objection the earlier note raised and the reason it does not apply.",
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
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true, control: 'terminal-link' }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    // Upstream's own `ava` block, carried into the vendored manifest by `rootPackage()`.
    // Every case mutates `supportsHyperlinks.stdout` / `.stderr` on one shared module object
    // and restores it in `afterEach`; run concurrently the ten cases read each other's writes.
    avaConfig: { serial: true },
    // Both by name, and both at exact pins, installed into `vendor/terminal-link/node_modules`.
    // `supports-hyperlinks` is pinned at the version `terminal-link@5.0.0`'s own `^4.1.0`
    // resolves to, which matters for more than reproducibility: npm dedupes the two to one
    // top-level copy, and the suite's whole method is that the object it mutates is the same
    // object the implementation reads. A nested second copy would make every fallback case
    // read the ambient terminal instead.
    suiteDeps: ['terminal-link@5.0.0', 'supports-hyperlinks@4.5.0'],
    target: 'paratext/terminal-link',
    status: 'active',
    note: "**2026-09-20: 0 / 10 -> 8 / 10, and the remaining two are a ceiling rather than a gap.** `paratext/terminal-link` now exists as a subpath and the row points at it. It could not be the package root: the root default export is already `ansi-escapes`' object (R8) and `terminal-link`'s default export is a function, and one default cannot be both — the general case D-006 records. The two that stay red are `main` and `stderr`, confirmed by name from the raw TAP, and they are the two cases that set `supportsHyperlinks.stdout = true` (or `.stderr`) and then expect OSC 8. The suite's method is to mutate that module object and have the implementation read it at call time; paratext takes no runtime dependency, so it cannot see the mutation and answers from its own detection, which on a headless runner says no hyperlinks. The six cases that set the flag to **false** agree with us and pass, and the two `isSupported` cases only assert a boolean. Reading `supports-hyperlinks` when it happens to be installed would turn the two green and would be gaming this oracle: it would change what a real caller gets based on what else is in their `node_modules`. So the ceiling is **8 / 10**, and a reader who sees 80% must read it as \"every case that does not require us to see inside another package's module object\". Activated 2026-09-16, vendored at 5.0.0 (`v5.0.0` -> commit 975358c3; the tarball ships no test, like the other two here). Control **10 / 10, 100.0%**; target `paratext` **0 / 10**, and this zero is a finer one than `ansi-escapes`' or `term-img`'s — every one of the ten cases *registers* and fails, eight of them on `TypeError: terminalLink is not a function` and two on `terminalLink.stderr is not a function`. The file loads; there is simply no callable OSC-8 link on `paratext`'s default export yet. **What the earlier note said blocked this row was a root-manifest edit, and that was the wrong of two available routes.** Its objection was exact — the suite's ten cases `import supportsHyperlinks from 'supports-hyperlinks'` and reassign `supportsHyperlinks.stdout` per case, the package is in neither manifest, and `undeclared` really did come back as `['supports-hyperlinks (vendor/terminal-link/test.js)']` — but it is an objection to `vendorDeps`, which leans on the workspace hoist. `suiteDeps` installs both names into a gitignored `vendor/terminal-link/node_modules` at exact pins, touches no manifest and no lockfile, and `vendored-suite.test.ts` reads a name in the vendored manifest as a declaration however it got there. **Why `supports-hyperlinks` is pinned at 4.5.0 rather than left to the hoist**: the suite's entire method is that the object it mutates is the object the implementation reads, and 4.5.0 is what `terminal-link@5.0.0`'s own `^4.1.0` resolves to, so npm dedupes the two to one top-level copy (verified: `vendor/terminal-link/node_modules/supports-hyperlinks` exists and no nested copy does). A second, nested copy would leave every fallback case reading the ambient terminal instead of the value it just set — green or red by which terminal ran it. The other half of the note was right and is now fixed in `vendor.ts`: upstream declares `ava: { serial: true }`, `rootPackage()` wrote a manifest without it, and ten cases sharing one mutable module object would have raced. It is carried through the `avaConfig` field, and the raw TAP shows it working — one `afterEach` printed after each case rather than all ten batched at the end, which is what the concurrent `term-img` run looks like two rows up. Nothing in this suite varies by platform: no `process.platform`, no `describe.each`, no skip guard, and the two `isSupported` cases assert `typeof … === 'boolean'`, which is true of whatever the ambient terminal reports.",
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
    imports: [{ upstream: './index.js', subpath: '', reexportDefault: true, control: 'term-img' }],
    surfaceFiles: ['index.d.ts', 'index.js'],
    runner: 'ava',
    // The incumbent itself, installed into `vendor/term-img/node_modules` at the release the
    // suite is vendored from. This is the route the note below called a root-manifest edit:
    // it is not one. `suiteDeps` touches no manifest and no lockfile — see `dotenv`.
    suiteDeps: ['term-img@7.1.0'],
    target: 'paratext',
    status: 'active',
    note: "Activated 2026-09-16. Control **18 / 18, 100.0%**; target `paratext` **0 / 18**, a measured zero of the `ansi-escapes` shape — the raw TAP is one line, `SyntaxError: The requested module './shim.js' does not provide an export named 'UnsupportedTerminalError'`, so the file never loads and no case registers. That is R8 unbuilt, stated by the host's own suite, and it is not a verdict on eighteen behaviours. Its suite runs headless, which the earlier note had already established: every case sets `TERM_PROGRAM` / `TERM_PROGRAM_VERSION` / `KONSOLE_VERSION` and `process.platform` by hand and asserts the returned string or the thrown `UnsupportedTerminalError` — no tty, no protocol round-trip, nothing rendered. 13 `test()` calls, one of them a loop over a five-terminal table, so **18 cases**. `extraDirs` names `fixture.jpg` because eleven cases `readFileSync` it relative to cwd, and cwd is the vendored root. **Two things the earlier note got wrong, and both took a measurement to find out.** First, it said the row needed a root-manifest edit because `term-img` is in neither manifest: `suiteDeps` is the route it did not consider, and it installs the incumbent into a gitignored `vendor/term-img/node_modules` at an exact pin, touching no manifest and no lockfile — the arrangement `dotenv` and `rc` already use, and `vendored-suite.test.ts` reads a `suiteDeps` name as a declaration. Second, it reserved a `controlFailures` allowance for `iTerm2 support` on the grounds that the case reaches a real machine. It does not. `iterm2-version@5.0.0` returns `process.env.TERM_PROGRAM_VERSION` whenever `TERM_PROGRAM === 'iTerm.app'`, **before** it goes near `app-path` and the installed bundle's `Info.plist`, and the case sets both by hand (`3.3.7`) — so the plist read is dead code under this suite. The platform gate above it is `process.platform !== 'darwin'`, and the case redefines `process.platform` to `darwin` itself, so a Linux runner takes the same fast path. **No allowance is declared, because nothing fails** — an allowance that excuses a case nobody fails is a dial, and this row would have shipped with one turned to 1. The 18 are the same 18 on every machine: the suite's only `process.platform` read is the `beforeEach` capturing the original value, no `test()` call is guarded by a platform, and `conditionalCases` has nothing to declare. One fragility to carry, and it is upstream's rather than ours: `afterEach` restores `process.platform` with `configurable: false`, so the suite works only while ava runs every `beforeEach` and every case before any `afterEach` — which is what the pinned ava does, visible in the raw TAP. An ava that interleaved hooks would break this suite against term-img itself, and the control is the run that would say so.",
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
    // **Vendored and runnable as of 2026-09-16, and still not graded.** The suite executes
    // end to end — 127 cases registered, 123 passing against signal-exit's own package — and
    // the row stays `planned` because a control that cannot clear its own reference must not
    // publish a rate. The `note` below carries the measurement, the three blockers that are
    // gone and the two that replaced them.
    //
    // It is vendored now, where the earlier judgement was that "a directory of tests that
    // cannot be run is worse than no directory". That judgement was right and no longer
    // applies: these tests run. `vendored-suite.test.ts` is satisfied without being told to
    // ignore anything — its undeclared-package check is scoped to *active* hosts, and `tap`
    // is declared in the vendored manifest through `suiteDeps` regardless.
    //
    // `closeout/intent.md` R4 makes this row's pass rate the gate on the whole `overrides`
    // recipe, which is why the harness for it is committed rather than abandoned: the next
    // agent starts from 123 / 127 and one open question, not from four.
    name: 'signal-exit',
    repo: 'https://github.com/tapjs/signal-exit',
    testDir: 'test',
    testGlob: '*.{js,ts}',
    // **Two public entries, and the second one is the whole reason this row works.**
    // `signals.js` is not an internal: signal-exit's own exports map declares `"./signals"`
    // beside `"."`, exactly as yargs declares `yargs/helpers`. Reading it as an internal was
    // the first attempt and it produced no shim at all, because the only `require()` of it is
    // inside `fixtures/`, which `ungradedDirs` prunes from the walk that collects internals —
    // so the two fixtures and `signals.js`'s `t.mock()` would all have resolved a path that
    // does not exist in a vendored copy. Declared here it is rewritten like any public
    // specifier, in the test files and in the copied fixture tree alike.
    imports: [
      { upstream: '../dist/cjs/index.js', subpath: '/signal-exit', reexportDefault: false, control: 'signal-exit' },
      { upstream: '../dist/cjs/signals.js', subpath: '/signal-exit/signals', reexportDefault: false, control: 'signal-exit/signals' },
    ],
    surfaceFiles: ['src/index.ts', 'src/signals.ts'],
    // signal-exit ships only its compiled output — its published `files` array is `["dist"]`
    // — so `dist` is where it files the modules a test may reach and a `dist` pattern is in
    // `INTERNAL_PATTERNS` for it. Nothing is on the internal list today, because both `dist`
    // paths the suite names are public; the declaration is what makes `classify()` read this
    // suite correctly, and what would catch a future release adding a third.
    internalDir: 'dist',
    runner: 'tap',
    // Upstream's `--loader ts-node/esm` does not run on Node 24 — see the field's own doc.
    tsLoader: 'tsx',
    // The incumbent for the control, and the suite's own runner, both at the release the
    // tests were vendored from. `tap@16.3.4` is what upstream's manifest declares at v4.1.0.
    suiteDeps: ['signal-exit@4.1.0', 'tap@16.3.4'],
    // `t.matchSnapshot()` reads these, and the path is relative to the vendored root because
    // that is the cwd a `tap` spawn runs in. The earlier note called this a blocker on the
    // grounds that the format "has no reader outside tap" — true, and the `tap` arm *is* tap:
    // measured, `node test/signals.js` from the vendored root prints `ok … must match
    // snapshot` against these files with no runner binary involved.
    extraDirs: ['tap-snapshots'],
    ungradedDirs: [
      {
        dir: 'fixtures',
        why: "Programs the tests spawn as child processes to watch them exit — `exit.js`, `sigint.js`, `sigkill.js` and eighteen more. They match `*.{js,ts}` because that is simply how they are written, and running one as a test grades nothing: it installs a handler and kills itself. Two of them (`signal-capture.js`, `sigkill.js`) reach the implementation through `../../dist/`, which is why `dist/cjs/signals.js` is on the internal-shim list at all.",
      },
    ],
    target: 'closeout',
    status: 'planned',
    note: "198.9 M/wk and stale since 2023-07-29 — the layer's headline incumbent, and **still `planned`, but for two measured reasons rather than four guessed ones.** The suite is now vendored and it runs: measured 2026-09-16, the control registers **127 cases and passes 123** against `signal-exit@4.1.0` installed beside it. It is not activated, because **a control that cannot clear its own reference must not publish a rate**, and the four it fails are not a `controlFailures` allowance — an allowance is a named exemption for something the incumbent genuinely cannot do, and at least two of these are the harness grading the wrong thing. Of the original four blockers, three are gone. (1) The `tap` runner arm exists and `dotenv` goes through it. (2) `tap-snapshots/` needs no reader outside tap because the arm *is* tap — `node test/signals.js` from the vendored root prints `ok … must match snapshot` with no runner binary, so `extraDirs` naming the directory is the whole fix. (3) `dist` is in `INTERNAL_PATTERNS` now, though it turned out not to be the mechanism this host needed: `dist/cjs/signals.js` is a **public** export (`\"./signals\"` sits beside `\".\"` in signal-exit's own exports map, exactly as `yargs/helpers` does), and reading it as an internal produced no shim at all, because its only `require()` is inside `fixtures/`, which `ungradedDirs` prunes from the walk that collects internals. Declared as a second public import it is rewritten everywhere, `t.mock('../dist/cjs/signals.js')` included — `rewriteAt` replaces the quoted literal, so the mock argument moves with it. (4) The `ts-node/esm` loader blocker is **worse than recorded and is handled**: upstream's `--loader ts-node/esm` does not run on Node 24 at all (every `.ts` file dies with `ERR_REQUIRE_CYCLE_MODULE`, because `require(esm)` landed after signal-exit's last release), and plain Node 24 type-stripping runs only one of the four (`signal-capture.ts` imports a type as a value, and two more import `'./fixtures/exec-err'` without an extension). `tsLoader: 'tsx'` runs all four. **The two that remain, both found by running it:** first, `test/no-process.js` > `process missing from the start` fails because the generated public shim is ESM by construction, so Node takes the `import` condition and hands the suite `dist/mjs/index.js` — while every one of these tests is written against `../dist/cjs/index.js`, and the two builds differ exactly here (the CJS build captures the global process object in a module-scope constant at load time and the ESM build does not, which is the behaviour `fixtures/process-gone.js` exists to check). The stack in the raw TAP names `dist/mjs/index.js` in so many words. `signal-exit-test.ts` > `does not exit if user handles signal` fails beside it and is very likely the same cause. That is not a defect in signal-exit or in closeout; it is this oracle grading a build the suite did not ask for, and fixing it means a CJS public shim, which is a change to the `shimName` rule four other hosts rely on. Second, `test/signals.js` loses 2 of its 3 cases to the shim indirection: it snapshots `t.mock('…/signals.js')` once per faked platform, and `t.mock` busts the cache of the *shim* rather than of the module behind it, so `darwin` and `linux` both get win32's list back. No allowance can make those two comparisons mean anything again. **So: the harness for this host is built and committed, the row is one honest measurement away, and the remaining work is the CJS-shim question — which is a decision about `shimName`, not about signal-exit.** No baseline fragment exists, deliberately: `reference`/`passed` record a *target* run, and no target run was taken against a control this one.",
  },
];

export const active = (): Host[] => HOSTS.filter((h) => h.status === 'active');
