import { describe, expect, it } from 'vitest';

import { randomFrom } from './props-random.js';

/** mulberry32 as its author published it (bryc, "PRNGs in JavaScript"): the oracle. */
const reference = (seed: number): (() => number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const draw = (seed: number): number[] => {
  const random = randomFrom(seed);
  return Array.from({ length: 5 }, () => random.next());
};

describe('randomFrom', () => {
  it('is mulberry32: the same numbers as the published reference, so a printed seed replays anywhere', () => {
    for (const seed of [0, 1, 42, 123_456_789]) {
      const ours = randomFrom(seed);
      const theirs = reference(seed);
      for (let index = 0; index < 50; index += 1) expect(ours.next()).toBe(theirs());
    }
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
  });

  it('keeps the seed to its low 32 bits, and every number in [0, 1)', () => {
    expect(randomFrom(-1).seed).toBe(4_294_967_295);
    expect(randomFrom(2 ** 32 + 5).seed).toBe(5);
    const random = randomFrom(3);
    for (let index = 0; index < 1000; index += 1) {
      const value = random.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('draws whole numbers with both ends included, picks every item, and takes chances at their rate', () => {
    const random = randomFrom(11);
    const ints = new Set(Array.from({ length: 400 }, () => random.int(2, 4)));
    expect([...ints].sort()).toEqual([2, 3, 4]);
    const picked = new Set(Array.from({ length: 400 }, () => random.pick(['a', 'b', 'c'])));
    expect(picked.size).toBe(3);
    const heads = Array.from({ length: 4000 }, () => random.chance(0.25)).filter(Boolean).length;
    expect(heads).toBeGreaterThan(850);
    expect(heads).toBeLessThan(1150);
    expect(random.chance(0)).toBe(false);
    expect(random.chance(1)).toBe(true);
  });
});
