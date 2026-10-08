/**
 * The text surface for a result that is not a string (`render.ts`), and the one thing it gained
 * when it left `execute.ts`: a result may carry its own text under `Symbol.for('burgee.text')`.
 */
import { describe, expect, it } from 'vitest';

import { render, TEXT } from './render.js';

describe('render', () => {
  it('prints a list one element per line, a nested value as JSON', () => {
    expect(render(['a', 1, { b: 2 }, null])).toBe('a\n1\n{"b":2}\n');
  });

  it('prints an object one level deep, as key: value', () => {
    expect(render({ a: 'x', b: [1, 2], c: undefined })).toBe('a: x\nb: [1,2]\nc: ');
  });

  it('prints a scalar as itself', () => {
    expect(render(42)).toBe('42');
    expect(render(false)).toBe('false');
  });

  it("prints a result's own text when it carries one, and JSON never sees it", () => {
    const data = { files: 2, refused: [{ file: 'a.ts' }] };
    Object.defineProperty(data, TEXT, { value: () => 'complete: 2 files rewritten', enumerable: false });
    expect(render(data)).toBe('complete: 2 files rewritten');
    expect(JSON.stringify(data)).toBe('{"files":2,"refused":[{"file":"a.ts"}]}');
  });

  it('is the symbol every copy of burgee reads, so a result from another copy still renders', () => {
    expect(TEXT).toBe(Symbol.for('burgee.text'));
  });

  it('ignores a value under the symbol that is not a function', () => {
    expect(render({ a: 1, [TEXT]: 'not callable' })).toBe('a: 1');
  });
});
