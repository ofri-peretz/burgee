import { describe, expect, it } from 'vitest';

import { type Checklist, type Item } from './checklist.js';
import { type Changed } from './diff.js';
import { match, matchesAny, SHOWN, toText, where } from './match.js';

const item = (id: string, paths: string[], pattern?: string): Item => ({ id, trigger: { paths, ...(pattern === undefined ? {} : { pattern }) }, question: `${id}?`, check: `check ${id}`, sources: [`src/${id}`] });

const FILES: Changed[] = [
  { path: 'packages/a/src/run.ts', added: [{ line: 4, text: "import { spawn } from 'node:child_process';" }], removed: [{ line: 9, text: 'const cp = node:child_process' }] },
  { path: 'docs/readme.md', added: [], removed: [{ line: 2, text: 'gone' }] },
  { path: 'img/logo.png', added: [], removed: [] },
];

describe('match', () => {
  it('fires a path-only item at the first added line, else the first removed line, else the file', () => {
    const checklist: Checklist = { gates: [], items: [item('any', ['**'])] };
    expect(match(checklist, FILES)).toEqual([
      {
        item: checklist.items[0],
        at: [{ file: 'packages/a/src/run.ts', line: 4, side: 'added' }, { file: 'docs/readme.md', line: 2, side: 'removed' }, { file: 'img/logo.png' }],
      },
    ]);
  });

  it('fires a pattern item on each added and removed line it finds, and not elsewhere', () => {
    const checklist: Checklist = { gates: [], items: [item('spawn', ['packages/*/src/**/*.ts'], 'node:child_process')] };
    expect(match(checklist, FILES)[0]?.at).toEqual([
      { file: 'packages/a/src/run.ts', line: 4, side: 'added' },
      { file: 'packages/a/src/run.ts', line: 9, side: 'removed' },
    ]);
  });

  it('keeps an item silent when its paths match nothing, or its pattern finds nothing', () => {
    const checklist: Checklist = { gates: [], items: [item('css', ['**/*.css']), item('eval', ['**'], 'eval\\(')] };
    expect(match(checklist, FILES)).toEqual([]);
  });

  it('matches when any of several globs does, in checklist order', () => {
    const checklist: Checklist = { gates: [], items: [item('second', ['nope', 'img/*.png']), item('first', ['docs/**'])] };
    expect(match(checklist, FILES).map((fired) => fired.item.id)).toEqual(['second', 'first']);
  });

  it('reads the pattern as a unicode regex', () => {
    const checklist: Checklist = { gates: [], items: [item('u', ['**'], '\\u{1F600}')] };
    expect(match(checklist, [{ path: 'a', added: [{ line: 1, text: '😀' }], removed: [] }])).toHaveLength(1);
  });

  it('matchesAny is false for no globs', () => {
    expect(matchesAny('a', [])).toBe(false);
  });
});

describe('where', () => {
  it('names the file, the line and a removed side', () => {
    expect(where({ file: 'a' })).toBe('a');
    expect(where({ file: 'a', line: 3, side: 'added' })).toBe('a:3');
    expect(where({ file: 'a', line: 3, side: 'removed' })).toBe('a:3 (removed)');
  });
});

describe('toText', () => {
  it('says when nothing fires', () => {
    expect(toText([], 'main...HEAD')).toBe('no checklist item fires for main...HEAD');
  });

  it('prints each item with its question, check and the first places it fired', () => {
    const hits = Array.from({ length: SHOWN + 2 }, (_, index) => ({ file: `f${String(index)}` }));
    expect(SHOWN).toBe(3);
    expect(toText([{ item: item('a', ['**']), at: hits.slice(0, SHOWN + 1) }], 'r').split('\n').at(-1)).toBe('  at: f0, f1, f2 and 1 more');
    expect(toText([{ item: item('a', ['**']), at: hits }, { item: item('b', ['**']), at: hits.slice(0, SHOWN) }], 'r')).toBe(
      ['2 checklist item(s) fire for r:', '', 'a: a?', '  check: check a', '  at: f0, f1, f2 and 2 more', '', 'b: b?', '  check: check b', '  at: f0, f1, f2'].join('\n'),
    );
  });
});
