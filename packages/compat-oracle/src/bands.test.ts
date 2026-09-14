/**
 * Lock — one control band per graded suite, and the band list is *derived* from this
 * directory rather than kept in step by hand.
 *
 * `scripts/control-bands.ts` builds a `compat-<host>-pass-rate` band for every file in
 * `baseline/`. It did not always: the bands were six hand-written entries while the
 * baseline held eight, so `cli-table3` and `string-width` were graded every run with no
 * band watching either number, and nothing anywhere said so — both sides of the wire were
 * hand-kept and agreed with each other.
 *
 * This is the check for the property rather than a snapshot of the count. Wave 2 has five
 * package lanes adding fragments at the same time, so `→ 9` would be wrong by the time it
 * was written and would then be *edited* to match on every landing, which is a test that
 * records history instead of gating. What holds no matter how many land is that the two
 * sets are equal: a fragment with no band is a rate nobody watches, and a band with no
 * fragment is a series that can never be computed and reports "band not computed yet"
 * forever — indistinguishable from a young band that is simply still collecting.
 *
 * Read off the script's own output, not from a re-implementation of its derivation. Three
 * copies of that walk already exist (`control-bands.ts`, `benchmarks/bands.ts` and
 * `benchmarks/bands.test.ts`); a fourth here would prove they agree with a fourth rather
 * than that the script a person runs prints what it should.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const REPO_ROOT = resolve(root, '..', '..');
const WATCHER = join(REPO_ROOT, 'scripts', 'control-bands.ts');
const BASELINE = join(root, 'baseline');

/** Spawning a whole watcher and reading its report is seconds, not milliseconds. */
const TIMEOUT_MS = 120_000;

const bandId = (host: string): string => `compat-${host}-pass-rate`;

/** Every host with a committed baseline fragment. */
function gradedHosts(): string[] {
  return readdirSync(BASELINE)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length))
    .sort();
}

/**
 * Every `compat-*` band the watcher reported, whatever tier it reported it at: a band can
 * print as `✓ inside band`, as `✗` with a breach, or as `· n/8 points — band not computed
 * yet`, and all three mean the band exists. Matching on the id alone is what keeps this
 * from failing the day a new host's series grows long enough to leave the third shape.
 */
export function compatBandsIn(report: string): string[] {
  return [...new Set([...report.matchAll(/\bcompat-[a-z0-9.@/-]+-pass-rate\b/g)].map((m) => m[0]))].sort();
}

/** The two directions of the wire, each named, so a failure says which way it broke. */
export function bandProblems(hosts: string[], reported: string[]): string[] {
  const seen = new Set(reported);
  const wanted = new Set(hosts.map(bandId));
  return [
    ...hosts.filter((h) => !seen.has(bandId(h))).map((h) => `baseline/${h}.json is graded and has no control band — its rate is watched by nobody`),
    ...reported.filter((b) => !wanted.has(b)).map((b) => `band ${b} has no baseline fragment — it can never be computed and will report "band not computed yet" forever`),
  ];
}

/**
 * The watcher's whole report as a person running it sees it — stdout *and* stderr, because
 * it prints through `console.warn` so that piping the report somewhere cannot be confused
 * with piping a machine-readable result.
 *
 * Run with node itself rather than through tsx: `engines.node` is 24.x, which strips the
 * types natively, and one fewer resolved binary is one fewer thing to behave differently on
 * the Windows leg of the matrix. `npx tsx scripts/control-bands.ts` — the spelling in
 * `.sdlc/PLAN.md` §2.17 and in `npm run control-bands` — runs this same file.
 */
function watcherReport(): string {
  const run = spawnSync(process.execPath, [WATCHER], { cwd: REPO_ROOT, encoding: 'utf8', timeout: TIMEOUT_MS });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  if (run.status !== 0) throw new Error(`scripts/control-bands.ts exited ${String(run.status)}: ${output.slice(0, 2000)}`);
  return output;
}

describe('every graded suite has a control band', () => {
  it(
    'derives one band per baseline fragment, however many fragments there are',
    () => {
      expect(existsSync(WATCHER), `${WATCHER} is gone — this lock is checking nothing`).toBe(true);
      const hosts = gradedHosts();
      // A walk that found nothing would make the assertion below vacuously true.
      expect(hosts.length, 'no baseline fragments found — the lock is reading the wrong directory').toBeGreaterThan(0);
      expect(bandProblems(hosts, compatBandsIn(watcherReport()))).toEqual([]);
    },
    TIMEOUT_MS,
  );

  it('goes red for a fragment the watcher does not band', () => {
    // The shipped shape: `cli-table3` and `string-width` graded with no band reading either.
    expect(bandProblems(['chalk', 'cli-table3'], [bandId('chalk')])).toEqual(['baseline/cli-table3.json is graded and has no control band — its rate is watched by nobody']);
  });

  it('goes red for a band with no fragment, which is the other way the wire breaks', () => {
    expect(bandProblems(['chalk'], [bandId('chalk'), bandId('meow')])).toEqual([
      'band compat-meow-pass-rate has no baseline fragment — it can never be computed and will report "band not computed yet" forever',
    ]);
  });

  it('reads a band at any tier, because all three shapes mean the band exists', () => {
    const printed = [
      '  ✓ compat-chalk-pass-rate: inside band (82 points)',
      '  · compat-cross-spawn-pass-rate: 0/8 points — band not computed yet',
      '  ✗ compat-yargs-pass-rate: 3σ — one point beyond 3σ, below the mean',
    ].join('\n');
    expect(compatBandsIn(printed)).toEqual([bandId('chalk'), bandId('cross-spawn'), bandId('yargs')]);
  });

  it('ignores the non-compat bands, which this lock has no opinion about', () => {
    expect(compatBandsIn('  ✓ cold-start-ratio: inside band (82 points)\n  ✓ agent-hangs-per-100: inside band')).toEqual([]);
  });
});
