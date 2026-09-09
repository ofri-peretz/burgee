/**
 * Lock — `bench` refuses to emit a band value it did not measure.
 *
 * This is the check that keeps B1 honest. The agent axis cannot run in this repository
 * (no credential), and the tempting shape for a benchmark suite in that position is a
 * document with an estimate in the agent rows and a footnote. Every case below is a way
 * that could happen; each has to be refused by `assertHonest`, not by review.
 *
 * The tests that name a *specific* message are the important ones: a lock that only
 * asserts "some problem was found" passes just as happily when the problem it found was
 * a different one.
 */
import { describe, expect, it } from 'vitest';

import { SUITE } from './bands.js';
import { assertHonest, type AxisState, buildDocument, type ClaimEntry, honestyProblems, type ResultsDoc } from './emit.js';
import { type BenchRecord } from './record.js';

const measured: AxisState = { status: 'measured', method: 'a method sentence' };
const skipped: AxisState = { status: 'skipped', reason: 'no credential' };

const tokens = (median: number): BenchRecord => ({ axis: 'agent', variant: 'burgee', metric: 'tokens-per-task', unit: 'tokens', samples: 25, median, p95: median });
const turns = (median: number): BenchRecord => ({ axis: 'agent', variant: 'burgee', metric: 'turns-per-task', unit: 'turns', samples: 25, median, p95: median });

/** A well-formed agent-suite document, which each test then damages in exactly one way. */
function honestDoc(): ResultsDoc {
  return buildDocument({
    suite: SUITE.agent,
    commit: 'deadbeef',
    machine: {},
    measured: '2026-09-09T00:00:00.000Z',
    axes: { agent: measured },
    records: [tokens(1200), turns(4)],
  });
}

describe('a skipped axis produces no numbers', () => {
  const doc = buildDocument({
    suite: SUITE.agent,
    commit: 'deadbeef',
    machine: {},
    measured: '2026-09-09T00:00:00.000Z',
    axes: { agent: skipped },
    records: [],
  });

  it('leaves every band of that axis without a value, carrying the reason instead', () => {
    for (const id of ['agent-tokens-per-task', 'agent-turns-per-task']) {
      expect(doc.bands[id]).toEqual({ status: 'skipped', reason: 'no credential' });
    }
  });

  it('reports the claim it was supposed to settle as unmeasured, never as false', () => {
    const claim = doc.claims['agent-tokens-40pct'];
    expect(claim?.status).toBe('unmeasured');
    expect(claim?.met).toBeUndefined();
    expect(claim?.reason).toBe('no credential');
  });

  it('still names the claim and its source, so the unmeasured thing is visible rather than absent', () => {
    expect(doc.claims['agent-turns-30pct']?.target).toBe('<= 0.7');
    expect(doc.claims['agent-turns-30pct']?.source).toContain('agent-native-cli-layer');
  });
});

describe('assertHonest refuses', () => {
  it('a band value on an axis that did not run — the exact shape a fabricated B1 would take', () => {
    const doc = honestDoc();
    doc.axes.agent = skipped;
    doc.records = [];
    doc.bands['agent-tokens-per-task'] = { value: 780, from: { axis: 'agent', variant: 'burgee', metric: 'tokens-per-task' } };
    expect(honestyProblems(doc)).toContain('band agent-tokens-per-task carries a value but axis agent is skipped');
    expect(() => {
      assertHonest(doc);
    }).toThrow(/refusing to emit a dishonest results document/);
  });

  it('a band value with no record behind it', () => {
    const doc = honestDoc();
    doc.records = [turns(4)];
    expect(honestyProblems(doc)).toContain('band agent-tokens-per-task carries a value with no burgee tokens-per-task record behind it');
  });

  it('a band value edited away from the number its record holds', () => {
    const doc = honestDoc();
    doc.bands['agent-tokens-per-task'] = { ...doc.bands['agent-tokens-per-task'], value: 700 };
    expect(honestyProblems(doc)).toContain("band agent-tokens-per-task value 700 does not equal its record's median 1200");
  });

  it('an axis that claims it measured something and emitted nothing', () => {
    const doc = honestDoc();
    doc.records = [];
    expect(honestyProblems(doc)).toContain('axis agent claims "measured" but emitted no record');
  });

  it('records from an axis that reported skipped', () => {
    const doc = honestDoc();
    doc.axes.agent = skipped;
    expect(honestyProblems(doc)).toContain('axis agent is skipped but emitted 2 record(s)');
  });

  it('a skipped axis with no reason given', () => {
    const doc = honestDoc();
    doc.axes.agent = { status: 'skipped' };
    doc.records = [];
    expect(honestyProblems(doc)).toContain('axis agent is skipped with no reason');
  });

  it('a claim marked met on an axis that never ran', () => {
    const doc = honestDoc();
    doc.axes.agent = skipped;
    doc.records = [];
    doc.claims['agent-tokens-40pct'] = { claim: 'x', source: 'y', target: '<= 0.6', measured: 0.5, met: true };
    expect(honestyProblems(doc)).toContain('claim agent-tokens-40pct carries a measurement but axis agent did not run');
  });

  it('a claim whose measurement was edited away from its record', () => {
    const doc = buildDocument({
      suite: SUITE.agent,
      commit: 'deadbeef',
      machine: {},
      measured: '2026-09-09T00:00:00.000Z',
      axes: { agent: measured },
      records: [tokens(1200), turns(4), { axis: 'agent', variant: 'burgee ÷ commander', metric: 'tokens-per-task-ratio', unit: 'ratio', samples: 25, median: 0.8, p95: 0.8 }],
    });
    expect(doc.claims['agent-tokens-40pct']?.met).toBe(false);
    const settled = doc.claims['agent-tokens-40pct'] as ClaimEntry;
    doc.claims['agent-tokens-40pct'] = { ...settled, measured: 0.4, met: true };
    expect(honestyProblems(doc)).toContain("claim agent-tokens-40pct measured 0.4 does not equal its record's median 0.8");
  });

  it('a record with no samples behind it', () => {
    const doc = honestDoc();
    doc.records = [{ ...tokens(1200), samples: 0 }, turns(4)];
    expect(honestyProblems(doc)).toContain('agent burgee tokens-per-task: 0 samples');
  });

  it('a band the registry does not know', () => {
    const doc = honestDoc();
    doc.bands['tokens-saved'] = { value: 1 };
    expect(honestyProblems(doc)).toContain(`band tokens-saved is not declared in bands.ts for suite ${SUITE.agent}`);
  });
});

describe('buildDocument', () => {
  it('refuses to build when a measured axis did not produce a band it is responsible for', () => {
    expect(() =>
      buildDocument({ suite: SUITE.agent, commit: 'x', machine: {}, axes: { agent: measured }, records: [tokens(1200)] }),
    ).toThrow(/produced no burgee turns-per-task record for band agent-turns-per-task/);
  });

  it('settles a claim as met when the measurement clears it', () => {
    const doc = buildDocument({
      suite: SUITE.agent,
      commit: 'x',
      machine: {},
      axes: { agent: measured },
      records: [tokens(1200), turns(4), { axis: 'agent', variant: 'burgee ÷ commander', metric: 'turns-per-task-ratio', unit: 'ratio', samples: 25, median: 0.55, p95: 0.55 }],
    });
    expect(doc.claims['agent-turns-30pct']).toMatchObject({ measured: 0.55, met: true, target: '<= 0.7' });
  });
});
