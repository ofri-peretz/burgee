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
import { dirname, join } from 'node:path';
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

type Summary = Pick<Grade, 'files' | 'tests' | 'passed' | 'failed' | 'skipped' | 'reference' | 'rate' | 'error'>;

/**
 * Turn a runner's stdout into a grade. Pure, so the one case that has silently read as
 * "0 passing" three separate times — output present but no `# tests` summary, because a
 * test called process.exit() and killed the runner — is an *error*, and is tested as one.
 */
export function summarize(output: string, files: number, reference: number): Summary {
  const counts = parseNodeTest(output);
  if (!TAP_TESTS.test(output)) {
    return { files, ...counts, reference, rate: 0, error: 'suite exited before its summary (process.exit() inside a test?)' };
  }
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
function writeShims(host: Host, hostDir: string, target: string): void {
  host.imports.forEach((entry, i) => writeFileSync(join(hostDir, shimName(i)), shimSource(entry, host, target)));
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
function writeInternalShims(host: Host, hostDir: string, target: string, internals: string[]): void {
  const installed = target === host.name ? packageRoot(host.name) : undefined;
  for (const rel of internals) {
    const at = join(hostDir, rel);
    mkdirSync(dirname(at), { recursive: true });
    const from = installed === undefined ? target : join(installed, rel);
    writeFileSync(at, `// generated per run — COMPAT_TARGET=${target}\nexport * from '${from}';\n`);
  }
}

/** The runner invocation. mocha and ava resolve through the module system: workspaces hoist .bin. */
function command(host: Host, dir: string, paths: string[]): { bin: string; args: string[] } {
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

/** Runs the suite from its vendored root; a failing suite still prints its summary. */
function runSuite(host: Host, hostDir: string, files: string[], target: string): { output: string } | { error: string } {
  const dir = join(hostDir, host.testDir);
  const { bin, args } = command(host, dir, files.map((f) => join(dir, f)));
  try {
    // cwd is the vendored root: suites use cwd-relative paths into their own tree.
    const output = execFileSync(bin, args, {
      encoding: 'utf8',
      cwd: hostDir,
      env: { ...process.env, COMPAT_TARGET: target },
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
  const all = readdirSync(dir).filter((f) => /\.(m?js|cjs)$/.test(f) && f !== host.preamble);
  const files = all.filter((f) => !internalFiles.has(f));
  const internal = all.filter((f) => internalFiles.has(f));
  if (files.length === 0) return { ...base, error: 'no test files vendored' };

  const missing = missingTarget(host, target);
  if (missing !== undefined) return { ...base, note: `target not built yet: ${missing}` };

  writeShims(host, hostDir, target);
  writeInternalShims(host, hostDir, target, source.internals ?? []);

  const run = runSuite(host, hostDir, files, target);
  keepTap(host, target, 'public', run);
  if ('error' in run) return { ...base, files: files.length, error: run.error };
  const graded: Grade = { ...base, ...summarize(run.output, files.length, reference) };

  if (internal.length > 0) {
    const extra = runSuite(host, hostDir, internal, target);
    keepTap(host, target, 'internal', extra);
    const counts = 'error' in extra ? { tests: 0, passed: 0 } : parseNodeTest(extra.output);
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
