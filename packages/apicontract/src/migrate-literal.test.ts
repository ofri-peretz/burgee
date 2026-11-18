import { describe, expect, it } from 'vitest';

import { isUnreadable, readExport } from './migrate-literal.js';

describe('readExport', () => {
  it.each([
    ['export default { a: 1 }', { a: 1 }],
    ['export   default\n{ a: 1 }', { a: 1 }],
    ['module.exports = { a: 1 };', { a: 1 }],
    ['module.exports={a:1}', { a: 1 }],
    ["import { defineConfig } from 'x';\nexport default defineConfig({ a: 1 });", { a: 1 }],
    ['export default defineConfig ( { a: 1 } )', { a: 1 }],
    ['export default [1, 2]', [1, 2]],
  ])('finds the exported value in %j', (source, value) => {
    expect(readExport(source)).toEqual(value);
  });

  it('finds nothing without a default export', () => {
    expect(readExport('const a = { b: 1 };')).toBeUndefined();
    expect(readExport('export const a = { b: 1 };')).toBeUndefined();
  });

  it('reads every kind of literal', () => {
    expect(
      readExport(`export default {
        // a comment
        a: 'single', /* another */ b: "double", c: \`template\`, 'd-e': 1, "f": -2.5, g: 1e3, h: .5,
        i: true, j: false, k: null, l: undefined, m: [1, 'two', [3], { n: 4 },], o: {}, p: [], $q_1: 'esc\\'aped',
      }`),
    ).toEqual({ a: 'single', b: 'double', c: 'template', 'd-e': 1, f: -2.5, g: 1000, h: 0.5, i: true, j: false, k: null, l: undefined, m: [1, 'two', [3], { n: 4 }], o: {}, p: [], $q_1: "esc'aped" });
  });

  it('keeps what it cannot read as its source text', () => {
    expect(
      readExport(`export default {
        a: () => ({ b: [1, 2] }),
        c: call(1, ')', "]"),
        d: \`x\${y}\`,
        e: name,
        ...spread,
        f,
        [computed]: 1,
        g: a.b,
        h: 1 + 2,
        i: trueish,
        j: 'ok',
      }`),
    ).toEqual({
      a: { unreadable: '() => ({ b: [1, 2] })' },
      c: { unreadable: 'call(1, \')\', "]")' },
      d: { unreadable: '`x${y}`' },
      e: { unreadable: 'name' },
      '...spread': { unreadable: '...spread' },
      f: { unreadable: 'f' },
      '[computed]: 1': { unreadable: '[computed]: 1' },
      g: { unreadable: 'a.b' },
      h: { unreadable: '1 + 2' },
      i: { unreadable: 'trueish' },
      j: 'ok',
    });
  });

  it('reads a key written as a template, and skips one with an expression', () => {
    expect(readExport('export default { `a`: 1, `b${c}`: 2 }')).toEqual({ a: 1, '`b${c}`: 2': { unreadable: '`b${c}`: 2' } });
  });

  it('stops a bare value at a statement end', () => {
    expect(readExport('export default config;\nconst x = 1;')).toEqual({ unreadable: 'config' });
    expect(readExport('export default 3;')).toBe(3);
    expect(readExport('export default 3')).toBe(3);
  });

  it('ends at the end of the text, whatever is left open', () => {
    expect(readExport('export default { a: [1, 2')).toEqual({ a: [1, 2] });
    expect(readExport("export default { a: 'open")).toEqual({ a: 'open' });
    expect(readExport('export default { a: f(1')).toEqual({ a: { unreadable: 'f(1' } });
  });
});

describe('isUnreadable', () => {
  it.each([
    [{ unreadable: 'x' }, true],
    [{ unreadable: 1 }, false],
    [{ unreadable: 'x', other: 1 }, false],
    [['x'], false],
    [null, false],
    ['x', false],
  ])('%j is %s', (value, expected) => {
    expect(isUnreadable(value)).toBe(expected);
  });
});
