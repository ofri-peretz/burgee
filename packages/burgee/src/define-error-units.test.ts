/**
 * `defineError`'s edges, each in a module of its own (the registry of codes and kinds is
 * per module): the first and last codes a program may claim, and the spelling of a kind.
 */
import { describe, expect, it } from 'vitest';

import { defineError } from './define-error.js';

describe('defineError at its edges', () => {
  it('takes the first and the last code a program may claim, and nothing past them', () => {
    expect(defineError({ name: 'First', code: 7 }).exitCode).toBe(7);
    expect(defineError({ name: 'Last', code: 125 }).exitCode).toBe(125);
    expect(() => defineError({ name: 'Under', code: 6 })).toThrow(RangeError);
    expect(() => defineError({ name: 'Over', code: 126 })).toThrow(RangeError);
  });

  it('takes a kind with digits, and refuses one that only starts snake_case', () => {
    expect(defineError({ name: 'Digits', code: 30, kind: 'http_429' }).exitCode).toBe(30);
    expect(() => defineError({ name: 'Tail', code: 31, kind: 'ok-then-not' })).toThrow(/snake_case/);
  });
});
