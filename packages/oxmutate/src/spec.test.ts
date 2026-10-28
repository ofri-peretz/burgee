import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { SPEC_TRACES_ENV, decode, loadTraces, readTrace } from './spec.js';

const dir = mkdtempSync(path.join(tmpdir(), 'oxmutate-spec-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
afterEach(() => vi.unstubAllEnvs());

const itf = (states: object[]): string => JSON.stringify({ '#meta': { format: 'ITF' }, vars: ['x'], states });

describe('ITF values decode to plain JavaScript', () => {
  it('a #bigint in the safe range is a number, past it a bigint', () => {
    expect(decode({ '#bigint': '42' })).toBe(42);
    expect(decode({ '#bigint': '-7' })).toBe(-7);
    expect(decode({ '#bigint': String(Number.MAX_SAFE_INTEGER) })).toBe(Number.MAX_SAFE_INTEGER);
    expect(decode({ '#bigint': String(Number.MIN_SAFE_INTEGER) })).toBe(Number.MIN_SAFE_INTEGER);
    expect(decode({ '#bigint': '9007199254740992' })).toBe(9007199254740992n);
    expect(decode({ '#bigint': '-9007199254740992' })).toBe(-9007199254740992n);
  });
  it('sets and tuples are arrays, maps are Maps, decoded all the way down', () => {
    expect(decode({ '#set': [{ '#bigint': '1' }, { '#bigint': '2' }] })).toEqual([1, 2]);
    expect(decode({ '#tup': ['a', { '#bigint': '3' }] })).toEqual(['a', 3]);
    expect(decode({ '#map': [[{ '#bigint': '1' }, { '#set': [] }]] })).toEqual(new Map([[1, []]]));
  });
  it('records, arrays and scalars pass through', () => {
    expect(decode({ a: { '#bigint': '1' }, b: [true, null, 's'] })).toEqual({ a: 1, b: [true, null, 's'] });
    expect(decode(null)).toBe(null);
    expect(decode(0)).toBe(0);
  });
});

describe('a trace file reads as steps', () => {
  const file = path.join(dir, 'one.itf.json');
  writeFileSync(
    file,
    itf([
      { '#meta': { index: 0 }, 'mbt::actionTaken': 'init', 'mbt::nondetPicks': {}, x: { '#bigint': '0' } },
      { 'mbt::actionTaken': 'step', 'mbt::nondetPicks': { n: { tag: 'Some', value: { '#bigint': '5' } }, m: { tag: 'None', value: { '#tup': [] } }, raw: 9 }, x: { '#bigint': '5' } },
      { x: { '#bigint': '5' } },
    ]),
  );

  it('keeps the action, the picks (None as undefined) and the state without the mbt keys', () => {
    expect(readTrace(file)).toEqual({
      name: 'one.itf.json',
      steps: [
        { action: 'init', picks: {}, state: { x: 0 } },
        { action: 'step', picks: { n: 5, m: undefined, raw: 9 }, state: { x: 5 } },
        { action: '', picks: {}, state: { x: 5 } },
      ],
    });
    expect(Object.keys(readTrace(file).steps[1]?.state ?? {})).toEqual(['x']);
  });
});

describe('loadTraces', () => {
  for (const name of ['t10.itf.json', 't2.itf.json', 't1.itf.json', 'notes.json']) writeFileSync(path.join(dir, name), itf([{ x: name }]));

  it('finds nothing outside an oxmutate run, so the replay tests skip', () => {
    vi.stubEnv(SPEC_TRACES_ENV, '');
    expect(loadTraces('counter')).toEqual([]);
  });
  it('finds nothing for an oracle the run did not generate', () => {
    vi.stubEnv(SPEC_TRACES_ENV, JSON.stringify({ other: dir }));
    expect(loadTraces('counter')).toEqual([]);
  });
  it('reads the oracle directory: only .itf.json files, in numeric order', () => {
    expect(SPEC_TRACES_ENV).toBe('OXMUTATE_SPEC_TRACES');
    vi.stubEnv(SPEC_TRACES_ENV, JSON.stringify({ counter: dir }));
    expect(loadTraces('counter').map((t) => t.name)).toEqual(['one.itf.json', 't1.itf.json', 't2.itf.json', 't10.itf.json']);
    expect(loadTraces('counter')[1]?.steps).toEqual([{ action: '', picks: {}, state: { x: 't1.itf.json' } }]);
  });
});
