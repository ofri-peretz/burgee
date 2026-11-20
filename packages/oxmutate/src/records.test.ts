import { describe, expect, it } from 'vitest';

import { withoutSuspects, type Suspected } from './records.js';

type Rec = Suspected & { status?: string };
const mutant = (id: string, test = 't1', status = 'Killed'): Rec => ({ type: 'mutant', id, test, status });
const recovered = (suspects: string[], test = 't1'): Rec => ({ type: 'recovered', id: 'm1', suspects, test });

describe('withoutSuspects', () => {
  it('keeps every record when nothing recovered', () => {
    const records: Rec[] = [mutant('m1'), mutant('m2'), { type: 'polluted', id: 'm3', suspects: ['m2'], test: 't1' }];
    expect(withoutSuspects(records)).toEqual(records);
  });

  it('drops the suspects\' verdicts written before the recovery and keeps the first, which started clean', () => {
    const out = withoutSuspects([mutant('m1'), mutant('m2'), mutant('m3'), recovered(['m2', 'm3'])]);
    expect(out.map((r) => `${r.type}:${r.id ?? ''}`)).toEqual(['mutant:m1', 'recovered:m1']);
  });

  it('keeps the verdicts the worker wrote after the recovery, from clean state', () => {
    const out = withoutSuspects([mutant('m1'), mutant('m2', 't1', 'Killed'), recovered(['m2']), mutant('m2', 't1', 'Survived')]);
    expect(out.filter((r) => r.type === 'mutant').map((r) => `${r.id ?? ''}:${r.status ?? ''}`)).toEqual(['m1:Killed', 'm2:Survived']);
  });

  it('drops a suspect only for the test that was polluted', () => {
    const out = withoutSuspects([mutant('m2', 't0'), mutant('m2', 't1'), recovered(['m2'], 't1')]);
    expect(out.filter((r) => r.type === 'mutant').map((r) => r.test)).toEqual(['t0']);
  });

  it('leaves records of other kinds alone, and a recovery with no suspects drops nothing', () => {
    const records: Rec[] = [mutant('m1'), { type: 'recollection' }, { type: 'recovered', id: 'm1', test: 't1' }];
    expect(withoutSuspects(records)).toEqual(records);
  });
});
