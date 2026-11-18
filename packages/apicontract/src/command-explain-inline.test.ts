import { describe, expect, it } from 'vitest';

import { explainInline } from './command-explain-inline.js';
import { RefError } from './core/resolve.js';

/** The resolver's own fixture (core/resolve.test.ts). */
const doc = {
  components: {
    schemas: {
      Pet: { type: 'object', properties: { owner: { $ref: '#/components/schemas/Owner' } } },
      Owner: { type: 'object', properties: { name: { type: 'string' } } },
      Node: { type: 'object', properties: { next: { $ref: '#/components/schemas/Node' } } },
    },
  },
};

describe('explainInline', () => {
  it('inlines references transitively, like core', () => {
    expect(explainInline(doc, { $ref: '#/components/schemas/Pet' })).toEqual({
      value: { type: 'object', properties: { owner: { type: 'object', properties: { name: { type: 'string' } } } } },
      cycles: [],
      external: [],
    });
  });

  it('turns a cycle into a `$comment` marker naming the pointer, and reports it', () => {
    expect(explainInline(doc, { $ref: '#/components/schemas/Node' })).toEqual({
      value: { type: 'object', properties: { next: { $comment: 'cycle: #/components/schemas/Node' } } },
      cycles: ['#/components/schemas/Node'],
      external: [],
    });
  });

  it('marks a cycle inside an array', () => {
    expect(explainInline({ A: { allOf: [{ $ref: '#/A' }] } }, { $ref: '#/A' }).value).toEqual({ allOf: [{ $comment: 'cycle: #/A' }] });
  });

  it('keeps the keywords written beside a cycle reference', () => {
    const value = explainInline({ A: { items: { $ref: '#/A', description: 'again' } } }, { $ref: '#/A' }).value;
    expect(value).toEqual({ items: { description: 'again', $comment: 'cycle: #/A' } });
  });

  it('keeps a reference to another document as `$ref`, and reports it', () => {
    expect(explainInline({}, { items: [{ $ref: 'https://x.test/a.json' }] })).toEqual({
      value: { items: [{ $ref: 'https://x.test/a.json' }] },
      cycles: [],
      external: ['https://x.test/a.json'],
    });
  });

  it('leaves a property named `$ref` alone: it holds a schema', () => {
    expect(explainInline({}, { properties: { $ref: { type: 'string' } } }).value).toEqual({ properties: { $ref: { type: 'string' } } });
  });

  it('passes booleans, scalars and null through', () => {
    expect(explainInline({}, true).value).toBe(true);
    expect(explainInline({}, { const: null, enum: [1, 'a'] }).value).toEqual({ const: null, enum: [1, 'a'] });
  });

  it("throws core's RefError on a reference to nothing", () => {
    expect(() => explainInline({}, { $ref: '#/missing' })).toThrow(RefError);
  });
});

/** Every `$ref` string left in a value. */
const refs = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap((item) => refs(item));
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => (key === '$ref' ? [child as string] : refs(child)));
};
const markers = (value: unknown): string[] => (JSON.stringify(value).match(/cycle: #\/[a-c]/gu) ?? []).map((m) => m.slice('cycle: '.length));

describe('explainInline on every reference graph over three nodes', () => {
  const nodes = ['a', 'b', 'c'];
  const pairs = nodes.flatMap((from) => nodes.map((to) => [from, to] as const));

  it('leaves no local `$ref`, and marks exactly the cycles it reports', () => {
    for (let mask = 0; mask < 2 ** pairs.length; mask++) {
      const edges = pairs.filter((_, at) => (mask & (1 << at)) !== 0);
      const document = Object.fromEntries(
        nodes.map((node) => [node, { properties: Object.fromEntries(edges.filter(([from]) => from === node).map(([, to]) => [to, { $ref: `#/${to}` }])) }]),
      );
      for (const start of nodes) {
        const { value, cycles } = explainInline(document, { $ref: `#/${start}` });
        expect(refs(value)).toEqual([]);
        expect(new Set(markers(value))).toEqual(new Set(cycles));
      }
    }
  });
});
