import { describe, expect, it } from 'vitest';

import { doneLine, doneReport, type Stamp } from './done.js';

const stamp = (over: Partial<Stamp>): Stamp => ({
  branch: 'b',
  at: '',
  command: 'npm test',
  exit: 0,
  digest: 'd',
  intent: 'i',
  criterion: 1,
  ...over,
});
const rows = [
  { criterion: 'C2. second', command: 'npm run bench', output: '' },
  { criterion: 'third, no number', command: undefined, output: '' },
];

describe('doneReport', () => {
  it('meets a criterion with a passing stamp for this intent, criterion and branch', () => {
    expect(
      doneReport({
        slug: 'i',
        criteria: ['one'],
        rows: [],
        stamps: [stamp({}), stamp({ command: 'npm run lint' })],
        branch: 'b',
      }),
    ).toEqual([{ n: 1, criterion: 'one', commands: ['npm test', 'npm run lint'] }]);
  });

  it.each([
    ['another branch', { branch: 'c' }],
    ['another intent', { intent: 'j' }],
    ['another criterion', { criterion: 2 }],
    ['a failing command', { exit: 1 }],
    ['no intent', { intent: undefined, criterion: undefined }],
  ])('does not count a stamp from %s', (_, over) => {
    expect(
      doneReport({
        slug: 'i',
        criteria: ['one'],
        rows: [],
        stamps: [stamp(over as Partial<Stamp>)],
        branch: 'b',
      })[0]?.commands,
    ).toEqual([]);
  });

  it("gives each open criterion a fix with its C<n>. row's command in a numbered table, else a placeholder", () => {
    const report = doneReport({
      slug: 'i',
      criteria: ['one', 'two', 'three', 'four'],
      rows: rows,
      stamps: [],
      branch: 'b',
    });
    expect(report.map((r) => r.fix)).toEqual([
      'provedone stamp --intent i --criterion 1 --run "<the command that proves it>" --not-checked "<what you did not check>"',
      'provedone stamp --intent i --criterion 2 --run "npm run bench" --not-checked "<what you did not check>"',
      'provedone stamp --intent i --criterion 3 --run "<the command that proves it>" --not-checked "<what you did not check>"',
      'provedone stamp --intent i --criterion 4 --run "<the command that proves it>" --not-checked "<what you did not check>"',
    ]);
    expect(report.map((r) => r.n)).toEqual([1, 2, 3, 4]);
  });

  it('takes the nth row of a table that numbers no criterion', () => {
    const plain = [
      { criterion: 'first', command: 'a', output: '' },
      { criterion: 'second', command: undefined, output: '' },
    ];
    expect(
      doneReport({
        slug: 'i',
        criteria: ['one', 'two', 'three'],
        rows: plain,
        stamps: [],
        branch: 'b',
      }).map((r) => r.fix?.split('--run ')[1]),
    ).toEqual(['"a" --not-checked "<what you did not check>"', '"<the command that proves it>" --not-checked "<what you did not check>"', '"<the command that proves it>" --not-checked "<what you did not check>"']);
  });

  it('treats a C<n>. inside a cell as an unnumbered table', () => {
    const plain = [{ criterion: 'see C2. later', command: 'a', output: '' }];
    expect(doneReport({ slug: 'i', criteria: ['one'], rows: plain, stamps: [], branch: 'b' })[0]?.fix).toContain('--run "a"');
  });

  it('matches C<n>. exactly, not C<n> as a prefix of C<n>0', () => {
    const many = [{ criterion: 'C10. ten', command: 'ten', output: '' }];
    expect(
      doneReport({
        slug: 'i',
        criteria: ['one'],
        rows: many,
        stamps: [],
        branch: 'b',
      })[0]?.fix,
    ).toContain('--run "<the command');
    expect(
      doneReport({
        slug: 'i',
        criteria: ['one'],
        rows: [
          { criterion: 'C1x', command: 'x', output: '' },
          { criterion: 'C1. one', command: 'one', output: '' },
        ],
        stamps: [],
        branch: 'b',
      })[0]?.fix,
    ).toContain('--run "one"');
  });
});

describe('doneLine', () => {
  it('names each met criterion and its commands, then the open ones', () => {
    const report = [
      { n: 1, criterion: 'a', commands: ['npm test', 'npm run lint'] },
      { n: 2, criterion: 'b', commands: [], fix: 'x' },
      { n: 3, criterion: 'c', commands: ['x'] },
      { n: 4, criterion: 'd', commands: [], fix: 'y' },
    ];
    expect(doneLine(report)).toBe('Checked: C1 by `npm test`, `npm run lint`; C3 by `x`. Not checked: C2, C4.');
  });

  it('says so when no criterion is met, or none is open', () => {
    expect(doneLine([{ n: 1, criterion: 'a', commands: [], fix: 'x' }])).toBe('Checked: no criterion. Not checked: C1.');
    expect(doneLine([{ n: 1, criterion: 'a', commands: ['t'] }])).toBe('Checked: C1 by `t`. Not checked: nothing.');
  });
});
