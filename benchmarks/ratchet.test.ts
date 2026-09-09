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
 */
import { describe, expect, it } from 'vitest';

import { type Baseline, type Grade, hostRecords } from './axes/compat.js';
import { ratioRecord, RATIO_CEILING as PERF_CEILING, type Variant, VARIANTS } from './axes/perf.js';
import { BUNDLED_CEILING, type Measured, pairRecords } from './axes/weight.js';
import { PAIRS } from './fixtures/entry-points.js';
import { gateFailures } from './record.js';
import { verdict } from './run.js';

const measuredAt = (bundled: number): Measured => ({ bundled, installed: 1, version: '0.0.0-test', dir: '<repo>/packages/test' });

describe('B4 weight — the bundled-bytes ratchet', () => {
  const pair = PAIRS.find((p) => p.id === 'burgee') as (typeof PAIRS)[number];
  const ceiling = BUNDLED_CEILING['burgee'] as number;

  it('has a ceiling at all', () => {
    expect(ceiling).toBeGreaterThan(0);
  });

  it('exits non-zero one byte over', () => {
    const records = pairRecords(pair, measuredAt(ceiling + 1), measuredAt(ceiling));
    expect(verdict(records)).toBe(1);
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
    expect(verdict([ratioRecord(variant, ours, host, ceiling)])).toBe(1);
  });

  it('exits zero exactly at the ceiling', () => {
    const ours = host.map((ms) => ms * ceiling);
    expect(verdict([ratioRecord(variant, ours, host, ceiling)])).toBe(0);
  });

  it('gates the median, not the p95 — an absolute or tail-driven gate is what red-lit two innocent PRs in #27', () => {
    const ours = host.map((ms, i) => (i > 36 ? ms * 10 : ms));
    const record = ratioRecord(variant, ours, host, ceiling);
    expect(record.p95).toBeGreaterThan(ceiling);
    expect(verdict([record])).toBe(0);
  });
});

const grade = (passed: number, rate: number): Grade => ({ host: 'commander', target: 'burgee/commander', tests: 1360, passed, failed: 1360 - passed, skipped: 0, reference: 1360, rate });

describe("B3 compatibility — the ratchet on the oracle's own numbers", () => {
  const baseline: Baseline = { commander: { reference: 1360, passed: 1360, rate: 1 } };

  it('exits non-zero when one case out of 1,360 stops passing', () => {
    const records = hostRecords(grade(1359, 1359 / 1360), baseline);
    expect(verdict(records)).toBe(1);
    expect(gateFailures(records).map((f) => f.record.metric)).toContain('passing-tests');
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
