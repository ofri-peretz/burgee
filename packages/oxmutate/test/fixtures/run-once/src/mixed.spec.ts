import { describe, expect, it } from 'vitest';

import { isOdd, parity } from './parity.js';

const ODD = 5;
const EVEN = 4;

// A file that opens with a plain test, which runs twice without complaint, and holds a
// RuleTester-shaped block further down: probing only the file's first test missed the block.
it('plain', () => {
  expect(parity(0)).toBe('even');
});

describe('rule tester', () => {
  const seen = new Set<string>();
  const once = (name: string, body: () => void): void => {
    it(name, () => {
      if (seen.has(name)) throw new Error(`detected duplicate test case: ${name}`);
      seen.add(name);
      body();
    });
  };
  once('odd', () => {
    expect(isOdd(ODD)).toBe(true);
    expect(isOdd(EVEN)).toBe(false);
  });
});
