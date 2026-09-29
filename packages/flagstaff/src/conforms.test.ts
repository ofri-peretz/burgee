/**
 * The family's one JSON Schema walker, graded on the keywords flagstaff's own fragment does
 * not use. `plugin.schema.json` has no `const`, no `maximum`, no closed object and no `$ref`
 * that misses — but the whole family schema does, and `scripts/plugin-schema-agreement.test.ts`
 * and `scripts/program-schema.test.ts` walk it with this same `check`. A walker that silently
 * accepted what those keywords refuse would make both locks pass on documents they exist to
 * reject, so each keyword is asserted here to refuse, and to say where.
 */
import { describe, expect, it } from 'vitest';

import { check, type Root } from './conforms.js';

describe('check · the keywords the family schema uses beyond flagstaff’s own', () => {
  it('const: the one value it names, and a refusal that shows both', () => {
    expect(check(1, { const: 1 }, 'v')).toBeUndefined();
    expect(check(2, { const: 1 }, 'v')).toBe('v: expected 1, got 2');
  });

  it('maximum: at the bound is fine, past it is refused', () => {
    expect(check(5, { type: 'integer', maximum: 5 }, 'n')).toBeUndefined();
    expect(check(6, { type: 'integer', maximum: 5 }, 'n')).toBe('n: must be at most 5');
  });

  it('an array with no `items` schema takes any items, and still counts them', () => {
    expect(check([1, 'two', { three: 3 }], { type: 'array' }, 'a')).toBeUndefined();
    expect(check([], { type: 'array', minItems: 1 }, 'a')).toBe('a: needs at least 1 item(s)');
  });

  it('additionalProperties: false refuses an unknown key by name; an open object keeps it', () => {
    const closed = { type: 'object', properties: { name: { type: 'string' } }, additionalProperties: false };
    expect(check({ name: 'x' }, closed, 'p')).toBeUndefined();
    expect(check({ name: 'x', surprise: true }, closed, 'p')).toBe('p.surprise: not allowed');
    expect(check({ name: 'x', surprise: true }, { ...closed, additionalProperties: true }, 'p')).toBeUndefined();
  });

  it('a $ref to a definition the document does not have is a refusal, not a pass', () => {
    const root: Root = { $defs: { known: { type: 'string' } }, $ref: '#/$defs/missing' };
    expect(check('x', root, 'r')).toBe('r: unknown $ref #/$defs/missing');
    expect(check('x', { $ref: '#/$defs/missing' }, 'r')).toBe('r: unknown $ref #/$defs/missing');
    expect(check('x', { ...root, $ref: '#/$defs/known' }, 'r')).toBeUndefined();
  });

  it('type number admits an integer, and nothing that is not a number', () => {
    expect(check(3, { type: 'number' }, 'n')).toBeUndefined();
    expect(check(3.5, { type: 'number' }, 'n')).toBeUndefined();
    expect(check('3', { type: 'number' }, 'n')).toBe('n: expected number, got string');
    expect(check(3.5, { type: 'integer' }, 'n')).toBe('n: expected integer, got number');
  });
});
