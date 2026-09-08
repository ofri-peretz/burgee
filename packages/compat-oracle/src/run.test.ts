/**
 * C5 — the ratchet. Proven red first (rule 4): a grade one test below the recorded
 * baseline must count as a regression; at or above it must not. A gate that has never
 * been shown to fail is not a gate.
 */
import { describe, expect, it } from 'vitest';

import { type Baseline, type Grade, parseFlatTap, parseNodeTest, regressed, summarize } from './run.js';

const grade = (passed: number): Grade => ({
  host: 'commander',
  target: 'burgee/commander',
  files: 105,
  tests: 878,
  passed,
  failed: 878 - passed,
  skipped: 0,
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
    expect(parseNodeTest(tap)).toEqual({ tests: 878, passed: 17, failed: 861, skipped: 0 });
  });

  it('reads zero from output with no summary, so a truncated run cannot look like a score', () => {
    expect(parseNodeTest('TAP version 13\nok 1 - something\n')).toEqual({ tests: 0, passed: 0, failed: 0, skipped: 0 });
  });
});

describe("parsing vitest's tap-flat", () => {
  // The dialect verbatim, from `vitest run --reporter=tap-flat`: a plan, then one line per
  // test with the file and the describe path in the name. No `# tests / # pass / # fail`.
  const flat = ['TAP version 13', '1..3', 'ok 1 - a.test.js > g > passes # time=0.67ms', 'not ok 2 - a.test.js > g > fails # time=2.62ms', 'ok 3 - a.test.js > g > later # time=0.30ms'].join('\n');

  it('counts the ok and not ok lines, because there is no summary to read', () => {
    expect(parseFlatTap(flat)).toEqual({ tests: 3, passed: 2, failed: 1, skipped: 0 });
  });

  it('reports a skipped test and never counts it, as the other dialect does', () => {
    expect(parseFlatTap('1..2\nok 1 - a # SKIP\nok 2 - b\n')).toEqual({ tests: 1, passed: 1, failed: 0, skipped: 1 });
  });

  it('ignores the indented ok lines of a nested body, which is the other reporter', () => {
    // `--reporter=tap` wraps each test in its file's subtest; counting those would count
    // files, not tests. The patterns are anchored at column zero for exactly this.
    const nested = ['TAP version 13', '1..1', 'not ok 1 - a.test.js {', '    1..2', '    ok 1 - passes', '    not ok 2 - fails', '}'].join('\n');
    expect(parseFlatTap(nested)).toEqual({ tests: 1, passed: 0, failed: 1, skipped: 0 });
  });

  it('summarises a flat run off its plan, with no summary line present', () => {
    const s = summarize(flat, 1, 3);
    expect(s).toMatchObject({ tests: 3, passed: 2, failed: 1, rate: 2 / 3 });
    expect(s.error).toBeUndefined();
  });

  it('will not read a killed run as a flat one, however many ok lines it left behind', () => {
    // A suite that died mid-run has `ok` lines and no plan. Counting them is how "0 / 0"
    // once looked like a grade — with the flat dialect it would look like 72 passing.
    const killed = ['TAP version 13', ...Array.from({ length: 72 }, (_, i) => `ok ${i + 1} - a`)].join('\n');
    const s = summarize(killed, 1, 816);
    expect(s.error).toContain('exited before its summary');
    expect(s.passed).toBe(0);
    expect(s.tests).toBe(0);
  });

  it('prefers the summary lines where a runner prints both', () => {
    // node:test prints a plan *and* a summary; the summary is its own count rather than
    // one inferred from lines, so it wins.
    const both = ['TAP version 13', '1..2', 'ok 1 - a', 'ok 2 - b', '# tests 2', '# pass 1', '# fail 1'].join('\n');
    expect(summarize(both, 1, 2)).toMatchObject({ passed: 1, failed: 1 });
  });
});

describe('summarising a run', () => {
  const withSummary = 'TAP version 13\nok 1 - a\nnot ok 2 - b\n# tests 878\n# pass 17\n# fail 861\n';

  it('output with no summary is an error, never a score of zero', () => {
    // The yargs control died at test 72 when a test called process.exit(); before this,
    // that read as "0 / 0" and looked like a grade.
    const s = summarize('TAP version 13\nok 1 - a\nok 2 - b\n', 10, 816);
    expect(s.error).toMatch(/before its summary/);
    expect(s.passed).toBe(0);
  });

  it('measures against the reference total when one is known', () => {
    const s = summarize(withSummary, 10, 1307);
    expect(s.error).toBeUndefined();
    expect(s.passed).toBe(17);
    expect(s.rate).toBeCloseTo(17 / 1307);
  });

  it('leaves a skipped test out of the denominator: it ran on no one', () => {
    // commander's ".ts subcommand" test skips itself off Windows, so node:test counts 1362
    // registered and 1361 passed with 0 failed; the honest score is 1361 / 1361.
    const s = summarize('# tests 1362\n# pass 1361\n# fail 0\n# skipped 1\n', 105, 1361);
    expect(s).toMatchObject({ tests: 1361, skipped: 1, passed: 1361, rate: 1 });
  });

  it('reads a mocha pending test the same way, from its # SKIP directive', () => {
    const s = summarize('ok 1 - a # SKIP\nok 2 - b\n# tests 2\n# pass 1\n# fail 0\n', 1, 0);
    expect(s).toMatchObject({ tests: 1, skipped: 1, passed: 1, rate: 1 });
  });

  it('takes the registered count over a smaller reference, so a rate can never exceed 1', () => {
    const s = summarize('# tests 827\n# pass 823\n# fail 4\n', 14, 804);
    expect(s.rate).toBeCloseTo(823 / 827, 5);
  });

  it('falls back to the registered count when there is no reference yet', () => {
    expect(summarize(withSummary, 10, 0).rate).toBeCloseTo(17 / 878);
  });
});
