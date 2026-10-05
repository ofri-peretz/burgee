/**
 * Lock — B5 measures what it says it measures, and its gate can go red.
 *
 * The two ways a runtime benchmark lies without looking broken:
 *
 * - **It times two different jobs.** On a pipe chalk styles nothing and paratext prints a
 *   link's fallback while ansi-escapes still emits OSC 8; the ratio is real and means nothing.
 *   Every workload's `check()` proves ours and the incumbent produce the same output, and this
 *   runs every one of them — so a workload that drifted fails `npm test`, not just a benchmark
 *   nobody was watching.
 * - **It times the wrong package.** Both sides of every pair go through `resolvePackage` from
 *   the directory the workloads resolve from, the guard `perf.test.ts` proves fires.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { failureText, PAIRS, resolvePairs, ROUNDS, runtimeRecord, type Sample, sample, workloadEnv } from './axes/runtime.js';
import manifest from './package.json' with { type: 'json' };
import { verdict } from './run.js';
import { readRuntimeRatchets } from './runtime-ratchets.js';

const declared: Record<string, string> = { ...manifest.dependencies, ...manifest.devDependencies };
const FIXTURES = fileURLToPath(new URL('fixtures/runtime/', import.meta.url));
/** Sixteen processes, each loading two packages and proving one workload: generous on purpose. */
const PARITY_TIMEOUT_MS = 180_000;

describe('the pairs', () => {
  it('name each entry point once', () => {
    const ids = PAIRS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PAIRS.map((p) => [p.id, p] as const))('%s has a workload, and both of its packages are declared', (_id, p) => {
    expect(existsSync(`${FIXTURES}${p.file}`), `fixtures/runtime/${p.file} is missing`).toBe(true);
    expect(declared[p.pkg], `${p.pkg} is timed but benchmarks/package.json does not declare it`).toBeDefined();
    expect(declared[p.hostPkg], `${p.hostPkg} is timed but benchmarks/package.json does not declare it`).toBeDefined();
  });

  it('resolve to the declared versions from where the workloads run', () => {
    const resolved = resolvePairs();
    expect([...resolved.keys()]).toEqual(PAIRS.map((p) => p.id));
  });

  it('each have a ratchet, and no ratchet names a pair the axis does not measure', () => {
    expect(Object.keys(readRuntimeRatchets().ratchets).toSorted()).toEqual(PAIRS.map((p) => p.id).toSorted());
  });
});

describe('the workloads run in front of a terminal', () => {
  it('force colour and hyperlinks, and drop NO_COLOR, which would outrank them in some incumbents and not others', () => {
    const env = workloadEnv({ NO_COLOR: '1', PATH: '/bin' });
    expect(env['NO_COLOR']).toBeUndefined();
    expect(env).toMatchObject({ FORCE_COLOR: '3', FORCE_HYPERLINK: '1', TERM_PROGRAM: 'iTerm.app', PATH: '/bin' });
  });

  it(
    'and every one proves ours and the incumbent produce the same output before anything is timed',
    () => {
      for (const p of PAIRS) expect(() => sample(p, 0), p.id).not.toThrow();
    },
    PARITY_TIMEOUT_MS,
  );

  it('and its words survive a stderr full of cursor sequences, as log-update writes', () => {
    const stderr = `${'\u001B[?25l'.repeat(500)}\n\n\u001B[?25lAssertionError: frames differ\n    at check (workload.mjs:3:9)\n`;
    expect(failureText(stderr)).toBe('AssertionError: frames differ\n    at check (workload.mjs:3:9)');
  });

  it('and a workload whose parity check fails stops the run with its own words', () => {
    const broken = { id: 'broken', host: 'nothing', pkg: 'linegauge', hostPkg: 'string-width', file: 'does-not-exist.mjs' };
    expect(() => sample(broken, 0)).toThrow(/broken ÷ nothing: the workload failed/);
  });
});

describe('the record', () => {
  const pair = PAIRS.find((p) => p.id === 'linegauge') as (typeof PAIRS)[number];

  it('gates the median of the per-round ratios, not a ratio of two medians', () => {
    // Round by round: 2/1, 3/1, 1/2 -> 2, 3, 0.5 -> median 2. Medians 2 over 1 would read 2 too,
    // so the third round is where the two differ: 10/20 is 0.5, and the median of sides is 2/1.
    const s: Sample = { ours: [2, 3, 10], theirs: [1, 1, 20], n: 1 };
    const r = runtimeRecord(pair, s);
    expect(r.median).toBe(2);
    expect(r.samples).toBe(3);
    expect(r.variant).toBe('linegauge ÷ string-width');
    expect(r.gate?.max).toBe(readRuntimeRatchets().ratchets['linegauge']?.ceiling);
  });

  it('says whether the ≤ 1.0 target is met, beside the ceiling', () => {
    expect(runtimeRecord(pair, { ours: [1], theirs: [2], n: 1 }).detail?.['met']).toBe(true);
    expect(runtimeRecord(pair, { ours: [3], theirs: [2], n: 1 }).detail?.['met']).toBe(false);
  });

  it('runs an odd number of rounds, so the median is a round that happened', () => {
    expect(ROUNDS % 2).toBe(1);
    for (const p of PAIRS) if (p.rounds !== undefined) expect(p.rounds % 2, p.id).toBe(1);
  });

  it('gives a spec bar more rounds instead of a higher ceiling (D-20260930-b5-ceilings-from-spread)', () => {
    const ratchets = readRuntimeRatchets().ratchets;
    const bars = PAIRS.filter((p) => ratchets[p.id]?.bar !== undefined);
    expect(bars.map((p) => p.id)).toContain('bellpull');
    for (const p of bars) expect(p.rounds ?? ROUNDS, p.id).toBeGreaterThan(ROUNDS);
  });
});

/** A sample whose one round reads exactly `ratio`. */
const at = (ratio: number): Sample => ({ ours: [ratio * 1000], theirs: [1000], n: 1 });

describe('the gate', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(PAIRS.map((p) => [p.id, p] as const))('%s exits non-zero one step over its ceiling and zero at it', (id, p) => {
    const ceiling = readRuntimeRatchets().ratchets[id]?.ceiling as number;
    expect(verdict([runtimeRecord(p, at(ceiling + 0.01))])).toBe(1);
    expect(verdict([runtimeRecord(p, at(ceiling))])).toBe(0);
  });
});

/**
 * bellpull R8's spawn half — "bytes and spawn delta at or under `tinyexec`". The bytes half is
 * B4's `bellpull` row (D-160); this is the other one (D-20260930-bellpull-spawn-vs-tinyexec).
 * R8 states its bar, so the pair's ratchet is that bar and not a ceiling derived above a
 * measurement: a ratchet started at 1.25× today's number would call a bellpull slower than
 * tinyexec green, which is the outcome R8 exists to refuse.
 */
describe('bellpull R8: spawn time at or under tinyexec', () => {
  const pair = PAIRS.find((p) => p.id === 'bellpull') as (typeof PAIRS)[number];

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is measured against tinyexec, the rival R8 names — not execa, which would be a free pass', () => {
    expect(pair).toMatchObject({ host: 'tinyexec', pkg: 'bellpull', hostPkg: 'tinyexec', file: 'bellpull-tinyexec.mjs' });
  });

  it("is gated at R8's bar: the ceiling is the target, 1.0, never a ratchet above it", () => {
    const ratchet = readRuntimeRatchets().ratchets['bellpull'];
    expect(ratchet?.target).toBe(1);
    expect(ratchet?.ceiling).toBeLessThanOrEqual(1);
  });

  it('goes red the moment bellpull spawns slower than tinyexec', () => {
    expect(verdict([runtimeRecord(pair, at(1.01))])).toBe(1);
    expect(runtimeRecord(pair, at(1.01)).detail?.['met']).toBe(false);
  });
});
