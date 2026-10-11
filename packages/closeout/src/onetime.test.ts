/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/onetime` — onetime 8, which onetime's own suite grades in `compat-oracle`
 * (`graded-override-targets` R3). These cases hold the parts that suite reaches from another
 * process, and the one way it differs from `closeout/once` on purpose: a first call that throws
 * is tried again.
 */
import { describe, expect, it } from 'vitest';

import { once } from './once.js';
import onetime from './onetime.js';

describe('closeout/onetime is onetime 8', () => {
  it('calls the function once, returns its first result, and counts every call', () => {
    let runs = 0;
    const wrapped = onetime((a: number, b: number) => (runs += a + b));
    expect(onetime.callCount(wrapped)).toBe(0);
    expect(wrapped(1, 2)).toBe(3);
    expect(wrapped(5, 5)).toBe(3);
    expect(runs).toBe(3);
    expect(onetime.callCount(wrapped)).toBe(2);
  });

  it('keeps the wrapped function’s name and length, and forwards this', () => {
    const wrapped = onetime(function named(this: { v: number }, _x: number) {
      return this.v;
    });
    expect([wrapped.name, wrapped.length]).toEqual(['named', 1]);
    expect(wrapped.call({ v: 7 }, 0)).toBe(7);
  });

  it('throws on a second call under { throw: true }, naming the function by displayName, name or <anonymous>', () => {
    const named = onetime(function hello() {}, { throw: true });
    named();
    expect(named).toThrow('Function `hello` can only be called once');
    const shown = Object.assign(() => undefined, { displayName: 'Shown' });
    const display = onetime(shown, { throw: true });
    display();
    expect(display).toThrow('Function `Shown` can only be called once');
    const anonymous = onetime(
      Object.defineProperty(() => undefined, 'name', { value: '' }),
      { throw: true },
    );
    anonymous();
    expect(anonymous).toThrow('Function `<anonymous>` can only be called once');
  });

  it('tries again after a first call that throws, where once() never runs twice', () => {
    let calls = 0;
    const flaky = (): string => {
      calls += 1;
      if (calls === 1) throw new Error('first call');
      return 'ok';
    };
    const wrapped = onetime(flaky);
    expect(wrapped).toThrow('first call');
    expect(wrapped()).toBe('ok');
    expect(onetime.callCount(wrapped)).toBe(2);

    calls = 0;
    const guarded = once(flaky);
    expect(guarded).toThrow('first call');
    expect(guarded()).toBeUndefined();
  });

  it('refuses what is not a function, and a function it did not wrap', () => {
    expect(() => onetime(42 as unknown as () => void)).toThrow(new TypeError('Expected a function'));
    expect(() => onetime.callCount(function stray() {})).toThrow('The given function `stray` is not wrapped by the `onetime` package');
  });
});
