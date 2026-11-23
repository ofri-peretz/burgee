import { describe, expect, it } from 'vitest';

import { BUDGET, shrink, smaller } from './props-shrink.js';

/** Fails while some number in the list is more than 9. */
const fails = (value: unknown): boolean => Array.isArray(value) && value.some((item) => typeof item === 'number' && item > 9);

describe('smaller', () => {
  it('lists values a step smaller, smallest first', () => {
    expect([...smaller([1, 2])]).toEqual([[], [2], [1], [0, 2], [1, 0], [1, 1]]);
    expect([...smaller({ a: 'x', b: true })]).toEqual([{ b: true }, { a: 'x' }, { a: '', b: true }, { a: 'x', b: false }]);
    expect([...smaller('a😀c')]).toEqual(['', 'a', 'a😀']);
    expect([...smaller('a')]).toEqual(['']);
    expect([...smaller(-12)]).toEqual([0, -6, -11, 12]);
    expect([...smaller(2)]).toEqual([0, 1]);
    expect([...smaller('')]).toEqual([]);
    expect([...smaller(-7.5)]).toEqual([0, -7, -3, 7.5]);
    expect([...smaller(1)]).toEqual([0]);
    expect([...smaller(0)]).toEqual([]);
    expect([...smaller(false)]).toEqual([]);
    expect([...smaller(null)]).toEqual([]);
    expect([...smaller([])]).toEqual([]);
    expect([...smaller([5])]).toEqual([[], [0], [2], [4]]);
    expect([...smaller('abcd')]).toEqual(['', 'ab', 'abc']);
    expect([...smaller(3)]).toEqual([0, 1, 2]);
    expect([...smaller(0.5)]).toEqual([0]);
    expect([...smaller(-0.5)]).toEqual([0, 0.5]);
    expect([...smaller(1.5)]).toEqual([0, 1]);
  });
});

describe('shrink', () => {
  it('finds the smallest value that still fails', () => {
    expect(shrink([3, 'x', { a: 1 }, 400, 12], fails)).toEqual([10]);
    expect(shrink({ keep: 'abcdef', drop: [1, 2] }, (value) => typeof (value as { keep?: string }).keep === 'string' && (value as { keep: string }).keep.length >= 2)).toEqual({ keep: 'ab' });
  });

  it('returns the value as it is when nothing smaller fails, and stops at its budget', () => {
    expect(shrink(5, () => false)).toBe(5);
    let calls = 0;
    shrink(1, () => {
      calls += 1;
      return false;
    });
    // One pass over the candidates, and no second once none failed.
    expect(calls).toBe([...smaller(1)].length);
    let tries = 0;
    const counted = (): boolean => {
      tries += 1;
      return false;
    };
    shrink(Array.from({ length: 100 }, (_, index) => index), counted, 7);
    expect(tries).toBe(7);
    tries = 0;
    const descends = shrink(1e9, (value) => {
      tries += 1;
      return value !== 0;
    }, 3);
    expect(tries).toBe(3);
    expect(descends).toBe(5e8);
    tries = 0;
    const halves = shrink(1e9, (value) => {
      tries += 1;
      return value !== 0;
    }, 4);
    expect([tries, halves]).toEqual([4, 2.5e8]);
    expect(BUDGET).toBe(500);
  });
});
