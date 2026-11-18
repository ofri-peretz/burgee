import { fromJsonSchema, standardJson } from 'validator/json-schema';
import { describe, expect, it } from 'vitest';

import { corpus } from './__fixtures__/extract/corpus.js';
import { Owner, Pet } from './__fixtures__/extract/validator-schemas.js';
import { differences, roundtrip } from './extract-roundtrip.js';
import { createHost } from './host.js';
import { builtinAdapters } from './inputs.js';
import { extractSchemas } from './plugin-extract-standard-schema.js';

type Spec = { readonly $defs: Readonly<Record<string, object>> };

/**
 * The generator half, until the `json-schema` and `validator` targets land (PLAN.md 6.4): each
 * `$defs` entry becomes a validator schema made Standard JSON Schema, as the `validator` target's
 * module would export it, without writing the module to disk.
 */
const generate = (spec: unknown): Record<string, unknown> =>
  Object.fromEntries(Object.entries((spec as Spec).$defs).map(([name, schema]) => [name, standardJson(fromJsonSchema({ ...schema, $defs: (spec as Spec).$defs }).schema)]));

/** The extractor half: R3 on the module the generator made. */
const extract = (module: Record<string, unknown>): unknown => extractSchemas(module, {});

describe('the round trip through the validator and the standard-schema extractor (R-RT)', () => {
  it('gives back every Standard Schema fixture of the validator, equal', async () => {
    const spec = extractSchemas({ Owner, Pet }, {});
    const result = await roundtrip(spec, generate, extract);
    expect(result.diff).toEqual([]);
    expect(result.equal).toBe(true);
  });

  /**
   * B1 on the fixture corpus, read 2026-11-18. The first pass shows what the validator writes
   * differently from what it reads (a format as its pattern, an enum as `anyOf` of `const`, a
   * `null` type as `const: null`); the second shows whether that is a fixed point. A tuple is not:
   * each pass wraps it once more, which is the validator's to fix (its own lane).
   */
  it.each([
    ['scalars', false, true],
    ['objects', false, true],
    ['collections', false, false],
    ['choices', false, true],
    ['formats', false, true],
  ])('reads %s: equal on the first pass %s, a fixed point after it %s', async (name, first, fixed) => {
    const once = await roundtrip(corpus[name], generate, extract);
    expect(once.equal).toBe(first);
    expect((await roundtrip(once.extracted, generate, extract)).equal).toBe(fixed);
  });

  /**
   * The same corpus classified by `ac-diff`: every rewrite the validator makes validates the same
   * values (`type: null` as `const: null`, an enum as `anyOf` of `const`, a format as its pattern, a
   * tuple as `anyOf` of its lengths), so none is a break. Read 2026-11-18: 1 / 5 before
   * `diff-normalise.ts`, 5 / 5 after (gap A-20261118-diff-false-breaking-equivalent-rewrites).
   */
  it.each([
    ['scalars', 'non-breaking'],
    ['objects', 'non-breaking'],
    ['collections', 'non-breaking'],
    ['choices', 'non-breaking'],
    ['formats', 'non-breaking'],
  ])('classifies the round trip of %s as %s', async (name, verdict) => {
    const host = createHost();
    host.register({ name: 'apicontract', adapters: builtinAdapters });
    const result = await roundtrip(corpus[name], generate, extract, { read: host.read });
    expect(result.comparison?.verdict).toBe(verdict);
  });

  it('classifies nothing without a reader', async () => {
    expect(await roundtrip({}, () => 0, () => ({}))).not.toHaveProperty('comparison');
  });

  it('classifies what the extractor returned, not its comparison form', async () => {
    const read: unknown[] = [];
    await roundtrip({ a: 1 }, () => 0, () => ({ a: 1, title: 'kept' }), { read: (document) => (read.push(document), { format: 'x', document, operations: [] }) });
    expect(read).toEqual([{ a: 1 }, { a: 1, title: 'kept' }]);
  });

  it('says where a round trip lost something, added something, or changed it', async () => {
    const spec = { $defs: { A: { type: 'string', minLength: 1 }, B: { type: 'number' } } };
    const result = await roundtrip(spec, () => 0, () => ({ $defs: { A: { type: 'string', maxLength: 2 }, B: { type: 'integer' } } }));
    expect(result.equal).toBe(false);
    expect(result.diff).toEqual([
      { pointer: '/$defs/A/maxLength', problem: 'unexpected', extracted: 2 },
      { pointer: '/$defs/A/minLength', problem: 'missing', spec: 1 },
      { pointer: '/$defs/B/type', problem: 'different', spec: 'number', extracted: 'integer' },
    ]);
  });

  it('compares in comparison form: prose and key order are not differences, unless the docs are kept', async () => {
    const spec = { b: 1, a: { type: 'string', description: 'x' } };
    const back = { a: { type: 'string' }, b: 1 };
    expect((await roundtrip(spec, (s) => s, () => back)).equal).toBe(true);
    expect((await roundtrip(spec, (s) => s, () => back, { keepDocs: true })).diff).toEqual([{ pointer: '/a/description', problem: 'missing', spec: 'x' }]);
  });

  it('awaits either half, and hands the generated value to the extractor', async () => {
    const seen: unknown[] = [];
    const result = await roundtrip(
      { a: 1 },
      async (spec) => Promise.resolve({ spec }),
      async (generated) => {
        seen.push(generated);
        return Promise.resolve({ a: 1 });
      },
    );
    expect(seen).toEqual([{ spec: { a: 1 } }]);
    expect(result).toEqual({ equal: true, diff: [], extracted: { a: 1 } });
  });
});

describe('differences', () => {
  it('walks arrays of one length item by item, and compares arrays of two lengths whole', () => {
    expect(differences([1, { a: 2 }], [1, { a: 3 }])).toEqual([{ pointer: '/1/a', problem: 'different', spec: 2, extracted: 3 }]);
    expect(differences([1], [1, 2])).toEqual([{ pointer: '', problem: 'different', spec: [1], extracted: [1, 2] }]);
  });

  it('compares an array with a string of its length as values, not item by item', () => {
    expect(differences([1], 'x')).toEqual([{ pointer: '', problem: 'different', spec: [1], extracted: 'x' }]);
    expect(differences('x', [1])).toEqual([{ pointer: '', problem: 'different', spec: 'x', extracted: [1] }]);
  });

  it('compares an object with an array, or a scalar, as values', () => {
    expect(differences({}, [])).toEqual([{ pointer: '', problem: 'different', spec: {}, extracted: [] }]);
    expect(differences({ a: 1 }, { a: 1 })).toEqual([]);
    expect(differences('x', 'x')).toEqual([]);
  });

  it('escapes the keys in a pointer, and does not take an inherited name for a key', () => {
    expect(differences({ 'a/b': 1 }, {})).toEqual([{ pointer: '/a~1b', problem: 'missing', spec: 1 }]);
    expect(differences({}, { toString: 1 })).toEqual([{ pointer: '/toString', problem: 'unexpected', extracted: 1 }]);
    expect(differences({ toString: 1 }, {})).toEqual([{ pointer: '/toString', problem: 'missing', spec: 1 }]);
  });
});
