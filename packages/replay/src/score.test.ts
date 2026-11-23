import { describe, expect, it } from 'vitest';

import { type Case } from './cases.js';
import { type Finding } from './config.js';
import { type CaseResult, score, toText } from './score.js';

const bug = (id: string): Case => ({ id, kind: 'bug', pr: 1, base: 'aaaaaaa', head: 'bbbbbbb', answer: 'a', set: 'test' });
const control = (id: string): Case => ({ id, kind: 'control', pr: 2, base: 'aaaaaaa', head: 'bbbbbbb', set: 'test' });
const finding = (stage: string, severity: Finding['severity'], item?: string): Finding => ({ stage, severity, text: `${stage} ${severity}`, item });

const RESULTS: CaseResult[] = [
  // Found raw, verified and final.
  { case: bug('b1'), findings: [{ finding: finding('raw', 'must-fix', 'spawn'), matches: true }, { finding: finding('verified', 'must-fix'), matches: true }, { finding: finding('final', 'must-fix', 'spawn'), matches: true }], capped: false, fired: { types: true } },
  // Found raw, dropped in verification.
  { case: bug('b2'), findings: [{ finding: finding('raw', 'should-fix', 'docs'), matches: true }, { finding: finding('final', 'nit'), matches: false }], capped: true, fired: { types: false } },
  // A blocking false alarm, and a nit that is not one.
  { case: control('c1'), findings: [{ finding: finding('final', 'should-fix', 'spawn'), matches: false }], capped: false, fired: { types: true } },
  { case: control('c2'), findings: [{ finding: finding('final', 'nit'), matches: false }, { finding: finding('raw', 'must-fix'), matches: false }], capped: false, fired: {} },
];

describe('score', () => {
  const report = score(RESULTS, ['raw', 'verified', 'final'], ['types', 'lint'], ['spawn', 'docs', 'unused']);

  it('counts recall per stage, so a bug dropped in verification shows where', () => {
    expect(report.bugs).toBe(2);
    expect(report.controls).toBe(2);
    expect(report.recall).toEqual([
      { stage: 'raw', found: 2 },
      { stage: 'verified', found: 1 },
      { stage: 'final', found: 1 },
    ]);
  });

  it('counts last-stage findings by severity, and false alarms as blocking last-stage findings on controls', () => {
    expect(report.severity).toEqual({ 'must-fix': 1, 'should-fix': 1, nit: 2, 'pre-existing': 0 });
    expect(report.falseAlarms).toBe(1);
  });

  it('counts each check and item: fired, and right', () => {
    expect(report.firing).toEqual([
      { id: 'types', kind: 'check', fired: 2, right: 1 },
      { id: 'lint', kind: 'check', fired: 0, right: 0 },
      { id: 'spawn', kind: 'item', fired: 3, right: 2 },
      { id: 'docs', kind: 'item', fired: 1, right: 1 },
      { id: 'unused', kind: 'item', fired: 0, right: 0 },
    ]);
    expect(report.neverFired).toEqual(['lint', 'unused']);
    expect(report.capped).toEqual(['b2']);
  });

  it('prints the report', () => {
    expect(toText(report)).toBe(
      [
        '2 bug case(s), 2 control(s)',
        '',
        'recall per stage:',
        '  raw: 2 of 2 (100%)',
        '  verified: 1 of 2 (50%)',
        '  final: 1 of 2 (50%)',
        'false alarms on controls: 1 of 2 (50%)',
        'last-stage findings: must-fix 1, should-fix 1, nit 2, pre-existing 0',
        '',
        'firing (fired / right):',
        '  check types: 2 / 1',
        '  check lint: 0 / 0',
        '  item spawn: 3 / 2',
        '  item docs: 1 / 1',
        '  item unused: 0 / 0',
        '',
        'never fired: lint, unused. fix: keep or drop each, in a decision',
        '',
        'capped (findings past --max-findings not graded): b2',
      ].join('\n'),
    );
  });

  it('prints n/a for an empty set and leaves out the empty sections', () => {
    const empty = score([], ['final'], [], []);
    expect(toText(empty)).toBe(['0 bug case(s), 0 control(s)', '', 'recall per stage:', '  final: 0 of 0 (n/a)', 'false alarms on controls: 0 of 0 (n/a)', 'last-stage findings: must-fix 0, should-fix 0, nit 0, pre-existing 0'].join('\n'));
  });

  it('tells bugs from controls when they are not as many, and counts a false alarm once per control', () => {
    const fired = { types: true };
    const odd = score(
      [
        { case: bug('b1'), findings: [], capped: true, fired },
        { case: bug('b2'), findings: [], capped: true, fired },
        { case: control('c1'), findings: [{ finding: finding('final', 'nit'), matches: false }, { finding: finding('final', 'must-fix'), matches: false }], capped: false, fired },
      ],
      ['final'],
      ['types'],
      [],
    );
    expect([odd.bugs, odd.controls, odd.falseAlarms]).toEqual([2, 1, 1]);
    expect(odd.firing).toEqual([{ id: 'types', kind: 'check', fired: 3, right: 2 }]);
    expect(toText(odd)).toContain('\nfiring (fired / right):\n  check types: 3 / 2\n');
    expect(toText(odd)).toContain('capped (findings past --max-findings not graded): b1, b2');
    expect(toText(score([], ['final'], ['lint'], []))).toContain('never fired: lint.');
  });

  it('rounds percentages', () => {
    const three = score([RESULTS[0] as CaseResult, RESULTS[1] as CaseResult, { ...(RESULTS[1] as CaseResult), case: bug('b3') }], ['raw', 'final'], [], []);
    expect(toText(three)).toContain('  final: 1 of 3 (33%)');
    expect(toText(three)).toContain('  raw: 3 of 3 (100%)');
  });
});
