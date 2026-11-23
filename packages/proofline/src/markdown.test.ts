import { describe, expect, it } from 'vitest';

import { cells, codeSpans, items, section, tableRows } from './markdown.js';

describe('section', () => {
  const doc = '# T\n\n## What is wanted\n\nA\n\n## Success criteria\n\n- one\n- two\n\n## Next\n\nB\n';

  it('returns the body under the first heading that starts with one of the names, up to the next ## heading', () => {
    expect(section(doc, ['Success criteria'])).toBe('\n- one\n- two\n');
  });

  it('takes the first name that matches, and a heading that only starts with it', () => {
    expect(section('## Success criteria (C1–C3)\nx\n', ['Nope', 'Success criteria'])).toBe('x\n');
  });

  it('runs to the end when no heading follows', () => {
    expect(section('## Next\n\nB\nC', ['Next'])).toBe('\nB\nC');
  });

  it('is undefined when no heading matches, and does not match a ### heading', () => {
    expect(section(doc, ['Missing'])).toBeUndefined();
    expect(section('### Success criteria\nx', ['Success criteria'])).toBeUndefined();
  });

  it('ends at a ## heading but not at a ### one', () => {
    expect(section('## A\nx\n### B\ny\n## C\nz', ['A'])).toBe('x\n### B\ny');
  });
});

describe('cells', () => {
  it('trims each cell and drops the outer pipes', () => {
    expect(cells('  | a | b `x` |  c|  ')).toEqual(['a', 'b `x`', 'c']);
  });

  it('keeps an escaped pipe inside its cell', () => {
    expect(cells('| a \\| b | c |')).toEqual(['a \\| b', 'c']);
  });

  it('reads a row with no outer pipes', () => {
    expect(cells('a | b')).toEqual(['a', 'b']);
  });
});

describe('tableRows', () => {
  const doc = [
    '| Other | x |',
    '| --- | --- |',
    '| o1 | o2 |',
    '',
    '| Criterion | Command | Output |',
    '| :-- | :-: | --: |',
    '| C1. a | `npm test` | ok |',
    '| C2. b | prose | fine |',
    'not a row |',
    '| C3. after a break | x | y |',
    '| Criterion | Command | Output |',
    '| --- | --- | --- |',
    '  | C4. indented | `x` | y |',
  ].join('\n');

  it('returns the body rows of every table headed by the cell, never its header or rule', () => {
    expect(tableRows(doc, 'Criterion')).toEqual([
      ['C1. a', '`npm test`', 'ok'],
      ['C2. b', 'prose', 'fine'],
      ['C4. indented', '`x`', 'y'],
    ]);
  });

  it('reads the other table by its own header', () => {
    expect(tableRows(doc, 'Other')).toEqual([['o1', 'o2']]);
  });

  it('keeps a row with dashes among other text, and skips one of dashes alone as a rule', () => {
    expect(tableRows('| Criterion |\n| --- |\n| a-b |\n| - |\n| :- |\n| -x |\n| x- |', 'Criterion')).toEqual([['a-b'], ['-x'], ['x-']]);
  });

  it('is empty when no table has the header', () => {
    expect(tableRows(doc, 'Nope')).toEqual([]);
  });
});

describe('items', () => {
  it('returns the top-level items, each joined with its indented continuation lines', () => {
    expect(items('intro\n- one\n  more of one\n\n- two\n  - nested\nafter\n- three')).toEqual(['one more of one', 'two - nested', 'three']);
  });

  it('ignores an indented line before the first item, and a blank indented line', () => {
    expect(items('  stray\n- one\n   \n- two')).toEqual(['one', 'two']);
  });

  it('trims an item', () => {
    expect(items('-   spaced   ')).toEqual(['spaced']);
  });
});

describe('codeSpans', () => {
  it('returns the contents of each code span', () => {
    expect(codeSpans('run `a b` then `c`, not ``')).toEqual(['a b', 'c']);
  });
});
