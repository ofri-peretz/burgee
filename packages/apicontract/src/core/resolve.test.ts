import { describe, expect, it } from 'vitest';

import { DIRECTIONS, inline, pointerGet, RefError } from './index.js';

const doc = {
  components: {
    schemas: {
      Pet: { type: 'object', properties: { owner: { $ref: '#/components/schemas/Owner' } } },
      Owner: { type: 'object', properties: { name: { type: 'string' } } },
      Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
      'a/b~c': { const: 1 },
      list: [{ const: 'zero' }],
    },
  },
  nothing: null,
};

describe('pointerGet', () => {
  it('returns the whole document for `#`', () => {
    expect(pointerGet(doc, '#')).toBe(doc);
  });

  it('follows a pointer through objects and arrays', () => {
    expect(pointerGet(doc, '#/components/schemas/Owner')).toBe(doc.components.schemas.Owner);
    expect(pointerGet(doc, '#/components/schemas/list/0')).toEqual({ const: 'zero' });
  });

  it('unescapes ~1, ~0 and percent-encoding, in that order of layers', () => {
    expect(pointerGet(doc, '#/components/schemas/a~1b~0c')).toEqual({ const: 1 });
    expect(pointerGet(doc, '#/components/schemas/a~1b%7E0c')).toEqual({ const: 1 });
  });

  it.each([
    ['other.yaml#/a', 'outside this document', 'fix: bundle the document first, or use a `#/…` reference'],
    ['#components', 'starts with `/`', 'fix: write `#/components`'],
    ['#/components/missing', 'nothing is at `missing`', 'fix: point it at a value the document defines'],
    ['#/components/schemas/Owner/type/x', 'nothing is at `x`', 'fix: point it at a value the document defines'],
    // A string has its own `length`, and `null` has no members at all: neither is a place to look.
    ['#/components/schemas/Owner/type/length', 'nothing is at `length`', 'fix: point it at a value the document defines'],
    ['#/nothing/here', 'nothing is at `here`', 'fix: point it at a value the document defines'],
    ['#/%E0%A4%A', 'not a valid URI fragment', 'fix: percent-encode the reference correctly'],
  ])('refuses %s with a fix line', (ref, reason, fix) => {
    const attempt = (): unknown => pointerGet(doc, ref);
    expect(attempt).toThrow(RefError);
    expect(attempt).toThrow(reason);
    expect(attempt).toThrow(`. ${fix}`);
  });

  it('does not read inherited members', () => {
    expect(() => pointerGet({}, '#/toString')).toThrow(RefError);
  });

  it('names the reference and itself on the error', () => {
    expect.assertions(2);
    try {
      pointerGet(doc, '#/nope');
    } catch (error) {
      expect((error as RefError).ref).toBe('#/nope');
      expect((error as RefError).name).toBe('RefError');
    }
  });
});

describe('inline', () => {
  it('replaces a reference with its target, transitively', () => {
    const result = inline(doc, { $ref: '#/components/schemas/Pet' });
    expect(result).toEqual({
      value: { type: 'object', properties: { owner: { type: 'object', properties: { name: { type: 'string' } } } } },
      cycles: [],
      external: [],
    });
  });

  it('keeps a cycle as a reference and reports it once', () => {
    const result = inline(doc, { anyOf: [{ $ref: '#/components/schemas/Node' }, { $ref: '#/components/schemas/Node' }] });
    const node = { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } };
    expect(result).toEqual({ value: { anyOf: [node, node] }, cycles: ['#/components/schemas/Node'], external: [] });
  });

  it('inlines the same reference on one path and keeps it on another (per occurrence)', () => {
    const graph = { a: { x: { $ref: '#/b' } }, b: { y: { $ref: '#/a' }, z: 1 } };
    // From a: a → b is inlined, then b → a closes the cycle and is kept.
    expect(inline(graph, { $ref: '#/a' }).value).toEqual({ x: { y: { $ref: '#/a' }, z: 1 } });
    // From b: the same b → a edge is now the one that is inlined.
    expect(inline(graph, { $ref: '#/b' }).value).toEqual({ y: { x: { $ref: '#/b' } }, z: 1 });
  });

  it('keeps a reference to another document and reports it', () => {
    const result = inline(doc, { items: { $ref: 'common.yaml#/Id', description: 'an id' } });
    expect(result.value).toEqual({ items: { description: 'an id', $ref: 'common.yaml#/Id' } });
    expect(result.external).toEqual(['common.yaml#/Id']);
  });

  it('moves the target under allOf when keywords sit beside the reference', () => {
    const owner = doc.components.schemas.Owner;
    expect(inline(doc, { $ref: '#/components/schemas/Owner', description: 'the owner' }).value).toEqual({
      description: 'the owner',
      allOf: [owner],
    });
    expect(inline(doc, { $ref: '#/components/schemas/Owner', allOf: [{ required: ['name'] }] }).value).toEqual({
      allOf: [owner, { required: ['name'] }],
    });
  });

  it('keeps the keywords beside a cycle reference', () => {
    const graph = { a: { again: { $ref: '#/a', description: 'self' } } };
    expect(inline(graph, { $ref: '#/a' }).value).toEqual({ again: { description: 'self', $ref: '#/a' } });
  });

  it('treats a property named $ref as a schema, not a reference', () => {
    const schema = { properties: { $ref: { type: 'string' } } };
    expect(inline(doc, schema).value).toEqual(schema);
  });

  it('copies scalars, booleans and null through and never returns the input object', () => {
    const schema = { a: true, b: null, c: 1, d: ['x'] };
    const result = inline(doc, schema);
    expect(result.value).toEqual(schema);
    expect(result.value).not.toBe(schema);
  });

  it('fails on a reference to nothing', () => {
    expect(() => inline(doc, { $ref: '#/components/schemas/Ghost' })).toThrow(RefError);
  });
});

// adapter.qnt's `safety`, on every reference graph over four nodes (2^16 of them).
describe('inline on every reference graph over four nodes', () => {
  const NODES = ['A', 'B', 'C', 'D'];
  const EDGES = NODES.length * NODES.length;

  const leftover = (value: unknown, found: string[] = []): string[] => {
    if (Array.isArray(value)) for (const item of value) leftover(item, found);
    else if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        if (key === '$ref') found.push(child as string);
        else leftover(child, found);
      }
    }
    return found;
  };

  const depth = (value: unknown): number =>
    Array.isArray(value) ? Math.max(0, ...value.map(depth)) + 1 : 0;

  it('finishes, is never deeper than the node count, and leaves only the cycles it reports', () => {
    for (let mask = 0; mask < 2 ** EDGES; mask++) {
      const graph = Object.fromEntries(
        NODES.map((from, row) => [
          from,
          NODES.filter((_, column) => (mask >> (row * NODES.length + column)) & 1).map((to) => ({ $ref: `#/${to}` })),
        ]),
      );
      const result = inline(graph, { $ref: '#/A' });
      const kept = new Set(leftover(result.value));
      if (depth(result.value) > NODES.length || kept.size !== result.cycles.length || !result.cycles.every((ref) => kept.has(ref))) {
        throw new Error(`graph ${mask.toString(2)} broke the model's safety`);
      }
    }
  });
});

describe('the model', () => {
  it('names every direction a payload can travel in', () => {
    expect(DIRECTIONS).toEqual(['request', 'response', 'publish', 'subscribe', 'tool-call', 'tool-result', 'argv']);
  });
});
