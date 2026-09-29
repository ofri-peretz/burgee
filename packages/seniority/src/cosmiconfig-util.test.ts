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

import { decodeFileContent, emplace, getPropertyByPath, mergeAll, removeUndefinedValuesFromObject } from './cosmiconfig-util.js';

describe('decodeFileContent', () => {
  it('decodes UTF-16 by either byte-order mark, and leaves a UTF-8 one in place (10.0.1)', () => {
    const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('{"a":1}', 'utf16le')]);
    const be = Buffer.from(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('{"a":1}', 'utf16le').swap16()]));
    expect(decodeFileContent(le)).toBe('{"a":1}');
    expect(decodeFileContent(be)).toBe('{"a":1}');
    const utf8Bom = `${String.fromCodePoint(0xfeff)}{"a":1}`;
    expect(decodeFileContent(Buffer.from(utf8Bom, 'utf8'))).toBe(utf8Bom);
    expect(decodeFileContent(Buffer.from('{"a":1}', 'utf8'))).toBe('{"a":1}');
    // Only the pair is a mark: one byte of it is ordinary content.
    expect(decodeFileContent(Buffer.from([0xff, 0x41]))).toBe('�A');
    expect(decodeFileContent(Buffer.from([0xfe, 0x41]))).toBe('�A');
  });
});

describe('getPropertyByPath', () => {
  const source = { 'ant.beetle': 'literal', ant: { beetle: { cootie: 1 }, zero: 0 } };

  it('prefers a literal key with periods in it, then walks the path, and takes an array as names', () => {
    expect(getPropertyByPath(source, 'ant.beetle')).toBe('literal');
    expect(getPropertyByPath(source, 'ant.beetle.cootie')).toBe(1);
    expect(getPropertyByPath(source, ['ant', 'beetle', 'cootie'])).toBe(1);
    expect(getPropertyByPath(source, ['ant.beetle'])).toBe('literal');
    expect(getPropertyByPath(source, 'ant.zero')).toBe(0);
  });

  it('asks only about own properties for the literal key', () => {
    expect(getPropertyByPath({}, 'toString')).toBe(Object.prototype.toString);
    expect(getPropertyByPath(Object.create({ inherited: 1 }), 'inherited')).toBe(1);
    expect(getPropertyByPath(Object.create({ 'a.b': 1 }), 'a.b')).toBeUndefined();
  });

  it('stops at `undefined` and nowhere else, as 10.0.1 does', () => {
    expect(getPropertyByPath(source, 'ant.missing.deeper')).toBeUndefined();
    expect(getPropertyByPath('abc', 'length')).toBe(3);
    expect(getPropertyByPath({ name: 'abc' }, 'name.length')).toBe(3);
    expect(() => getPropertyByPath({ a: null }, 'a.b')).toThrow(TypeError);
    expect(() => getPropertyByPath(null, 'a')).toThrow(TypeError);
  });
});

describe('emplace', () => {
  it('computes once and hands back the stored value after', () => {
    const map = new Map<string, number>();
    let calls = 0;
    const compute = (): number => {
      calls += 1;
      return 7;
    };
    expect(emplace(map, 'k', compute)).toBe(7);
    expect(emplace(map, 'k', compute)).toBe(7);
    expect(calls).toBe(1);
    expect(map.get('k')).toBe(7);
  });

  it('treats a stored `undefined` as absent, so it computes again', () => {
    const map = new Map<string, number | undefined>();
    let calls = 0;
    emplace(map, 'k', () => {
      calls += 1;
      return undefined;
    });
    emplace(map, 'k', () => {
      calls += 1;
      return undefined;
    });
    expect(calls).toBe(2);
  });
});

describe('removeUndefinedValuesFromObject', () => {
  it('drops a key given as `undefined` and keeps every other falsy value (cosmiconfig #317)', () => {
    expect(removeUndefinedValuesFromObject({ stopDir: undefined, a: null, b: 0, c: '', d: false })).toEqual({ a: null, b: 0, c: '', d: false });
    // eslint-disable-next-line conventions/consistent-existence-index-check -- The claim is that the key is gone, not merely undefined: `toEqual` would pass either way.
    expect(Object.hasOwn(removeUndefinedValuesFromObject({ stopDir: undefined }), 'stopDir')).toBe(false);
  });
});

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
    // eslint-disable-next-line conventions/consistent-existence-index-check -- Own properties only, deliberately: the claim is that the key was never *copied*, and `in` would answer for an inherited one — the exact distinction this whole file is about.
    expect(Object.hasOwn(merged, 'prototype')).toBe(false);
  });

  it('still merges every ordinary key, which is the whole point of the function', () => {
    expect(mergeAll([{ a: 1, deep: { x: 1 } }, { b: 2, deep: { y: 2 } }], { mergeArrays: false })).toEqual({ a: 1, b: 2, deep: { x: 1, y: 2 } });
  });

  it('concatenates arrays when asked and replaces them when not', () => {
    expect(mergeAll([{ xs: [1] }, { xs: [2] }], { mergeArrays: true })).toEqual({ xs: [1, 2] });
    expect(mergeAll([{ xs: [1] }, { xs: [2] }], { mergeArrays: false })).toEqual({ xs: [2] });
  });

  it('skips a source that is not a plain object — an import that held no config, or an array', () => {
    expect(mergeAll([undefined, null, 'text', [1, 2], { a: 1 }], { mergeArrays: true })).toEqual({ a: 1 });
  });

  it('overwrites rather than merges when only one side is an array or a plain object', () => {
    expect(mergeAll([{ xs: [1] }, { xs: 'two' }], { mergeArrays: true })).toEqual({ xs: 'two' });
    expect(mergeAll([{ o: { a: 1 } }, { o: [1] }], { mergeArrays: true })).toEqual({ o: [1] });
    expect(mergeAll([{ o: new Date(0) }, { o: { a: 1 } }], { mergeArrays: true })).toEqual({ o: { a: 1 } });
  });
});
