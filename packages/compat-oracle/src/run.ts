/**
 * Runs a host's own vendored suite against whatever `COMPAT_TARGET` names, and
 * reports the rate.
 *
 * The suite is the host's, unedited apart from the import specifiers the vendor step
 * rewrites. That is the whole point: a compatibility claim graded by tests we wrote
 * would be graded by our reading of the host's behaviour, which is the thing under test.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, matchesGlob, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Host, type HostImport } from './hosts.js';
import { shimName } from './vendor.js';

export interface Grade {
  host: string;
  target: string;
  files: number;
  /** Tests that registered in this run. Lower than `reference` while files fail to import. */
  tests: number;
  passed: number;
  failed: number;
  /** Tests that skipped themselves in this environment (an OS-only case); reported, never counted. */
  skipped: number;
  /**
   * The suite's size when graded against the real host — the honest denominator. A file
   * that throws on import registers as one test instead of its twenty, so measuring
   * against `tests` would flatter a partial implementation badly.
   */
  reference: number;
  rate: number;
  /** The suite could not be run at all — a broken oracle, and it fails CI. */
  error?: string;
  /** The suite reached a known outcome that needs a word, e.g. the target is not built yet. */
  note?: string;
  /**
   * Files that test only the host's internal file layout: run and counted, never part of
   * the gate. Passing them would mean copying the host, not being compatible with it.
   */
  internals?: { files: number; tests: number; passed: number };
}

const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
/** A fully-failing 1,300-test suite emits a few MB of TAP diagnostic; 64 MiB is ample. */
const MAX_OUTPUT_MIB = 64;
const MAX_OUTPUT_BYTES = MAX_OUTPUT_MIB * KIB_PER_MIB * BYTES_PER_KIB;
/** How much of a spawn failure's message to keep in the grade. */
const ERROR_EXCERPT = 200;
/** mocha's own default, used when a host declares none. */
const DEFAULT_TIMEOUT_MS = 2000;
const SUITE_TIMEOUT_MS = 300_000;

// Static, because the three labels are ours and a runtime RegExp invites the question
// of where its pattern came from.
const TAP_TESTS = /^# tests (\d+)$/m;
/** vitest's `tap-flat`: a plan and one line per test, and no summary lines at all. */
const TAP_PLAN = /^1\.\.(\d+)$/m;
/** Anchored at column zero: a nested TAP body indents its own `ok` lines. */
const FLAT_OK = /^ok \d+/;
const FLAT_NOT_OK = /^not ok \d+/;
const FLAT_SKIP = /#\s*SKIP/i;
const TAP_PASS = /^# pass (\d+)$/m;
const TAP_FAIL = /^# fail (\d+)$/m;
/**
 * node:test's summary line is `# skipped n`, ava's `# skip n` (and only when n > 0); mocha
 * has none and marks each pending test with a directive instead.
 */
const TAP_SKIPPED = /^# skip(?:ped)? (\d+)$/m;
const TAP_OK = /^\s*ok \d+/;

function count(pattern: RegExp, output: string): number {
  const found = pattern.exec(output);
  return found === null ? 0 : Number(found[1] ?? 0);
}

/**
 * Parsed from `--test-reporter=tap` (node), `--reporter tap` (mocha) or `--tap` (ava); all
 * three print the same three summary lines. Chosen over the default reporters because TAP
 * is the stable machine-readable one.
 */
export function parseNodeTest(output: string): { tests: number; passed: number; failed: number; skipped: number } {
  const skipped = TAP_SKIPPED.test(output) ? count(TAP_SKIPPED, output) : output.split('\n').filter((l) => TAP_OK.test(l) && l.includes('# SKIP')).length;
  // `tests` is what ran: a test that skipped itself (commander's Windows-only cases off
  // Windows) passed for no one and fails no one, so it is reported and never counted.
  return { tests: count(TAP_TESTS, output) - skipped, passed: count(TAP_PASS, output), failed: count(TAP_FAIL, output), skipped };
}

/**
 * The other TAP dialect. node:test and mocha both print `# tests / # pass / # fail`;
 * vitest's `tap-flat` prints a plan line and one `ok`/`not ok` per test and stops, so the
 * counts have to be read off the lines themselves. (`--reporter=tap` is nested, which is
 * worse: the counts are then per file rather than per test.)
 */
export function parseFlatTap(output: string): { tests: number; passed: number; failed: number; skipped: number } {
  const lines = output.split('\n');
  const ok = lines.filter((l) => FLAT_OK.test(l));
  const skipped = ok.filter((l) => FLAT_SKIP.test(l)).length;
  const passed = ok.length - skipped;
  const failed = lines.filter((l) => FLAT_NOT_OK.test(l)).length;
  // A test that skipped itself passed for no one and fails no one: reported, never counted.
  return { tests: passed + failed, passed, failed, skipped };
}

type Summary = Pick<Grade, 'files' | 'tests' | 'passed' | 'failed' | 'skipped' | 'reference' | 'rate' | 'error'>;

/**
 * Turn a runner's stdout into a grade. Pure, so the one case that has silently read as
 * "0 passing" three separate times — output present but no `# tests` summary, because a
 * test called process.exit() and killed the runner — is an *error*, and is tested as one.
 */
export function summarize(output: string, files: number, reference: number): Summary {
  // Summary lines win where they exist: node:test prints a plan *and* a summary, and the
  // summary is the runner's own count rather than one inferred from its lines.
  if (TAP_TESTS.test(output)) return rate(files, parseNodeTest(output), reference);
  // A plan and no summary is vitest's dialect. Without either, the runner was killed
  // mid-run — and its `ok` lines must not be counted, or a suite that died at test 72
  // reports 72 passing and clears the gate. That has read as a grade once already.
  if (TAP_PLAN.test(output)) return rate(files, parseFlatTap(output), reference);
  return { files, tests: 0, passed: 0, failed: 0, skipped: 0, reference, rate: 0, error: 'suite exited before its summary (process.exit() inside a test?)' };
}

function rate(files: number, counts: { tests: number; passed: number; failed: number; skipped: number }, reference: number): Summary {
  // The reference is the control's total; a run that registers *more* (a file that used to
  // fail to import now loads) proves the reference stale, and the larger count is the
  // honest denominator until the baseline is re-measured. A rate above 1 is never a score.
  const denominator = Math.max(reference, counts.tests);
  return { files, ...counts, reference, rate: denominator === 0 ? 0 : counts.passed / denominator };
}

const require = createRequire(import.meta.url);

/**
 * A target that does not exist yet grades as 0 of the reference, not as a broken oracle:
 * burgee/yargs is an honest 0 until wave 4 builds it and must not fail CI. Resolved as
 * ESM on purpose — burgee's exports map declares an `import` condition, so CJS
 * `require.resolve` reports a package that exists as missing.
 */
function missingTarget(host: Host, target: string): string | undefined {
  if (target === host.name) return undefined;
  // The filter is an inferred type predicate (TS 5.5+), so only public entries reach map.
  return host.imports
    .map((e) => `${target}${e.subpath}`)
    .find((spec) => {
      try {
        import.meta.resolve(spec);
        return false;
      } catch {
        return true;
      }
    });
}

/** The source of one generated public shim. */
function shimSource(entry: HostImport, host: Host, target: string): string {
  const header = `// generated per run — COMPAT_TARGET=${target}`;
  const from = target === host.name ? (entry.control ?? `${target}${entry.subpath}`) : `${target}${entry.subpath}`;
  // `export *` never carries a default; yargs' entry has one and its tests use it. The
  // `module.exports` name is what `require()` of an ES module returns whole, so a CJS
  // fixture's `require('../../')` gets the callable factory, exactly as it does from yargs.
  const withDefault = entry.reexportDefault ? `export { default } from '${from}';\nexport { default as 'module.exports' } from '${from}';\n` : '';
  return `${header}\nexport * from '${from}';\n${withDefault}`;
}

/**
 * One generated shim per import the suite uses, written statically beside the tests: the
 * suites do `import * as host from '../shim.js'` and read named exports, which a dynamic
 * `await import(target)` cannot provide. Writing them per run is what lets one vendored
 * suite grade any implementation.
 */
function writeShims(host: Host, hostDir: string, target: string, packageType: string): void {
  // The vendored package's own type decides the extension, and the vendor step wrote the
  // rewritten specifiers against the same rule — so the two always name one file.
  host.imports.forEach((entry, i) => writeFileSync(join(hostDir, shimName(i, packageType)), shimSource(entry, host, target)));
}

/** The installed package's directory: its main entry, then up to the nearest package.json. */
function packageRoot(name: string): string {
  let dir = dirname(fileURLToPath(import.meta.resolve(name)));
  while (!existsSync(join(dir, 'package.json'))) dir = dirname(dir);
  return dir;
}

interface Source {
  internalFiles?: string[];
  internals?: string[];
}

/**
 * The suite's imports of the host's internal modules are left byte-identical; instead a
 * shim is written at that very path under the vendored root. The control gets the installed
 * host's own file by absolute path (its exports map blocks a deep import by name). A target
 * gets the target's main entry — the test wants the class, not the host's file layout — so
 * `import { Option } from '../lib/option.js'` resolves to our Option, and a test that then
 * fails is a real divergence rather than a whole file thrown away.
 */
function writeInternalShims(host: Host, { hostDir, target, internals, packageType }: { hostDir: string; target: string; internals: string[]; packageType: string }): void {
  const installed = target === host.name ? packageRoot(host.name) : undefined;
  for (const rel of internals) {
    const at = join(hostDir, rel);
    mkdirSync(dirname(at), { recursive: true });
    const from = installed === undefined ? target : join(installed, rel);
    writeFileSync(at, `// generated per run — COMPAT_TARGET=${target}\n${internalShimBody(from, packageType)}`);
  }
}

/**
 * The shim's *language* has to match how the test loads it, not just its extension.
 *
 * An internal shim is written at the exact path the test reaches for — `../src/cell`, with
 * no extension — so Node's CommonJS resolver finds it and, having no extension to go on,
 * loads it as CommonJS. An `export * from` there is a syntax error, which is what
 * cli-table3's four internal files hit. A CJS host gets a CJS shim; `.default ?? loaded`
 * unwraps an ES module target while leaving a CommonJS one alone.
 */
function internalShimBody(from: string, packageType: string): string {
  if (packageType === 'module') return `export * from '${from}';\n`;
  return `const loaded = require('${from}');\nmodule.exports = loaded?.default ?? loaded;\n`;
}

/**
 * vitest's bin, found through its `package.json` — the only path its exports map admits.
 * `require.resolve('vitest/vitest.mjs')` is the obvious spelling and throws.
 */
function vitestBin(): string {
  return join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
}

/** The runner invocation. mocha and ava resolve through the module system: workspaces hoist .bin. */
function command(host: Host, dir: string, paths: string[]): { bin: string; args: string[] } {
  if (host.runner === 'vitest') {
    // `--root` so vitest reads the config written beside the suite rather than this repo's
    // own, and `tap-flat` because the default `tap` reporter nests — which counts files,
    // not tests. The files come through that config, not as arguments: vitest's positional
    // arguments are substring *filters* over its `include`, so a file the include misses
    // cannot be named back in. cli-table3's are `*-test.js`, which the default include
    // does miss.
    return { bin: process.execPath, args: [vitestBin(), 'run', '--root', dirname(dir), '--reporter=tap-flat'] };
  }
  if (host.runner === 'node:test') return { bin: process.execPath, args: ['--test', '--test-reporter=tap', ...paths] };
  // ava takes the paths as a filter over its own `files` globs, under which a `_`-prefixed
  // file is a helper, never a test: chalk's two spawned fixtures are vendored beside the
  // tests (their import is rewritten like any other) and ava leaves them to the tests
  // that spawn them. `--tap` is its TAP reporter; the summary lines are node's.
  if (host.runner === 'ava') return { bin: process.execPath, args: [join(packageRoot('ava'), 'entrypoints', 'cli.js'), '--tap', ...paths] };
  const preamble = host.preamble === undefined ? [] : ['--require', join(dir, host.preamble)];
  const timeout = String(host.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return {
    bin: process.execPath,
    args: [require.resolve('mocha/bin/mocha.js'), '--reporter', 'tap', '--timeout', timeout, ...preamble, ...paths],
  };
}

/**
 * vitest reads its file list from a config, so the run writes one — the exact files,
 * relative to the root, and `globals: true` because a jest suite calls `describe`, `it`
 * and `expect` without importing them. Generated per run beside the shims, and gitignored
 * for the same reason they are.
 */
/**
 * A jest suite run under vitest still expects jest's globals. vitest's `globals: true`
 * supplies `describe`, `it` and `expect`; it does not supply `jest` itself, and cli-table3's
 * suite reaches for `jest.fn`, `jest.mock` and `jest.requireActual`.
 *
 * This is harness, not leniency: the three are mapped to vitest's own equivalents and no
 * assertion is touched. Without them a file fails to load, which reads as a compatibility
 * failure when it is a runner mismatch — the whole class of error the oracle exists to keep
 * out of the number.
 */
const jestGlobals = (): string => `// generated per run
import { createRequire } from 'node:module';
import { vi } from 'vitest';

// Anchored here, at the vendored root, which is where a bare id resolves from. A *relative*
// id in \`requireActual\` is written from the test file and cannot be anchored from a
// wrapper that does not know its caller — a file using one fails to load, loudly, and is
// reported on the informational line rather than silently mis-resolved. Anchoring at the
// test directory instead was tried and is worse: cell-test.js then loads and reports 94
// failures that are the wrapper's, not cli-table3's, which is the exact class of error this
// oracle exists to keep out of the number.
const require = createRequire(import.meta.url);

globalThis.jest = {
  fn: (...args) => vi.fn(...args),
  // \`vi.mock\` is hoisted by vitest's transform and refuses to be called from inside a
  // wrapper; \`vi.doMock\` is its runtime form, which is what a \`jest.mock\` call reached at
  // run time actually means. These suites call it before the require it affects.
  mock: (...args) => vi.doMock(...args),
  requireActual: (id) => require(id),
};
`;

function writeVitestConfig(host: Host, hostDir: string, files: string[]): void {
  const include = files.map((f) => JSON.stringify(join(host.testDir, f).split(sep).join('/')));
  writeFileSync(join(hostDir, 'vitest.setup.mjs'), jestGlobals());
  writeFileSync(join(hostDir, 'vitest.config.mjs'), `// generated per run\nexport default { test: { include: [${include.join(', ')}], globals: true, setupFiles: ['./vitest.setup.mjs'] } };\n`);
}

/** Runs the suite from its vendored root; a failing suite still prints its summary. */
function runSuite(host: Host, hostDir: string, files: string[], target: string): { output: string } | { error: string } {
  const dir = join(hostDir, host.testDir);
  if (host.runner === 'vitest') writeVitestConfig(host, hostDir, files);
  const { bin, args } = command(host, dir, files.map((f) => join(dir, f)));
  try {
    // cwd is the vendored root: suites use cwd-relative paths into their own tree.
    const output = execFileSync(bin, args, {
      encoding: 'utf8',
      cwd: hostDir,
      env: { ...process.env, ...host.env, COMPAT_TARGET: target },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: SUITE_TIMEOUT_MS,
      // A mostly-failing suite emits more TAP diagnostic than the 1 MB default holds, and
      // the overflow drops the summary lines the count lives in. Seen at 1.16 MB.
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    return { output };
  } catch (cause) {
    const failure = cause as { stdout?: string; stderr?: string; message: string };
    if (failure.stdout !== undefined && failure.stdout !== '') return { output: failure.stdout };
    // The suite never started. The reason is on stderr; the message is only the command.
    const reason =
      (failure.stderr ?? '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l !== '' && !l.startsWith('at ')) ?? failure.message;
    return { error: reason.slice(0, ERROR_EXCERPT) };
  }
}

/**
 * `COMPAT_TAP_DIR=<dir>` keeps each run's raw TAP as `<dir>/<host>.<target>.<kind>.tap`, so a
 * count that moved can be read back to the test names that moved it. Off by default: the
 * grade is the counts, and a 1,300-test TAP is megabytes.
 */
function keepTap(host: Host, target: string, kind: 'public' | 'internal', run: { output: string } | { error: string }): void {
  const dir = process.env['COMPAT_TAP_DIR'];
  if (dir === undefined || dir === '' || !('output' in run)) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${host.name}.${target.replaceAll('/', '_')}.${kind}.tap`), run.output);
}

export function grade(host: Host, vendorDir: string, target: string, reference = 0): Grade {
  const hostDir = join(vendorDir, host.name);
  const dir = join(hostDir, host.testDir);
  const base: Grade = { host: host.name, target, files: 0, tests: 0, passed: 0, failed: 0, skipped: 0, reference, rate: 0 };

  if (!existsSync(dir)) return { ...base, error: 'not vendored: run `npm run compat -- --vendor`' };
  const sourcePath = join(hostDir, '.source.json');
  const source: Source = existsSync(sourcePath) ? (JSON.parse(readFileSync(sourcePath, 'utf8')) as Source) : {};
  const internalFiles = new Set(source.internalFiles ?? []);
  // The host's own glob decides what is a test — ora's suite sits at the repo root next to
  // `index.js`, and running the implementation as a test file is not a grade. Nothing else
  // is filtered here: ava is handed the paths and applies its own conventions to them.
  const all = readdirSync(dir).filter((f) => matchesGlob(f, host.testGlob) && f !== host.preamble);
  const files = all.filter((f) => !internalFiles.has(f));
  const internal = all.filter((f) => internalFiles.has(f));
  if (files.length === 0) return { ...base, error: 'no test files vendored' };

  const missing = missingTarget(host, target);
  if (missing !== undefined) return { ...base, note: `target not built yet: ${missing}` };

  const { type: packageType = 'commonjs' } = JSON.parse(readFileSync(join(hostDir, 'package.json'), 'utf8')) as { type?: string };
  writeShims(host, hostDir, target, packageType);
  writeInternalShims(host, { hostDir, target, internals: source.internals ?? [], packageType });

  const run = runSuite(host, hostDir, files, target);
  keepTap(host, target, 'public', run);
  if ('error' in run) return { ...base, files: files.length, error: run.error };
  const graded: Grade = { ...base, ...summarize(run.output, files.length, reference) };

  if (internal.length > 0) {
    const extra = runSuite(host, hostDir, internal, target);
    keepTap(host, target, 'internal', extra);
    // The same dialect dispatch the gated run uses. `parseNodeTest` alone read vitest's
    // flat TAP as `tests: -1`, because a plan with no `# tests` summary gives it nothing to
    // count — the informational line then reported a negative total.
    const counts = 'error' in extra ? { tests: 0, passed: 0 } : summarize(extra.output, internal.length, 0);
    graded.internals = { files: internal.length, tests: counts.tests, passed: counts.passed };
  }
  return graded;
}

export interface Baseline {
  [host: string]: { reference: number; passed: number; rate: number };
}

export function readBaseline(path: string): Baseline {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Baseline) : {};
}

/** C5 — the rate ratchets. Falling below the recorded baseline fails. */
export function regressed(grade: Grade, baseline: Baseline): boolean {
  const was = baseline[grade.host];
  return was !== undefined && grade.passed < was.passed;
}
