/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `once` against the contract it replaces (design R5): `onetime` + `mimic-fn`, 262 M
 * downloads a week between them, for one wrapper.
 *
 * The three preservation cases are the ones that decide whether this is a replacement or a
 * near miss. A once-wrapper that loses `name` is the reason a deadline report says
 * `(anonymous)`; one that loses `this` breaks `obj.method = once(obj.method)` somewhere
 * else entirely, later.
 */
import { describe, expect, it, vi } from 'vitest';

import { once } from './index.js';

/** Declared out here so the wrapper is tested against a function, not against a closure. */
function releaseTheLock(): void {
  /* nothing to do in a test */
}

const three = (_a: number, _b: number, _c: number): void => undefined;

describe('runs at most once', () => {
  it('calls the wrapped function once and returns its first result thereafter', () => {
    const fn = vi.fn((n: number) => n * 2);
    const wrapped = once(fn);

    expect(wrapped(21)).toBe(42);
    expect(wrapped(1)).toBe(42);
    expect(wrapped(1000)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('is safe on the path it exists for: two triggers, one restore', () => {
    const writes: string[] = [];
    const show = once(() => writes.push('[?25h'));

    show();
    show();

    expect(writes).toHaveLength(1);
  });
});

describe('preserves what mimic-fn exists to preserve', () => {
  it('keeps the name, which is what a report prints', () => {
    expect(once(releaseTheLock).name).toBe('releaseTheLock');
  });

  it('keeps the arity, which callers branch on', () => {
    expect(once(three).length).toBe(3);
  });

  it('keeps `this`, so a method can be wrapped in place', () => {
    const counter = {
      hits: 0,
      bump(this: { hits: number }): number {
        this.hits += 1;
        return this.hits;
      },
    };
    counter.bump = once(counter.bump);

    expect(counter.bump()).toBe(1);
    expect(counter.bump()).toBe(1);
    // An arrow wrapper would have called `bump` against `undefined` and thrown here.
    expect(counter.hits).toBe(1);
  });
});
