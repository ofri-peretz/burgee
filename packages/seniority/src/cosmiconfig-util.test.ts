/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `mergeAll` copies keys out of a config file into an object. A config file is not untrusted
 * the way a request body is, but it is not this program's text either — it is whatever was on
 * disk, and with `$import` it is whatever was on disk somewhere else again. A merge that walks
 * it key by key is the textbook prototype-pollution shape, and the guard that stops it had no
 * test: it was written, and believed.
 *
 * **What the guard actually prevents, measured rather than assumed.** The first version of
 * this file asserted `({} as …).polluted === undefined` after merging a `__proto__` key — and
 * passed with the guard deleted, which is to say it tested nothing. `target['__proto__'] = v`
 * goes through the setter and swaps *that object's* prototype; it does not write
 * `Object.prototype`. The damage is to the config object handed back to the caller: it
 * silently inherits whatever the file said, so `config.isAdmin` can answer `true` for a key
 * no file ever set at the top level. That is what these assert.
 */
import { describe, expect, it } from 'vitest';

import { mergeAll } from './cosmiconfig-util.js';

/** The load path for a `.json` config, and the one parser that puts a real own `__proto__` on the object. */
const parse = (json: string): Record<string, unknown> => JSON.parse(json) as Record<string, unknown>;

describe('merging a config file cannot reach a prototype', () => {
  it('leaves the merged config on Object.prototype after a `__proto__` key', () => {
    const merged = mergeAll([parse('{"__proto__": {"isAdmin": true}}')], { mergeArrays: false });
    expect(Object.getPrototypeOf(merged), 'the file chose the result’s prototype').toBe(Object.prototype);
    expect((merged as { isAdmin?: boolean }).isAdmin, 'a key no file set at the top level answers anyway').toBeUndefined();
  });

  it('leaves a nested object’s prototype alone too, not just the root’s', () => {
    const merged = mergeAll([{ a: { b: 1 } }, parse('{"a": {"__proto__": {"isAdmin": true}}}')], { mergeArrays: false });
    const nested = merged['a'] as { isAdmin?: boolean };
    expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
    expect(nested.isAdmin).toBeUndefined();
  });

  it('does not let `constructor` be replaced, which is the other route to a prototype', () => {
    const merged = mergeAll([parse('{"constructor": {"prototype": {"isAdmin": true}}}')], { mergeArrays: false });
    expect(merged['constructor'], 'a config file replaced the constructor').toBe(Object.prototype.constructor);
  });

  it('does not copy a `prototype` key, which matters the moment a merge target is a function', () => {
    const merged = mergeAll([parse('{"prototype": {"isAdmin": true}}')], { mergeArrays: false });
    // Own properties only, deliberately: the claim is that the key was never *copied*, and `in` would answer
    // for an inherited one — the exact distinction this whole file is about.
    expect(Object.hasOwn(merged, 'prototype')).toBe(false);
  });

  it('still merges every ordinary key, which is the whole point of the function', () => {
    expect(mergeAll([{ a: 1, deep: { x: 1 } }, { b: 2, deep: { y: 2 } }], { mergeArrays: false })).toEqual({ a: 1, b: 2, deep: { x: 1, y: 2 } });
  });

  it('concatenates arrays when asked and replaces them when not', () => {
    expect(mergeAll([{ xs: [1] }, { xs: [2] }], { mergeArrays: true })).toEqual({ xs: [1, 2] });
    expect(mergeAll([{ xs: [1] }, { xs: [2] }], { mergeArrays: false })).toEqual({ xs: [2] });
  });
});
