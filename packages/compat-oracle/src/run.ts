/**
 * Runs a host's own vendored suite against whatever `COMPAT_TARGET` names, and
 * reports the rate.
 *
 * The suite is the host's, unedited apart from the one import specifier the
 * vendor step rewrites. That is the whole point: a compatibility claim graded by
 * tests we wrote would be graded by our reading of the host's behaviour, which is
 * the thing under test.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Host } from './hosts.js';

export interface Grade {
  host: string;
  target: string;
  files: number;
  /** Tests that registered in this run. Lower than `reference` while files fail to import. */
  tests: number;
  passed: number;
  failed: number;
  /**
   * The suite's size when graded against the real host — the honest denominator.
   * A file that throws on import registers as one test instead of its twenty, so
   * measuring against `tests` would flatter a partial implementation badly.
   */
  reference: number;
  rate: number;
  error?: string;
}

/**
 * Parsed from `--test-reporter=tap`, chosen over the default reporter because it is
 * the stable machine-readable one: the default prefixes counts with an info glyph
 * that is presentation, not contract.
 */
const BYTES_PER_KIB = 1024;
const KIB_PER_MIB = 1024;
/** A fully-failing 1,300-test suite emits a few MB of TAP diagnostic; 64 MiB is ample. */
const MAX_OUTPUT_MIB = 64;
const MAX_OUTPUT_BYTES = MAX_OUTPUT_MIB * KIB_PER_MIB * BYTES_PER_KIB;
/** How much of a spawn failure's message to keep in the grade. */
const ERROR_EXCERPT = 200;

// Static, because the three labels are ours and a runtime RegExp invites the question
// of where its pattern came from.
const TAP_TESTS = /^# tests (\d+)$/m;
const TAP_PASS = /^# pass (\d+)$/m;
const TAP_FAIL = /^# fail (\d+)$/m;

function count(pattern: RegExp, output: string): number {
  const found = pattern.exec(output);
  return found === null ? 0 : Number(found[1] ?? 0);
}

export function parseNodeTest(output: string): { tests: number; passed: number; failed: number } {
  return { tests: count(TAP_TESTS, output), passed: count(TAP_PASS, output), failed: count(TAP_FAIL, output) };
}

export function grade(host: Host, vendorDir: string, target: string, reference = 0): Grade {
  const dir = join(vendorDir, host.name, 'tests');
  const base: Omit<Grade, 'tests' | 'passed' | 'failed' | 'rate'> = {
    host: host.name,
    target,
    files: 0,
    reference,
  };

  if (!existsSync(dir)) {
    return { ...base, tests: 0, passed: 0, failed: 0, rate: 0, error: `not vendored: run \`npm run compat -- --vendor\`` };
  }

  const files = readdirSync(dir).filter((f) => f.endsWith('.js') || f.endsWith('.cjs'));
  if (files.length === 0) {
    return { ...base, tests: 0, passed: 0, failed: 0, rate: 0, error: 'no test files vendored' };
  }

  // The shim is written per run, statically, beside the tests. It must be static:
  // the suites do `import * as host from '../shim.js'` and read named exports, and a
  // dynamic `await import(target)` can only produce a default. Writing it here rather
  // than at vendor time is what lets one vendored suite grade any implementation.
  writeFileSync(
    join(vendorDir, host.name, 'shim.js'),
    `// generated per run — COMPAT_TARGET=${target}\nexport * from '${target}';\n`,
  );

  let output = '';
  try {
    const args = ['--test', '--test-reporter=tap', ...files.map((f) => join(dir, f))];
    output = execFileSync(process.execPath, args, {
        encoding: 'utf8',
        env: { ...process.env, COMPAT_TARGET: target },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 300_000,
      // A suite that is mostly failing emits more TAP diagnostic than the 1 MB default
      // holds, and the overflow drops the summary lines the count lives in — which
      // silently reads as a score of zero. Seen at 1.16 MB grading burgee/commander.
      maxBuffer: MAX_OUTPUT_BYTES,
      },
    );
  } catch (cause) {
    // A failing suite exits non-zero and still prints its summary — that is the
    // normal case while the rate is below 100%, not an error.
    output = (cause as { stdout?: string }).stdout ?? '';
    if (output === '') {
      return { ...base, tests: 0, passed: 0, failed: 0, rate: 0, error: String((cause as Error).message).slice(0, ERROR_EXCERPT) };
    }
  }

  const counts = parseNodeTest(output);
  const denominator = reference > 0 ? reference : counts.tests;
  return {
    ...base,
    files: files.length,
    ...counts,
    rate: denominator === 0 ? 0 : counts.passed / denominator,
  };
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
