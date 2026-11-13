import { describe, expect, it } from 'vitest';

import { disjointGroups, type MutantResult } from './coordinator.js';

let next = 0;
/** A mutant spanning `[startLine, startColumn, endLine, endColumn]`. */
const at = ([startLine, startColumn, endLine, endColumn]: [number, number, number, number], file = 'src/a.ts'): MutantResult => ({
  id: `m${String(next++)}`,
  file,
  mutatorName: 'StringLiteral',
  replacement: '""',
  start: { line: startLine, column: startColumn },
  end: { line: endLine, column: endColumn },
  status: 'Survived',
  coveredBy: [],
});

// `static.group` arms several static mutants in one run. Two that touch the same source text are
// the pair most able to hide each other, so they never share a group (oxmutate-fastest R4).
describe('static mutants, grouped so that no two in a group touch the same text', () => {
  it('fills groups to the size, in the order given', () => {
    const five = [at([1, 1, 1, 5]), at([2, 1, 2, 5]), at([3, 1, 3, 5]), at([4, 1, 4, 5]), at([5, 1, 5, 5])];
    expect(disjointGroups(five, 2)).toEqual([[five[0]?.id, five[1]?.id], [five[2]?.id, five[3]?.id], [five[4]?.id]]);
    expect(disjointGroups(five, 5)).toEqual([five.map((m) => m.id)]);
    expect(disjointGroups([], 4)).toEqual([]);
  });

  it('keeps a mutant apart from one it sits inside, and from one it overlaps', () => {
    const object = at([10, 3, 14, 4]);
    const inside = at([11, 5, 11, 12]);
    const overlapping = at([14, 2, 15, 9]);
    const elsewhere = at([20, 1, 20, 6]);
    expect(disjointGroups([object, inside, overlapping, elsewhere], 4)).toEqual([[object.id, elsewhere.id], [inside.id, overlapping.id]]);
  });

  it('lets two mutants that only meet at a boundary, or sit in different files, share a group', () => {
    const left = at([7, 1, 7, 10]);
    const right = at([7, 10, 7, 20]);
    const sameSpanOtherFile = at([7, 1, 7, 10], 'src/b.ts');
    expect(disjointGroups([left, right, sameSpanOtherFile], 3)).toEqual([[left.id, right.id, sameSpanOtherFile.id]]);
  });

  it('keeps two mutants of the same span apart: two replacements of one node', () => {
    const one = at([3, 4, 3, 9]);
    const other = at([3, 4, 3, 9]);
    expect(disjointGroups([one, other], 2)).toEqual([[one.id], [other.id]]);
  });
});
