import { describe, expect, it } from 'vitest';

import { exampleOf, seedOf, synth } from './plugin-msw-synth.js';

describe('seedOf', () => {
  it('is FNV-1a over the code points', () => {
    expect(seedOf('')).toBe(2_166_136_261);
    expect(seedOf('a')).toBe(3_826_002_220);
    expect(seedOf('getPet 200')).toBe(seedOf('getPet 200'));
    expect(seedOf('getPet 200')).not.toBe(seedOf('getPet 404'));
  });
});

describe('exampleOf', () => {
  it('takes `example`, then `examples[0]`', () => {
    expect(exampleOf({ example: 1, examples: [2] })).toEqual({ value: 1 });
    expect(exampleOf({ examples: [2, 3] })).toEqual({ value: 2 });
    expect(exampleOf({ examples: [] })).toBeUndefined();
    expect(exampleOf({ examples: { a: 1 } })).toBeUndefined();
    expect(exampleOf({ example: null })).toEqual({ value: null });
  });
});

describe('synth', () => {
  it('is the same for the same seed, and differs with it', () => {
    const schema = { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'string' }, c: { type: 'boolean' } } };
    expect(synth(schema, 7)).toEqual(synth(schema, 7));
    expect(synth(schema, 1)).toEqual({ a: 38, b: 'golf', c: false });
    expect(synth(schema, 2)).toEqual({ a: 76, b: 'bravo', c: false });
  });

  it('honours const, enum, a nested example and the first branch of a choice', () => {
    expect(synth({ const: 0, type: 'string' }, 1)).toBe(0);
    expect(synth({ enum: ['a', 'b', 'c'] }, 1)).toBe('c');
    expect(synth({ enum: ['a', 'b', 'c'] }, 2)).toBe('b');
    expect(synth({ enum: [], type: 'boolean' }, 1)).toBe(true);
    expect(synth({ type: 'boolean' }, 3)).toBe(false);
    expect(synth({ type: 'string', example: 'x' }, 1)).toBe('x');
    expect(synth({ oneOf: [{ const: 1 }, { const: 2 }] }, 1)).toBe(1);
    expect(synth({ anyOf: [{ const: 3 }] }, 1)).toBe(3);
    expect(synth({ oneOf: [] }, 1)).toBeNull();
  });

  it('merges the parts of allOf when each is an object, and takes the first otherwise', () => {
    expect(synth({ allOf: [{ properties: { a: { const: 1 } } }, { properties: { b: { const: 2 } } }] }, 1)).toEqual({ a: 1, b: 2 });
    expect(synth({ allOf: [{ const: 'x' }, { properties: {} }] }, 1)).toBe('x');
  });

  it('honours format, minLength and maxLength for a string', () => {
    expect(synth({ type: 'string', format: 'date-time' }, 1)).toBe('2024-01-15T09:30:00Z');
    expect(synth({ type: 'string', format: 'email' }, 1)).toBe('user@example.com');
    expect(synth({ type: 'string', format: 'uuid' }, 1)).toBe('3f2b6c1e-8d4a-4c7e-9b1f-5a6d7e8f9a0b');
    expect(synth({ type: 'string', format: 'toString' }, 1)).toBe('golf');
    expect(synth({ type: 'string', minLength: 10 }, 1)).toBe('golfgolfgo');
    expect(synth({ type: 'string', maxLength: 3 }, 1)).toBe('gol');
    expect(synth({ type: 'string', minLength: 2 }, 1)).toBe('golf');
  });

  it('keeps a number inside its bounds, inclusive or exclusive', () => {
    expect(synth({ type: 'integer', minimum: 5, maximum: 5 }, 1)).toBe(5);
    expect(synth({ type: 'integer', exclusiveMinimum: 5, exclusiveMaximum: 7 }, 1)).toBe(6);
    expect(synth({ type: 'number', exclusiveMinimum: 0.5, maximum: 1 }, 1)).toBe(1);
    expect(synth({ type: 'integer', minimum: 10 }, 1)).toBe(48);
    expect(synth({ type: 'integer', exclusiveMaximum: 3 }, 1)).toBe(2);
    expect(synth({ type: 'integer', minimum: '3', maximum: '4' }, 1)).toBe(38);
  });

  it('builds arrays of at least one item, honouring minItems', () => {
    expect(synth({ type: 'array', items: { type: 'integer', minimum: 1, maximum: 9 } }, 1)).toEqual([9]);
    expect(synth({ type: 'array', minItems: 3, items: { type: 'integer', minimum: 1, maximum: 9 } }, 1)).toEqual([9, 7, 7]);
    expect(synth({ type: 'array', minItems: 0, items: { const: 1 } }, 1)).toEqual([1]);
    expect(synth({ items: { const: 1 } }, 1)).toEqual([1]);
  });

  it('reads the type from a list, and from properties or items when it is missing', () => {
    expect(synth({ type: ['null', 'boolean'] }, 1)).toBe(true);
    expect(synth({ type: ['null'] }, 1)).toBeNull();
    expect(synth({ type: 'null' }, 1)).toBeNull();
    expect(synth({ properties: { a: { const: 1 } } }, 1)).toEqual({ a: 1 });
    expect(synth({ type: 'object' }, 1)).toEqual({});
    expect(synth({ type: 'object', properties: [] }, 1)).toEqual({});
    expect(synth({}, 1)).toBeNull();
    expect(synth(true, 1)).toBeNull();
  });

  it('follows $ref against the root, and stops at a reference back into a schema being built', () => {
    const root = {
      $defs: {
        Node: { type: 'object', properties: { name: { const: 'n' }, next: { $ref: '#/$defs/Node' }, children: { type: 'array', items: { $ref: '#/$defs/Node' } } } },
      },
    };
    expect(synth({ $ref: '#/$defs/Node' }, 1, root)).toEqual({ name: 'n', children: [] });
    expect(synth({ type: 'array', items: { $ref: '#/$defs/Node' } }, 1, root)).toEqual([{ name: 'n', children: [] }]);
    expect(synth({ $ref: '#' }, 1)).toBeNull();
  });
});
