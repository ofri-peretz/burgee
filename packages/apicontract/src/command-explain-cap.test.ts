import { describe, expect, it } from 'vitest';

import { bytesOf, cap } from './command-explain-cap.js';

const value = { a: { b: { c: [1, 2, 3] }, d: 'x' }, e: [{ f: 1 }], 'g/h~': { i: true } };

describe('bytesOf', () => {
  it('counts UTF-8 bytes of the compact JSON, not characters', () => {
    expect(bytesOf({ a: 1 })).toBe(7);
    expect(bytesOf('é')).toBe(4);
  });
});

describe('cap', () => {
  it('returns a value that already fits as it is, with no cuts', () => {
    expect(cap(value, bytesOf(value))).toEqual({ value, cut: [] });
    expect(cap(value, bytesOf(value)).value).toBe(value);
  });

  it('empties the deepest container first, and stops as soon as the value fits', () => {
    const result = cap(value, bytesOf(value) - 1);
    expect(result.cut).toEqual(['/a/b/c']);
    expect(result.value).toEqual({ ...value, a: { b: { c: [] }, d: 'x' } });
  });

  it('cuts equal depths in document order, escaping keys as JSON Pointer tokens', () => {
    expect(cap(value, 53).cut).toEqual(['/a/b', '/e/0']);
    const result = cap(value, 30);
    expect(result.cut).toEqual(['/a', '/e', '/g~1h~0']);
    expect(bytesOf(result.value)).toBeLessThanOrEqual(30);
  });

  it('empties objects to {} and arrays to [], never changing the input', () => {
    const before = structuredClone(value);
    expect(cap(value, 0).value).toEqual({});
    expect(cap([[1]], 0).value).toEqual([]);
    expect(value).toEqual(before);
  });

  it('names only the outermost cut: a cut inside one that is cut later is dropped', () => {
    expect(cap({ a: { b: [1], c: 2 }, d: { e: [1] } }, 22).cut).toEqual(['/d/e', '/a']);
  });

  it('skips containers that are already empty', () => {
    expect(cap({ a: {}, b: [1] }, 15).cut).toEqual(['/b']);
  });

  it('never cuts above `keep`, and leaves scalars alone', () => {
    expect(cap({ a: { b: { c: 1 } } }, 0, 2)).toEqual({ value: { a: { b: {} } }, cut: ['/a/b'] });
    expect(cap('a long string', 1)).toEqual({ value: 'a long string', cut: [] });
  });

  it('is idempotent', () => {
    for (const max of [0, 10, 30, 50, 80]) {
      const once = cap(value, max).value;
      expect(cap(once, max).value).toEqual(once);
    }
  });
});
