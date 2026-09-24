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
import { absentHere, absentPassing, REPEATS, repeatAndAgree, silentDowngrades, verdict } from './report.js';
import { type Baseline, type Grade, parseFlatTap, regressed, summarize, summarizeExitCodes, unmatchedExclusions } from './run.js';

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
    // `reference: 804` rather than the helper's default: a fixture registering 804 cases
    // against a reference of 16 was only ever harmless because nothing looked at the gap.
    expect(verdict([grade('yargs', { tests: 804, passed: 802, failed: 2, reference: 804 })], empty, collect().write, true)).toBe(0);
    expect(verdict([grade('yargs', { tests: 804, passed: 801, failed: 3, reference: 804 })], empty, collect().write, true)).toBe(1);
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

  it('counts a case that skipped itself as one that registered', () => {
    // Live on ubuntu the first time this check ran: yargs registers 804, one of which is
    // an OS-specific test that skips on Linux and did not on the machine that set the
    // reference. A skip is reported, never counted as passing, and never a shortfall.
    expect(verdict([grade('yargs', { tests: 803, passed: 802, failed: 1, skipped: 1, reference: 804, rate: 802 / 804 })], empty, collect().write, true)).toBe(0);
  });

  /**
   * **Reversed 2026-09-16, deliberately.** This case used to assert the opposite — that a
   * control registering 31 against a reference of 29 is "upstream grew, which is not a
   * shortfall" and may pass. That was right about the cause and wrong about the remedy.
   *
   * The reference is the *published denominator*. `rate()` divides by
   * `max(reference, registered)`, so a control that finds more cases than the reference does
   * not merely notice growth — it changes the number on the page, and only on the machine
   * that has the extra cases. Measured: `cosmiconfig` is 241 cases on darwin and 243 on
   * ubuntu, and the row committed from darwin read 77.2% there and 76.5% on ubuntu for one
   * commit. Nothing was red, because growth was allowed.
   *
   * So growth is now red, and the remedy is the one it always was: re-record the reference
   * (a re-vendor already prints what moved, in `vendor-diff.md`), or declare a difference the
   * suite creates on purpose in `conditionalCases`. Both are one edit and both are visible.
   */
  it('refuses a control that grew past its reference, because the reference is the published denominator', () => {
    const out = collect();
    expect(verdict([grade('cli-table3', { tests: 31, passed: 31, failed: 0, reference: 29, rate: 1 })], empty, out.write, true)).toBe(1);
    expect(out.text()).toContain('the reference is not this suite');
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

/**
 * `mode: "exit-code"` — the coarse grade, and the gate that keeps it from spreading.
 *
 * A suite with no reporter can only be graded as one bit: rc's `node test/test.js` is bare
 * `assert` calls and `console.log`, so `1 / 1, 100.0%` is the honest answer and the row has
 * to say on its face that its 100% means something weaker than commander's 1360 / 1360.
 *
 * The danger is not that row. It is every *other* row quietly becoming that row. Each of
 * this oracle's other collapses is loud — a file that fails to import registers one test
 * instead of twenty, and the reference catches the shortfall — but a row that switches to
 * exit-code grading keeps reporting 100% while measuring one bit, and nothing about the
 * number looks wrong. So the baseline fragment is where the declaration lives, and grading
 * a row this way without one is red.
 */
describe('a row graded as one pass/fail bit', () => {
  const declared: Baseline = { rc: { reference: 1, passed: 1, rate: 1, mode: 'exit-code' } };
  const coarse = (host: string): Grade => grade(host, { files: 1, tests: 1, passed: 1, failed: 0, reference: 1, rate: 1, mode: 'exit-code' });

  it('is allowed when its own baseline declares the mode', () => {
    expect(silentDowngrades([coarse('rc')], declared)).toEqual([]);
    expect(verdict([coarse('rc')], declared, collect().write, true)).toBe(0);
  });

  it('goes red when a row that counted cases is quietly graded this way instead', () => {
    // The deliberate downgrade: commander's 1,360 cases become one bit, and the rate it
    // publishes is still 100%.
    const baseline: Baseline = { ...declared, commander: { reference: 1360, passed: 1360, rate: 1 } };
    const out = collect();
    expect(verdict([coarse('rc'), coarse('commander')], baseline, out.write, true)).toBe(1);
    expect(out.text()).toContain('commander: graded by exit code');
    expect(out.text()).toContain('stops measuring anything');
  });

  it('names only the row that was downgraded, not the one that declared it', () => {
    const baseline: Baseline = { ...declared, chalk: { reference: 58, passed: 58, rate: 1 } };
    expect(silentDowngrades([coarse('rc'), coarse('chalk')], baseline)).toEqual([
      'chalk: graded by exit code (1 case for the whole suite), but baseline/chalk.json does not declare `"mode": "exit-code"`',
    ]);
  });

  it('leaves a row alone that is still graded case by case, whatever its baseline says', () => {
    expect(silentDowngrades([grade('rc', { tests: 1, passed: 1, reference: 1 })], declared)).toEqual([]);
  });

  it('checks the ratchet run too, not only the control', () => {
    const baseline: Baseline = { chalk: { reference: 58, passed: 58, rate: 1 } };
    expect(verdict([coarse('chalk')], baseline, collect().write)).toBe(1);
  });

  it('grades the suite as one case that passed, or one that failed', () => {
    expect(summarizeExitCodes([], 1, 1)).toMatchObject({ mode: 'exit-code', tests: 1, passed: 1, failed: 0, rate: 1 });
    expect(summarizeExitCodes(['test/test.js'], 1, 1)).toMatchObject({ mode: 'exit-code', tests: 1, passed: 0, failed: 1, rate: 0 });
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

  it('matches an exact exclusion by the whole title, not by a word inside another one (A27)', () => {
    const tap = ['ok 1 - main', 'not ok 2 - stderr', 'ok 3 - stderr default fallback', 'ok 4 - custom fallback stderr', 'ok 5 - isSupported stderr', ''].join('\n');
    const exact = [{ match: 'stderr', why: 'mutates another module', exact: true }];
    expect(parseFlatTap(tap, exact)).toEqual({ tests: 4, passed: 4, failed: 0, skipped: 0 });
    expect(unmatchedExclusions(tap, [{ match: 'stder', why: 'a prefix is not a title', exact: true }])).toEqual(['stder']);
  });

  it('subtracts exclusions from a summary by the case lines they match, as ava prints both (A27)', () => {
    const ava = ['TAP version 13', 'not ok 1 - main', 'not ok 2 - stderr', 'ok 3 - stderr default fallback', 'ok 4 - isSupported', '', '1..4', '# tests 4', '# pass 2', '# fail 2', ''].join('\n');
    const both = [
      { match: 'main', why: 'x', exact: true },
      { match: 'stderr', why: 'x', exact: true },
    ];
    expect(summarize(ava, 1, 2, { excludes: both, requireMatch: true })).toMatchObject({ tests: 2, passed: 2, failed: 0, rate: 1 });
    expect(summarize('# tests 4\n# pass 4\n# fail 0\n', 1, 4, { excludes: both }).error).toContain('no per-case names');
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

/**
 * The denominator must not read the machine it ran on.
 *
 * `cosmiconfig`'s suite is 241 cases on darwin and 243 on ubuntu — `search-strategies.test.ts`
 * guards two with `if (process.platform === 'linux')`, so they are never registered anywhere
 * else. `rate()` divides by `max(reference, registered)`, so a reference recorded from darwin
 * published 77.2% there and 76.5% on ubuntu for the same commit and the same target, which
 * `compat:page --check` caught on PR #338.
 *
 * Two things have to hold and they pull against each other: the smaller platform's control
 * must not be red for cases the suite never gave it, and a case lost for any *other* reason
 * must stay as red as it was. So the shortfall is declared per host, exact, and spent only
 * off the platforms named in `only`.
 */
/** A signal-exit grade as darwin measures it: 127 cases registered of the 135 reference. */
const onDarwin = (passed: number): Grade => ({ host: 'signal-exit', target: 'closeout', files: 8, tests: 127, passed, failed: 127 - passed, skipped: 0, reference: 135, rate: passed / 135 });

describe('a suite whose case count depends on the platform', () => {
  it('counts the two cosmiconfig guards as absent off linux, and as present on it', () => {
    expect(absentHere('cosmiconfig', 'darwin')).toBe(2);
    expect(absentHere('cosmiconfig', 'win32')).toBe(2);
    expect(absentHere('cosmiconfig', 'linux')).toBe(0);
  });

  it('reads the other spelling too, where the guard is `!== win32`', () => {
    // lilconfig's two are absent on Windows and present on both platforms this repo grades
    // on, so the declaration changes no published number and still makes a Windows run right.
    expect(absentHere('lilconfig', 'win32')).toBe(2);
    expect(absentHere('lilconfig', 'darwin')).toBe(0);
    expect(absentHere('lilconfig', 'linux')).toBe(0);
  });

  it('credits the ratchet with declared passes only where the cases are absent (signal-exit)', () => {
    // signal-exit's 8 Linux-only cases pass where they run, so darwin may not be read as
    // having lost them; cosmiconfig's 2 fail where they run, so darwin is credited nothing.
    expect(absentPassing('signal-exit', 'darwin')).toBe(8);
    expect(absentPassing('signal-exit', 'linux')).toBe(0);
    expect(absentPassing('cosmiconfig', 'darwin')).toBe(0);
    const baseline = { 'signal-exit': { reference: 135, passed: 134, rate: 134 / 135 } };
    expect(regressed(onDarwin(126), baseline, absentPassing('signal-exit', 'darwin'))).toBe(false);
    // A real loss on darwin is still a loss: the credit is exact, not a cushion.
    expect(regressed(onDarwin(125), baseline, absentPassing('signal-exit', 'darwin'))).toBe(true);
  });

  it('claims nothing for a host that declares nothing', () => {
    for (const host of ['commander', 'dotenv', 'rc']) {
      for (const platform of ['darwin', 'linux', 'win32'] as const) expect(absentHere(host, platform)).toBe(0);
    }
  });

  /**
   * The invariant the declaration buys, stated as arithmetic rather than through `verdict`.
   *
   * `controlShortfall` reads `process.platform`, so a test that drove it end to end for
   * cosmiconfig would itself pass on one OS and fail on the other — which is the defect under
   * repair, written into its own lock. What has to hold is that what each platform registers
   * plus what it is declared to lack is **one number**, and that number is the reference.
   */
  it('adds up to the same 243 on the machine that runs 241 and the one that runs 243', () => {
    expect(241 + absentHere('cosmiconfig', 'darwin')).toBe(243);
    expect(243 + absentHere('cosmiconfig', 'linux')).toBe(243);
  });

  /**
   * The half that actually shipped, driven end to end through a host that declares nothing so
   * the assertion holds on every OS.
   *
   * The undeclared machine was the *bigger* one: darwin recorded 241, ubuntu registered 243,
   * and nothing objected — `rate()` simply widened the denominator, so one commit published
   * two rates. A control that finds more cases than its reference is proof the reference is
   * not the suite, and it is now red on the run whose whole job is to fix the reference.
   */
  it('refuses a control that registers MORE than its reference, which is how the rate read the machine', () => {
    const out = collect();
    expect(verdict([grade('commander', { tests: 243, passed: 243, failed: 0, reference: 241 })], empty, out.write, true)).toBe(1);
    expect(out.text()).toContain('the reference is not this suite');
  });

  it('keeps the older half — a control short of its reference — exactly as red', () => {
    const out = collect();
    expect(verdict([grade('commander', { tests: 240, passed: 240, failed: 0, reference: 243 })], empty, out.write, true)).toBe(1);
    expect(out.text()).toContain('of its own 243 cases registered');
  });

  it('is quiet when the reference is the suite', () => {
    expect(verdict([grade('commander', { tests: 243, passed: 243, failed: 0, reference: 243 })], empty, collect().write, true)).toBe(0);
  });

  /**
   * The first draft of the clause above read the count off `registered`, which adds the skips
   * back so the *shortfall* clause cannot punish a machine for skipping more. commander and
   * yargs caught it in one run: each skips one OS-specific case, so each read one case over
   * its own reference and the control exited 1 on a repository where nothing was wrong.
   *
   * The two clauses want different quantities and that is not a subtlety to leave implicit —
   * the shortfall asks "is every case accounted for", the denominator asks "did `rate()`'s
   * divisor widen", and skips are already out of the divisor.
   */
  it('does not read a skipped case as the suite having grown', () => {
    // commander on darwin: `# tests 1361`, `# skipped 1`, so `tests` is 1360 — its reference.
    expect(verdict([grade('commander', { tests: 1360, passed: 1360, failed: 0, skipped: 1, reference: 1360 })], empty, collect().write, true)).toBe(0);
    // yargs, with its declared allowance of 2 on top of the skip.
    expect(verdict([grade('yargs', { tests: 804, passed: 802, failed: 2, skipped: 1, reference: 804 })], empty, collect().write, true)).toBe(0);
  });
});

/**
 * R7 — a row that fell is graded again before its red is believed, and a recovery is named.
 * Driven with a scripted `regrade`, so each case says exactly what the runner "did".
 */
/** An exit-hook grade with `passed` of its 21 cases. */
const exitHookAt = (passed: number): Grade => ({ host: 'exit-hook', target: 'closeout/exit-hook', files: 1, tests: 21, passed, failed: 21 - passed, skipped: 0, reference: 21, rate: passed / 21 });
const belowAll = (g: Grade): boolean => g.passed < 21;
/** A `regrade` that answers each call with the next scripted count, and counts its calls. */
function scripted(...runs: number[]): { regrade: () => Grade; calls: () => number } {
  let i = 0;
  return { regrade: () => exitHookAt(runs[i++] ?? 0), calls: () => i };
}

describe('repeat and agree (R7)', () => {
  it('leaves a row that did not fall alone, and grades it once', () => {
    const { regrade, calls } = scripted();
    const [g] = repeatAndAgree([exitHookAt(21)], { fell: belowAll, regrade, write: () => undefined });
    expect(g?.attempts).toBeUndefined();
    expect(calls()).toBe(0);
  });

  it('believes a recovery under load, and names it with every attempt', () => {
    const said: string[] = [];
    const { regrade } = scripted(21);
    const [g] = repeatAndAgree([exitHookAt(17)], { fell: belowAll, regrade, write: (s) => said.push(s) });
    expect(g?.passed).toBe(21);
    expect(g?.attempts).toEqual([17, 21]);
    expect(said.join('')).toContain('exit-hook: fell on attempt 1 and recovered on attempt 2 (17 → 21 passing)');
  });

  it('keeps a row red when every attempt agrees — a real regression cannot hide', () => {
    const { regrade, calls } = scripted(17, 17);
    const [g] = repeatAndAgree([exitHookAt(17)], { fell: belowAll, regrade, write: () => undefined });
    expect(belowAll(g as Grade)).toBe(true);
    expect(g?.attempts).toEqual([17, 17, 17]);
    expect(calls()).toBe(REPEATS);
  });

  it('stops at the first attempt that recovers', () => {
    const { regrade, calls } = scripted(21, 3);
    repeatAndAgree([exitHookAt(17)], { fell: belowAll, regrade, write: () => undefined });
    expect(calls()).toBe(1);
  });
});
