/**
 * Lock — every gate in this suite has been seen to go red.
 *
 * "A fix is not done until a check would have caught it, and the check must be proven to
 * fail on the unfixed state" (CLAUDE.md rule 4). A benchmark is the easiest place in a
 * repository to break that rule, because it produces impressive-looking output whether or
 * not anything is being checked: **a benchmark that cannot regress is a decoration with a
 * number on it.**
 *
 * So each axis's record builder — the real one, the same function `run()` calls — is fed
 * a synthetic measurement one step worse than its gate, and the run's exit code must be
 * non-zero; then the same measurement exactly at the gate, and it must be zero.
 *
 * `verdict()` explains each failure on stderr, which is right for `--check` and wrong here:
 * those lines are fixtures, and in a CI log they read as measurements. They are captured,
 * so a case can assert what was said, and nothing reaches the log (`no-gate-lines-setup.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { type Baseline, type Grade, gradeRecords, hostRecords } from './axes/compat.js';
import { DELTA_CEILING_MS, deltaRecord, ratioRecord, RATIO_CEILING as PERF_CEILING, type Variant, VARIANTS } from './axes/perf.js';
import { BUNDLED_CEILING, type Measured, pairRecords, RATIO_CEILING as WEIGHT_CEILING } from './axes/weight.js';
import { claimRatchet } from './claim-ratchets.js';
import { CLAIMS } from './claims.js';
import { type AxisState } from './emit.js';
import { PAIRS } from './fixtures/entry-points.js';
import { type AxisName, gateFailures } from './record.js';
import { verdict } from './run.js';

let stderr: MockInstance<typeof console.error>;
beforeEach(() => {
  stderr = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});
/** What `verdict()` said on stderr in this case. */
const said = (): string => stderr.mock.calls.flat().join('\n');

const measuredAt = (bundled: number): Measured => ({ bundled, whole: bundled, installed: 1, version: '0.0.0-test', dir: '<repo>/packages/test' });

describe('B4 weight — the bundled-bytes ratchet', () => {
  const pair = PAIRS.find((p) => p.id === 'burgee') as (typeof PAIRS)[number];
  const ceiling = BUNDLED_CEILING['burgee'] as number;

  it('has a ceiling at all', () => {
    expect(ceiling).toBeGreaterThan(0);
  });

  it('exits non-zero one byte over', () => {
    const records = pairRecords(pair, measuredAt(ceiling + 1), measuredAt(ceiling));
    expect(verdict(records)).toBe(1);
    expect(said()).toContain('burgee bundled-bytes');
  });

  it('exits zero exactly at the ceiling', () => {
    const records = pairRecords(pair, measuredAt(ceiling), measuredAt(ceiling));
    expect(verdict(records)).toBe(0);
  });
});

describe('B4 weight — the "lighter than what it replaces" ratio gate', () => {
  const pair = PAIRS.find((p) => p.id === 'flagstaff/boxen') as (typeof PAIRS)[number];

  it('exits non-zero when the façade grows past the package it replaces', () => {
    const records = pairRecords(pair, measuredAt(1001), measuredAt(1000));
    const failed = gateFailures(records).map((f) => f.record.metric);
    expect(failed).toContain('bundled-bytes-ratio');
    expect(verdict(records)).toBe(1);
    expect(said()).toContain('flagstaff/boxen ÷ boxen bundled-bytes-ratio');
  });

  it('exits zero at parity', () => {
    expect(verdict(pairRecords(pair, measuredAt(1000), measuredAt(1000)))).toBe(0);
  });
});

describe('B2 cold start — the paired-ratio gate', () => {
  const variant = VARIANTS.find((v) => v.id === 'burgee/commander') as Variant;
  const ceiling = PERF_CEILING['burgee/commander'] as number;
  const host = Array.from({ length: 40 }, () => 100);

  it('exits non-zero when the front-end drifts past its ceiling over its host', () => {
    const ours = host.map((ms) => ms * (ceiling + 0.1));
    expect(verdict([ratioRecord({ v: variant, ours, host, gateMax: ceiling })])).toBe(1);
    expect(said()).toContain('burgee/commander ÷ commander cold-start-ratio');
  });

  it('exits zero exactly at the ceiling', () => {
    const ours = host.map((ms) => ms * ceiling);
    expect(verdict([ratioRecord({ v: variant, ours, host, gateMax: ceiling })])).toBe(0);
  });

  it('gates the median, not the p95 — an absolute or tail-driven gate is what red-lit two innocent PRs in #27', () => {
    const ours = host.map((ms, i) => (i > 36 ? ms * 10 : ms));
    const record = ratioRecord({ v: variant, ours, host, gateMax: ceiling });
    expect(record.p95).toBeGreaterThan(ceiling);
    expect(verdict([record])).toBe(0);
  });
});

describe('B2 cold start — roundel R8, the paired-delta gate over picocolors', () => {
  const pico = Array.from({ length: 40 }, (_, i) => 30 + (i % 3));
  const entries = VARIANTS.filter((v) => v.over !== undefined);

  it('holds both colour entries to picocolors, at the allowance R8 writes', () => {
    expect(entries.map((v) => `${v.id} over ${String(v.over)}`)).toEqual(['roundel/tokens over picocolors', 'roundel/chalk over picocolors']);
    expect(DELTA_CEILING_MS).toBe(10);
  });

  it.each(entries.map((v) => [v.id, v] as const))('%s: exits non-zero past picocolors + 10 ms', (id, v) => {
    const ours = pico.map((ms) => ms + DELTA_CEILING_MS + 0.01);
    expect(verdict([deltaRecord({ v, ours, over: pico, gateMax: DELTA_CEILING_MS })])).toBe(1);
    expect(said()).toContain(`${id} − picocolors cold-start-delta-ms: 10.01 ms is above its ceiling of 10`);
  });

  it.each(entries.map((v) => [v.id, v] as const))('%s: exits zero at exactly picocolors + 10 ms', (_, v) => {
    const ours = pico.map((ms) => ms + DELTA_CEILING_MS);
    expect(verdict([deltaRecord({ v, ours, over: pico, gateMax: DELTA_CEILING_MS })])).toBe(0);
  });

  it('gates the median of the per-round differences, never a difference of two medians', () => {
    const v = entries[0] as Variant;
    // Three rounds 5 ms over their own picocolors round and two 40 ms under: the paired median
    // is 5. The two medians are 15 and 50, whose difference, −35, would say roundel starts
    // 35 ms faster — a number no round measured.
    const over = [10, 10, 50, 50, 50];
    const ours = [15, 15, 55, 10, 10];
    const record = deltaRecord({ v, ours, over, gateMax: DELTA_CEILING_MS });
    expect(record.median).toBe(5);
    expect(record.samples).toBe(5);
  });
});

/**
 * D-157: three published claims are downward-only ratchets, and the ceiling has to be what
 * `--check` enforces — a claim at 2.35 beside a gate at 2.9 would publish a ceiling nothing holds.
 * So each gate reads `.sdlc/bands/claim-ratchets.json`, and each is seen to go red one step over.
 */
describe('D-157 claim ratchets — the gate is the claim', () => {
  const weight = [
    ['lighter-than-cac', 'burgee'],
    ['lighter-than-commander', 'burgee/commander'],
  ] as const;

  it.each(weight)('%s: the claim and the B4 gate read the same ceiling', (id, pairId) => {
    const ceiling = claimRatchet(id);
    expect(CLAIMS.find((c) => c.id === id)?.test.max).toBe(ceiling);
    expect(WEIGHT_CEILING[pairId]).toBe(ceiling);
  });

  it.each(weight)('%s: exits non-zero one step over, zero at the ceiling', (id, pairId) => {
    const pair = PAIRS.find((p) => p.id === pairId) as (typeof PAIRS)[number];
    const ceiling = claimRatchet(id);
    const theirs = 10_000;
    const over = pairRecords(pair, measuredAt(Math.round(ceiling * theirs) + 10), measuredAt(theirs));
    expect(gateFailures(over).map((f) => f.record.metric)).toContain('bundled-bytes-ratio');
    expect(verdict(over)).toBe(1);
    expect(verdict(pairRecords(pair, measuredAt(Math.round(ceiling * theirs)), measuredAt(theirs)))).toBe(0);
  });

  it('cold-start-at-or-below-cac: the claim and the B2 gate read the same ceiling, and it fires over it', () => {
    const ceiling = claimRatchet('cold-start-at-or-below-cac');
    expect(CLAIMS.find((c) => c.id === 'cold-start-at-or-below-cac')?.test.max).toBe(ceiling);
    expect(PERF_CEILING['burgee']).toBe(ceiling);
    const variant = VARIANTS.find((v) => v.id === 'burgee') as Variant;
    const host = Array.from({ length: 40 }, () => 100);
    expect(verdict([ratioRecord({ v: variant, ours: host.map((ms) => ms * (ceiling + 0.01)), host, gateMax: ceiling })])).toBe(1);
    expect(said()).toContain('burgee ÷ cac cold-start-ratio');
    expect(verdict([ratioRecord({ v: variant, ours: host.map((ms) => ms * ceiling), host, gateMax: ceiling })])).toBe(0);
  });
});

const grade = (passed: number, rate: number): Grade => ({ host: 'commander', target: 'burgee/commander', tests: 1360, passed, failed: 1360 - passed, skipped: 0, reference: 1360, rate });

describe("B3 compatibility — the ratchet on the oracle's own numbers", () => {
  const baseline: Baseline = { commander: { reference: 1360, passed: 1360, rate: 1 } };

  it('exits non-zero when one case out of 1,360 stops passing', () => {
    const records = hostRecords(grade(1359, 1359 / 1360), baseline);
    expect(verdict(records)).toBe(1);
    expect(gateFailures(records).map((f) => f.record.metric)).toContain('passing-tests');
    expect(said()).toContain('commander passing-tests: 1359 tests is below its floor of 1360');
  });

  it('exits zero at the baseline', () => {
    expect(verdict(hostRecords(grade(1360, 1), baseline))).toBe(0);
  });

  it('catches a lost case even when the rounded rate still looks like 100%', () => {
    // 1359/1360 renders as 99.9%, and a rate-only gate at two decimals would let it past.
    const records = hostRecords(grade(1359, 1), baseline);
    expect(verdict(records)).toBe(1);
  });
});

describe('a gate with nothing behind it', () => {
  it('is not what the suite ships: every gated record names why the bound is where it is', () => {
    const records = [
      ...pairRecords(PAIRS[0] as (typeof PAIRS)[number], measuredAt(1), measuredAt(1)),
      ...hostRecords({ host: 'commander', target: 'burgee/commander', tests: 1, passed: 1, failed: 0, skipped: 0, reference: 1, rate: 1 }, { commander: { reference: 1, passed: 1, rate: 1 } }),
    ];
    const gated = records.filter((r) => r.gate !== undefined);
    expect(gated.length).toBeGreaterThan(0);
    for (const r of gated) expect(r.gate?.why ?? '').not.toBe('');
  });
});

/**
 * The gate the other blocks in this file could not have caught, because they all reason
 * about records: an axis that returns a reason contributes none, and every assertion above
 * is about what `gateFailures` finds in a list. From wave 2 until 2026-09-16 the compat
 * axis was in exactly that state on every CI run — the `planned` hosts `cosmiconfig` and
 * `dotenv` have baseline fragments, `COMPAT_HOSTS` reads `baseline/`, and `run()` returned
 * on the first ungraded name — so every compat band and claim printed `? unmeasured` and
 * `--check` exited 0.
 */
describe('a selected axis that produced nothing', () => {
  const skipped = new Map<AxisName, AxisState>([['compat', { status: 'skipped', reason: 'compat-oracle produced no usable grade for cosmiconfig' }]]);

  it('exits non-zero, with no failing record anywhere', () => {
    expect(gateFailures([])).toHaveLength(0);
    expect(verdict([], skipped)).toBe(1);
    expect(said()).toContain('axis compat was selected and produced no measurement');
  });

  it('leaves an axis nobody asked for alone — `--axis weight` must not fail on the other four', () => {
    const notRun = new Map<AxisName, AxisState>([['compat', { status: 'not-run', reason: 'not selected by --axis' }]]);
    expect(verdict([], notRun)).toBe(0);
  });
});

/**
 * B3's own version of the same hole, at the axis rather than at the exit code: a host the
 * registry declares `planned` is a stated gap and must cost nothing, while a host it does
 * not declare and did not grade must still stop the axis.
 */
describe('B3 compat — a planned host is a declared gap, not a hole', () => {
  const graded: Grade = { host: 'chalk', target: 'roundel', tests: 58, passed: 58, failed: 0, skipped: 0, reference: 58, rate: 1 };

  it('grades the hosts it has, when an ungraded one is declared planned', () => {
    const out = gradeRecords({ measured: '', planned: ['cosmiconfig'], grades: [graded] }, ['chalk', 'cosmiconfig'], {});
    expect('records' in out && out.records.length).toBeGreaterThan(0);
  });

  it('still refuses to publish when an undeclared host is missing', () => {
    const out = gradeRecords({ measured: '', planned: [], grades: [graded] }, ['chalk', 'cosmiconfig'], {});
    expect(out).toEqual({ reason: 'compat-oracle produced no usable grade for cosmiconfig' });
  });
});
