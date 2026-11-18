import { describe, expect, it } from 'vitest';

import { exampleOf, synthesise } from './plugin-nest-example.js';

type Dict = Readonly<Record<string, unknown>>;

const DEFS: Readonly<Record<string, Dict>> = {
  '#/Pet': { type: 'object', required: ['id', 'self'], properties: { id: { type: 'integer' }, self: { $ref: '#/Pet' }, nick: { type: 'string' } } },
  '#/Name': { type: 'string', example: 'Rex' },
};
const deref = (value: unknown): Dict => {
  const node = (value ?? {}) as Dict;
  return typeof node.$ref === 'string' ? (DEFS[node.$ref] as Dict) : node;
};
const make = (schema: unknown): unknown => synthesise(schema as never, deref);

describe('synthesise', () => {
  it('takes a value the schema names before making one', () => {
    expect(make({ const: 0, enum: [1] })).toBe(0);
    expect(make({ enum: ['b', 'a'], example: 'x' })).toBe('b');
    expect(make({ example: null, examples: ['y'] })).toBeNull();
    expect(make({ examples: ['y'], default: 'z' })).toBe('y');
    expect(make({ examples: [], default: 'z' })).toBe('z');
    expect(make({ $ref: '#/Name' })).toBe('Rex');
  });

  it('makes a value of the type, with the common formats', () => {
    expect(make({ type: 'string' })).toBe('example');
    expect(make({ type: ['null', 'string'], format: 'date' })).toBe('2026-01-01');
    expect(make({ type: 'string', format: 'date-time' })).toBe('2026-01-01T00:00:00Z');
    expect(make({ type: 'string', format: 'email' })).toBe('user@example.com');
    expect(make({ type: 'string', format: 'uri' })).toBe('https://example.com/');
    expect(make({ type: 'string', format: 'uuid' })).toBe('00000000-0000-4000-8000-000000000000');
    expect(make({ type: 'integer', minimum: 5 })).toBe(5);
    expect(make({ type: 'number' })).toBe(1);
    expect(make({ type: 'boolean' })).toBe(true);
    expect(make({ type: 'null' })).toBeNull();
    expect(make({ type: 'array', items: { type: 'integer' } })).toEqual([1]);
    expect(make({})).toBeNull();
    expect(make(true)).toBeNull();
  });

  it('fills the required properties only, merges allOf, takes the first oneOf or anyOf, and ends a recursion in null', () => {
    expect(make({ properties: { a: { type: 'string' }, b: { type: 'boolean' } }, required: ['b'] })).toEqual({ b: true });
    expect(make({ type: 'object' })).toEqual({});
    expect(make({ properties: { 'Stryker was here': { type: 'string' } } })).toStrictEqual({});
    expect(make({ allOf: [{ type: 'array', items: { type: 'integer' } }, { required: ['a'], properties: { a: { const: 1 } } }] })).toStrictEqual({ a: 1 });
    expect(make({ allOf: [{ type: 'object', required: ['a'], properties: { a: { type: 'integer' } } }, { type: 'string' }, { required: ['b'], properties: { b: { const: 2 } } }] })).toEqual({ a: 1, b: 2 });
    expect(make({ oneOf: [{ type: 'boolean' }, { type: 'string' }] })).toBe(true);
    expect(make({ anyOf: [{ type: 'string' }] })).toBe('example');
    expect(make({ oneOf: [], type: 'integer' })).toBe(1);
    const pet = make({ $ref: '#/Pet' }) as Dict;
    let depth = 0;
    for (let node: unknown = pet; node !== null; node = (node as Dict).self) depth += 1;
    expect(depth).toBe(9);
    expect(pet.id).toBe(1);
    expect(Object.keys(pet)).toEqual(['id', 'self']);
  });
});

describe('exampleOf', () => {
  it('reads the holder’s example, its first named example, the schema’s example, and makes one last', () => {
    expect(exampleOf({ example: 0, examples: { a: { value: 1 } } }, { example: 2 }, deref)).toEqual({ value: 0, synthesised: false });
    expect(exampleOf({ examples: { a: { value: 1 }, b: { value: 2 } } }, {}, deref)).toEqual({ value: 1, synthesised: false });
    expect(exampleOf({ examples: { a: { summary: 'none' } } }, { example: 2 }, deref)).toEqual({ value: 2, synthesised: false });
    expect(exampleOf({ examples: [{ value: 9 }] }, { $ref: '#/Name' }, deref)).toEqual({ value: 'Rex', synthesised: false });
    expect(exampleOf({}, { type: 'boolean' }, deref)).toEqual({ value: true, synthesised: true });
    expect(exampleOf({}, true, deref)).toEqual({ value: null, synthesised: true });
    expect(exampleOf({ examples: 'ab' }, { type: 'boolean' }, deref)).toEqual({ value: true, synthesised: true });
  });
});
