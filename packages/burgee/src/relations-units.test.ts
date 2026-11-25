/**
 * `checkRelations` one relation at a time (`relations.ts`): the count each one allows, and the
 * hint each refusal carries, which is the line an agent acts on.
 */
import { describe, expect, it } from 'vitest';

import { checkRelations } from './relations.js';

const typed = { source: 'cli' };
/** A predicate that refuses every set of values. */
const never = (): boolean => false;

describe('checkRelations', () => {
  it('counts a value with no recorded source as typed', () => {
    expect(() => checkRelations([{ conflicts: ['a', 'b'] }], { a: 1, b: 2 }, {})).toThrow('--a, --b cannot be used together');
  });

  it('asks for one when none of an exactly-one group is given, and for fewer when two are', () => {
    expect(() => checkRelations([{ exactlyOneOf: ['a', 'b'] }], {}, {})).toThrow(expect.objectContaining({ hint: 'pass one of them' }));
    expect(() => checkRelations([{ exactlyOneOf: ['a', 'b'] }], { a: 1, b: 2 }, { a: typed, b: typed })).toThrow(expect.objectContaining({ hint: 'drop all but one of --a, --b' }));
    expect(() => checkRelations([{ exactlyOneOf: ['a', 'b'] }], { a: 1 }, { a: typed })).not.toThrow();
  });

  it('allows one of an at-most-one group, and names the ones to drop past that', () => {
    expect(() => checkRelations([{ atMostOneOf: ['a', 'b'] }], { a: 1 }, { a: typed })).not.toThrow();
    expect(() => checkRelations([{ atMostOneOf: ['a', 'b'] }], { a: 1, b: 2 }, { a: typed, b: typed })).toThrow(expect.objectContaining({ hint: 'drop all but one of --a, --b' }));
  });

  it('says which declaration to check when a predicate refuses the values', () => {
    expect(() => checkRelations([{ implies: ['dryRun', never] }], { dryRun: true }, { dryRun: typed })).toThrow(
      expect.objectContaining({ message: '--dry-run is not allowed with these values', hint: 'check the values --dry-run is declared to require' }),
    );
  });
});
