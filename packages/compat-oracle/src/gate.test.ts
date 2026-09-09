/**
 * The gate itself, proven red first (rule 4).
 *
 * Two holes shipped green. The control verdict only asked `passed === 0`, so a known-good
 * implementation at **15 / 16, 93.8%** — one file failing to load because the oracle did not
 * install what the suite requires — exited 0 while the PR asserted 100%. And nine of a
 * host's cases graded a *third-party package* rather than the target: breaking the target
 * completely still scored 10 / 33, because those nine pass for everybody.
 */
import { describe, expect, it } from 'vitest';

import { HOSTS } from './hosts.js';
import { verdict } from './report.js';
import { type Baseline, type Grade, parseFlatTap, summarize, unmatchedExclusions } from './run.js';

const grade = (host: string, over: Partial<Grade> = {}): Grade => ({
  host,
  target: host,
  files: 6,
  tests: 16,
  passed: 16,
  failed: 0,
  skipped: 0,
  reference: 16,
  rate: 1,
  ...over,
});

const collect = (): { write: (s: string) => void; text: () => string } => {
  let out = '';
  return {
    write: (s) => {
      out += s;
    },
    text: () => out,
  };
};

const empty: Baseline = {};

describe('the control verdict', () => {
  it('fails a known-good implementation that is one case short of its own suite', () => {
    // The exact shape of the shipped defect: cli-table3's control on a clean `npm ci`.
    const out = collect();
    const code = verdict([grade('cli-table3', { tests: 16, passed: 15, failed: 1, rate: 15 / 16 })], empty, out.write, true);
    expect(code).toBe(1);
    expect(out.text()).toContain('cli-table3: 1 failing against its own package');
  });

  it('passes a host that fails nothing against its own package', () => {
    expect(verdict([grade('cli-table3')], empty, collect().write, true)).toBe(0);
  });

  it("allows yargs the two failures its own version lookup causes, and not a third", () => {
    // Documented in `hosts.ts`; without the allowance the control has been red at 802/804.
    expect(HOSTS.find((h) => h.name === 'yargs')?.controlFailures?.count).toBe(2);
    expect(verdict([grade('yargs', { tests: 804, passed: 802, failed: 2 })], empty, collect().write, true)).toBe(0);
    expect(verdict([grade('yargs', { tests: 804, passed: 801, failed: 3 })], empty, collect().write, true)).toBe(1);
  });

  it('fails a control that stopped registering cases, even though it fails none', () => {
    // The shape of finding 3, from the gate's side: `test/issues/` was vendored, committed
    // and graded by nobody. Four files' worth of cases simply never ran, nothing failed,
    // and the row published 33 / 33. A control below its own reference is now red.
    const out = collect();
    const code = verdict([grade('cli-table3', { tests: 24, passed: 24, failed: 0, reference: 29, rate: 24 / 29 })], empty, out.write, true);
    expect(code).toBe(1);
    expect(out.text()).toContain('24 of its own 29 cases registered');
  });

  it('leaves a control alone when upstream grew, which is not a shortfall', () => {
    expect(verdict([grade('cli-table3', { tests: 31, passed: 31, failed: 0, reference: 29, rate: 1 })], empty, collect().write, true)).toBe(0);
  });

  it('gives a host with no declared allowance none', () => {
    expect(verdict([grade('chalk', { tests: 58, passed: 57, failed: 1 })], empty, collect().write, true)).toBe(1);
  });

  it('leaves the target run on the ratchet, which is a different question', () => {
    // A target below its baseline is a regression; a target that fails cases it never
    // passed is not, and the control's bar must not be applied to it.
    const baseline: Baseline = { 'cli-table3': { reference: 29, passed: 0, rate: 0 } };
    expect(verdict([grade('cli-table3', { target: 'flagstaff/table', tests: 7, passed: 0, failed: 7, reference: 29, rate: 0 })], baseline, collect().write)).toBe(0);
  });
});

/** Two cases of the shipped shape: one grading the incumbent, one grading the target. */
const TAP = [
  'TAP version 13',
  '1..4',
  'ok 1 - test/verify-legacy-compatibility-test.js > verify original cli-table behavior > empty table has a width of 0',
  'ok 2 - test/verify-legacy-compatibility-test.js > verify original cli-table behavior > compact shorthand',
  'ok 3 - test/verify-legacy-compatibility-test.js > @api cli-table2 matches verified behavior > empty table has a width of 0',
  'not ok 4 - test/verify-legacy-compatibility-test.js > @api cli-table2 matches verified behavior > compact shorthand',
  '',
].join('\n');

const excludes = [{ match: 'test/verify-legacy-compatibility-test.js > verify original cli-table behavior > ', why: 'grades cli-table, not the target' }];

describe('excluding a case that cannot fail for any target', () => {
  it('leaves the excluded cases out of every count', () => {
    expect(parseFlatTap(TAP)).toEqual({ tests: 4, passed: 3, failed: 1, skipped: 0 });
    expect(parseFlatTap(TAP, excludes)).toEqual({ tests: 2, passed: 1, failed: 1, skipped: 0 });
  });

  it('subtracts them from the published rate, so the denominator is what the target could fail', () => {
    expect(summarize(TAP, 1, 0, { excludes }).rate).toBe(0.5);
  });

  it('refuses an exclusion that matches nothing in the control, rather than silently doing nothing', () => {
    const stale = [{ match: 'a title nobody writes any more > ', why: 'stale' }];
    expect(unmatchedExclusions(TAP, stale)).toEqual(['a title nobody writes any more > ']);
    expect(summarize(TAP, 1, 0, { excludes: stale, requireMatch: true }).error).toContain('exclusion matched no case');
  });

  it('lets a target run register nothing from a file that failed to import', () => {
    // The façade does not exist yet: every file fails to load, so no excluded case appears.
    // That is not a stale exclusion, and it must not read as a broken oracle.
    const failed = 'TAP version 13\n1..1\nnot ok 1 - test/table-test.js\n';
    expect(summarize(failed, 1, 29, { excludes }).error).toBeUndefined();
  });

  it("refuses exclusions on a runner whose TAP has no case names to exclude by", () => {
    const summaryOnly = 'TAP version 13\n# tests 878\n# pass 878\n# fail 0\n';
    expect(summarize(summaryOnly, 1, 0, { excludes }).error).toContain('no per-case names');
  });
});
