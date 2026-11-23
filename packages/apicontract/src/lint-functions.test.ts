import { describe, expect, it } from 'vitest';

import { apply, CASINGS, FUNCTIONS, validAgainst } from './lint-functions.js';

describe('apply', () => {
  it('lists the functions and casings it knows', () => {
    expect(FUNCTIONS).toEqual(['truthy', 'falsy', 'defined', 'undefined', 'pattern', 'casing', 'enumeration', 'length', 'xor', 'schema']);
    expect(CASINGS).toEqual(['camel', 'pascal', 'kebab', 'snake', 'macro', 'flat']);
  });

  it.each([undefined, null, false, '', 0])('truthy refuses %j and falsy accepts it', (value) => {
    expect(apply('truthy', value)).toBe(`is ${value === undefined ? 'missing' : JSON.stringify(value)}`);
    expect(apply('falsy', value)).toBeUndefined();
  });

  it.each([true, 'a', 1, [], {}])('truthy accepts %j and falsy refuses it', (value) => {
    expect(apply('truthy', value)).toBeUndefined();
    expect(apply('falsy', value)).toBe(`is ${JSON.stringify(value)}`);
  });

  it('defined and undefined look only at presence', () => {
    expect(apply('defined', undefined)).toBe('is missing');
    expect(apply('defined', null)).toBeUndefined();
    expect(apply('undefined', undefined)).toBeUndefined();
    expect(apply('undefined', null)).toBe('is null');
  });

  it('pattern matches, refuses a match, and refuses what is not a string', () => {
    expect(apply('pattern', 'abc', { match: '^a' })).toBeUndefined();
    expect(apply('pattern', 'abc', { match: '^b' })).toBe('"abc" does not match ^b');
    expect(apply('pattern', 'abc', { notMatch: 'c$' })).toBe('"abc" matches c$');
    expect(apply('pattern', 'abc', { notMatch: '^c' })).toBeUndefined();
    expect(apply('pattern', 'abc', { match: 'a', notMatch: 'c' })).toBe('"abc" matches c');
    expect(apply('pattern', 'abc')).toBeUndefined();
    expect(apply('pattern', 'abc', { match: 5, notMatch: 5 })).toBeUndefined();
    expect(apply('pattern', 'Abc', { match: String.raw`^\p{Lu}` })).toBeUndefined();
    expect(apply('pattern', 'abc', { notMatch: String.raw`^\p{Lu}` })).toBeUndefined();
    expect(apply('pattern', 'Abc', { notMatch: String.raw`^\p{Lu}` })).toBe(String.raw`"Abc" matches ^\p{Lu}`);
    expect(apply('pattern', 1, { match: '1' })).toBe('1 is not a string');
  });

  it.each([
    ['camel', 'listPets', 'ListPets'],
    ['pascal', 'ListPets', 'listPets'],
    ['kebab', 'list-pets-2', 'list--pets'],
    ['snake', 'list_pets_2', 'list_Pets'],
    ['macro', 'LIST_PETS', 'LIST_pets'],
    ['macro', 'LIST', 'list_PETS'],
    ['flat', 'listpets', 'listPets'],
  ])('casing %s accepts %s and refuses %s', (type, good, bad) => {
    expect(apply('casing', good, { type })).toBeUndefined();
    expect(apply('casing', bad, { type })).toBe(`"${bad}" is not ${type} case`);
    expect(apply('casing', `${good} x`, { type })).toBe(`"${good} x" is not ${type} case`);
  });

  it('casing refuses what is not a string', () => {
    expect(apply('casing', 1, { type: 'camel' })).toBe('1 is not a string');
  });

  it('enumeration names the values it takes', () => {
    expect(apply('enumeration', 'b', { values: ['a', 'b'] })).toBeUndefined();
    expect(apply('enumeration', 'c', { values: ['a', 1] })).toBe('"c" is not one of "a", 1');
    expect(apply('enumeration', 'c')).toBe('"c" is not one of ');
  });

  it('length counts characters, items and keys against min and max', () => {
    expect(apply('length', 'abc', { min: 3, max: 3 })).toBeUndefined();
    expect(apply('length', 'ab', { min: 3 })).toBe('has 2, fewer than 3');
    expect(apply('length', [1, 2, 3, 4], { max: 3 })).toBe('has 4, more than 3');
    expect(apply('length', { a: 1 }, { min: 2 })).toBe('has 1, fewer than 2');
    expect(apply('length', [], {})).toBeUndefined();
    expect(apply('length', 'ab', { min: '5', max: '1' })).toBeUndefined();
    expect(apply('length', undefined, { min: 1 })).toBe('is missing');
    expect(apply('length', 1, { min: 1 })).toBe('1 has no length');
    expect(apply('length', null, { min: 1 })).toBe('null has no length');
  });

  it('xor wants exactly one of the properties', () => {
    expect(apply('xor', { a: 1 }, { properties: ['a', 'b'] })).toBeUndefined();
    expect(apply('xor', { a: 1, b: 2 }, { properties: ['a', 'b'] })).toBe('has a and b of a, b; exactly one is wanted');
    expect(apply('xor', {}, { properties: ['a', 'b'] })).toBe('has none of a, b; exactly one is wanted');
    expect(apply('xor', undefined)).toBe('has none of ; exactly one is wanted');
  });

  it('schema validates the value against a JSON Schema', () => {
    expect(apply('schema', 3, { schema: { type: 'integer' } })).toBeUndefined();
    expect(apply('schema', 'x', { schema: { type: 'integer' } })).toBe('"x" is not valid against its schema');
  });
});

describe('validAgainst', () => {
  it('reads the dialect it is given', () => {
    expect(validAgainst({ type: 'string', nullable: true }, null, 'openapi-3.0')).toBeUndefined();
    expect(validAgainst({ type: 'string' }, null)).toBe('null is not valid against its schema');
  });
});
