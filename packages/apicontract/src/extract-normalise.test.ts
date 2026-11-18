import { describe, expect, it } from 'vitest';

import { inline, normalise, stable } from './extract-normalise.js';

describe('stable', () => {
  it('prints equal data as equal text, whatever the key order, at every depth', () => {
    expect(stable({ b: 1, a: { d: [{ y: 1, x: 2 }], c: 3 } })).toBe('{"a":{"c":3,"d":[{"x":2,"y":1}]},"b":1}');
    expect(stable({ b: 1, a: 2 })).toBe(stable({ a: 2, b: 1 }));
    expect(stable('x')).toBe('"x"');
  });
});

describe('normalise', () => {
  it('sorts keys, so two orders of one schema print the same bytes', () => {
    const one = normalise({ type: 'object', properties: { b: { type: 'string' }, a: { type: 'number' } } });
    const two = normalise({ properties: { a: { type: 'number' }, b: { type: 'string' } }, type: 'object' });
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    expect(Object.keys(one as object)).toEqual(['properties', 'type']);
  });

  it('drops every annotation that does not change what is valid', () => {
    const schema = { title: 'T', description: 'D', summary: 'S', examples: [1], example: 1, $comment: 'C', type: 'number', minimum: 0 };
    expect(normalise(schema)).toEqual({ type: 'number', minimum: 0 });
  });

  it('keeps them with keepDocs', () => {
    const schema = { title: 'T', description: 'D', type: 'number' };
    expect(normalise(schema, { keepDocs: true })).toEqual(schema);
    expect(normalise(schema, { keepDocs: false })).toEqual({ type: 'number' });
  });

  it('drops annotations at every depth, and inside arrays', () => {
    expect(normalise({ anyOf: [{ type: 'string', description: 'x' }], items: { title: 'I', type: 'number' } })).toEqual({ anyOf: [{ type: 'string' }], items: { type: 'number' } });
  });

  it('reads the keys of a map of names as names: a property called description is kept', () => {
    const schema = { type: 'object', properties: { description: { type: 'string', description: 'what it is' }, title: { type: 'string' } } };
    expect(normalise(schema)).toEqual({ type: 'object', properties: { description: { type: 'string' }, title: { type: 'string' } } });
  });

  it('sorts the names of a map of names too', () => {
    expect(Object.keys((normalise({ $defs: { b: {}, a: {} } }) as { $defs: object }).$defs)).toEqual(['a', 'b']);
  });

  it('does not take a map-of-names key holding something else for a map', () => {
    expect(normalise({ content: ['description'], headers: 'x' })).toEqual({ content: ['description'], headers: 'x' });
  });

  it.each([
    ['patternProperties'],
    ['$defs'],
    ['definitions'],
    ['dependentSchemas'],
    ['dependentRequired'],
    ['schemas'],
    ['paths'],
    ['webhooks'],
    ['responses'],
    ['content'],
    ['headers'],
    ['requestBodies'],
    ['securitySchemes'],
    ['links'],
    ['callbacks'],
    ['pathItems'],
    ['encoding'],
    ['variables'],
    ['mapping'],
  ])('keeps a name called title under %s', (key) => {
    expect(normalise({ [key]: { title: 1 } })).toEqual({ [key]: { title: 1 } });
  });

  it('keeps data whole: const, enum and default are values, not schemas', () => {
    const schema = { const: { title: 'kept', b: 1, a: 2 }, enum: [{ description: 'kept' }], default: { title: 'kept' } };
    const out = normalise(schema) as Record<string, unknown>;
    expect(out).toEqual(schema);
    expect(Object.keys(out.const as object)).toEqual(['a', 'b', 'title']);
  });

  it('canonicalises a type list: sorted, without repeats, one name as itself', () => {
    expect(normalise({ type: ['string', 'null', 'string'] })).toEqual({ type: ['null', 'string'] });
    expect(normalise({ type: ['integer'] })).toEqual({ type: 'integer' });
    expect(normalise({ type: 'string' })).toEqual({ type: 'string' });
  });

  it('sorts and dedupes required, which is a set; a boolean required stays as it is', () => {
    expect(normalise({ required: ['b', 'a', 'b'] })).toEqual({ required: ['a', 'b'] });
    expect(normalise({ required: true })).toEqual({ required: true });
  });

  it('sorts parameters, which OpenAPI reads as a set, by their normal form', () => {
    const one = normalise({ parameters: [{ name: 'b', in: 'query', description: 'x' }, { name: 'a', in: 'query' }] });
    expect(one).toEqual({ parameters: [{ in: 'query', name: 'a' }, { in: 'query', name: 'b' }] });
    expect(normalise({ parameters: [{ name: 'a', in: 'query' }, { name: 'b', in: 'query' }] })).toEqual(one);
    expect(normalise({ parameters: 'x' })).toEqual({ parameters: 'x' });
  });

  it('keeps the order of any other list: allOf is not reordered', () => {
    expect(normalise({ allOf: [{ type: 'string' }, { minLength: 1 }] })).toEqual({ allOf: [{ type: 'string' }, { minLength: 1 }] });
  });

  it('passes scalars and arrays of scalars through', () => {
    expect(normalise(3)).toBe(3);
    expect(normalise(null)).toBeNull();
    expect(normalise([1, 'a'])).toEqual([1, 'a']);
  });
});

describe('inline', () => {
  it('replaces a local $ref with what it points to', () => {
    const document = { components: { schemas: { Pet: { type: 'object' } } }, schema: { $ref: '#/components/schemas/Pet' } };
    expect(inline(document)).toEqual({ components: { schemas: { Pet: { type: 'object' } } }, schema: { type: 'object' } });
  });

  it('follows a reference to a reference, and keeps what sits beside a $ref', () => {
    const document = { $defs: { A: { $ref: '#/$defs/B' }, B: { type: 'string' } }, x: { $ref: '#/$defs/A', minLength: 1 } };
    expect((inline(document) as { x: unknown }).x).toEqual({ type: 'string', minLength: 1 });
  });

  it('keeps a reference back into a schema it is inside, so a recursive schema stays finite', () => {
    const document = { $defs: { Tree: { type: 'object', properties: { kids: { type: 'array', items: { $ref: '#/$defs/Tree' } } } } }, root: { $ref: '#/$defs/Tree' } };
    expect((inline(document) as { root: unknown }).root).toEqual({ type: 'object', properties: { kids: { type: 'array', items: { $ref: '#/$defs/Tree' } } } });
  });

  it('decodes ~1 and ~0 in a pointer', () => {
    const document = { paths: { '/a~b': { x: 1 } }, ref: { $ref: '#/paths/~1a~0b' } };
    expect((inline(document) as { ref: unknown }).ref).toEqual({ x: 1 });
  });

  it('decodes ~01 as ~1, not as /', () => {
    const document = { '~1': { x: 1 }, '/': { x: 2 }, ref: { $ref: '#/~01' } };
    expect((inline(document) as { ref: unknown }).ref).toEqual({ x: 1 });
  });

  it('follows only a reference that starts with #/', () => {
    const document = { 'her.json#': { x: { a: 1 } }, ref: { $ref: 'other.json#/x' } };
    expect(inline(document)).toEqual(document);
  });

  it('leaves a reference that points nowhere, outside the document, or through a scalar, as it is', () => {
    const document = { a: 1, refs: [{ $ref: '#/missing' }, { $ref: 'other.json#/x' }, { $ref: '#/a/b' }, { $ref: 3 }, { $ref: '#/toString' }] };
    expect(inline(document)).toEqual(document);
  });
});
