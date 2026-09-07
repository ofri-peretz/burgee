/**
 * C5 — the ratchet. Proven red first (rule 4): a grade one test below the recorded
 * baseline must count as a regression; at or above it must not. A gate that has never
 * been shown to fail is not a gate.
 */
import { describe, expect, it } from 'vitest';

import { type Baseline, type Grade, parseNodeTest, regressed } from './run.js';

const grade = (passed: number): Grade => ({
  host: 'commander',
  target: 'burgee/commander',
  files: 105,
  tests: 878,
  passed,
  failed: 878 - passed,
  reference: 1307,
  rate: passed / 1307,
});

const baseline: Baseline = { commander: { reference: 1307, passed: 17, rate: 0.013 } };

describe('the compatibility ratchet', () => {
  it('flags one test below the baseline as a regression', () => {
    expect(regressed(grade(16), baseline)).toBe(true);
  });

  it('accepts the baseline itself, and anything above it', () => {
    expect(regressed(grade(17), baseline)).toBe(false);
    expect(regressed(grade(1307), baseline)).toBe(false);
  });

  it('never regresses a host with no baseline yet', () => {
    expect(regressed({ ...grade(0), host: 'yargs' }, baseline)).toBe(false);
  });
});

describe('parsing node:test TAP summaries', () => {
  it('reads the three counts that matter', () => {
    const tap = 'TAP version 13\n# tests 878\n# suites 190\n# pass 17\n# fail 861\n# cancelled 0\n';
    expect(parseNodeTest(tap)).toEqual({ tests: 878, passed: 17, failed: 861 });
  });

  it('reads zero from output with no summary, so a truncated run cannot look like a score', () => {
    expect(parseNodeTest('TAP version 13\nok 1 - something\n')).toEqual({ tests: 0, passed: 0, failed: 0 });
  });
});
