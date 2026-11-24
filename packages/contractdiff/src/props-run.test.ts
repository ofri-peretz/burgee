import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parse as parseYaml } from 'seniority/yaml';
import { describe, expect, it } from 'vitest';

import { type Contract } from './core/model.js';
import { compareContracts, type Finding } from './diff-contract.js';
import { normalise } from './diff-normalise.js';
import { builtinAdapters } from './inputs.js';
import { payloadJudge, rooted } from './props-judge.js';
import { PROPERTIES, runProps, SUBJECT } from './props-run.js';

const load = (name: string): Contract => {
  const document = parseYaml(readFileSync(fileURLToPath(new URL(`__fixtures__/props/${name}`, import.meta.url)), 'utf8'));
  return (Object.values(builtinAdapters).find((adapter) => adapter.detect(document)) as (typeof builtinAdapters)[keyof typeof builtinAdapters]).read(document);
};

const old = load('shop-old.yaml');
const nu = load('shop-new.yaml');

/** A contract of one operation with one request body. */
const single = (schema: unknown, document: Record<string, unknown> = {}): Contract => ({
  format: 'jsonschema',
  document,
  operations: [{ id: 'op', source: '#', payloads: [{ name: 'body', direction: 'request', schema: schema as Contract['operations'][number]['payloads'][number]['schema'], required: true }] }],
});

describe('runProps on a contract with no bugs', () => {
  it('holds every property, on every payload, at every run, and replays from its seed', () => {
    const report = runProps(nu, { runs: 100, seed: 3, against: old });
    expect(report.counterexamples).toEqual([]);
    for (const property of PROPERTIES) expect(report.tallies[property].checked, property).toBeGreaterThan(0);
    // Two payloads are never sent (a 404 with no body): nothing to draw, nothing skipped.
    expect(report.skipped).toEqual([]);
    expect(report.seed).toBe(3);
    expect(runProps(nu, { runs: 100, seed: 3, against: old })).toEqual(report);
  });

  it('checks soundness only where the classifier calls the payload compatible', () => {
    // Old against new narrows the request and widens the responses: only the unchanged `id` parameter is left.
    const report = runProps(old, { runs: 20, seed: 1, against: nu });
    expect(report.tallies.soundness.checked).toBe(20);
    expect(report.counterexamples).toEqual([]);
  });

  it('asks both questions under `--mode full`, and the server side as well as the caller', () => {
    const backward = runProps(nu, { runs: 10, seed: 1, against: old }).tallies.soundness.checked;
    const full = runProps(nu, { runs: 10, seed: 1, against: nu, mode: 'full' }).tallies.soundness.checked;
    expect(full).toBeGreaterThan(backward);
    expect(runProps(nu, { runs: 10, seed: 1, against: nu, side: 'server' }).counterexamples).toEqual([]);
  });

  it('reports the keywords values were made without, and discards what the validator refuses of them', () => {
    const report = runProps(single({ type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', pattern: '^[0-9]+$' } }), { runs: 50, seed: 1 });
    expect(report.reported).toEqual([
      { keyword: 'pattern', at: ['/items'] },
      { keyword: 'uniqueItems', at: ['/'] },
    ]);
    expect(report.tallies.agreement.discarded).toBeGreaterThan(0);
    expect(report.counterexamples).toEqual([]);
  });

  it('lists a payload with no value it can make, and one whose schema the validator cannot read', () => {
    expect(runProps(single({ type: 'integer', minimum: 2, maximum: 1 }), { runs: 5, seed: 1 }).skipped).toEqual([{ operation: 'op', payload: 'body', reason: expect.stringContaining('no value could be made') as string }]);
    const unread = runProps(single({ type: 'string', format: 7 }), { runs: 5, seed: 1 }).skipped;
    expect(unread).toHaveLength(1);
    expect(unread[0]?.reason).toContain('format');
  });
});

describe('runProps catches a bug planted in the code each property holds to account', () => {
  it('agreement: a validator that accepts what it should refuse', () => {
    const accepting = { validator: () => ({ accepts: () => true, paths: () => [] }) };
    const report = runProps(single({ type: 'object', required: ['a'], properties: { a: { type: 'integer', maximum: 3 } } }), { runs: 50, seed: 1, subject: accepting });
    expect(report.counterexamples).toEqual([expect.objectContaining({ property: 'agreement', operation: 'op', payload: 'body', detail: expect.stringMatching(/broken at .*, and the validator accepted it$/) as string })]);
    expect(runProps(single({ type: 'object', required: ['a'], properties: { a: { type: 'integer', maximum: 3 } } }), { runs: 50, seed: 1 }).counterexamples).toEqual([]);
  });

  it('agreement: a validator that refuses at the wrong place, or refuses what the schema allows', () => {
    const elsewhere = { validator: (schema: unknown, document: unknown, draft: Parameters<typeof payloadJudge>[2]) => {
      const real = payloadJudge(schema, document, draft);
      return { accepts: real.accepts, paths: (value: unknown) => real.paths(value).map(() => '/elsewhere') };
    } };
    const schema = { type: 'object', required: ['a'], properties: { a: { type: 'integer', maximum: 3 } } };
    expect(runProps(single(schema), { runs: 50, seed: 1, subject: elsewhere }).counterexamples[0]?.detail).toMatch(/refused at \/elsewhere instead$/);
    const refusing = { validator: () => ({ accepts: () => false, paths: () => ['/x'] }) };
    const report = runProps(single(schema), { runs: 5, seed: 1, subject: refusing });
    expect(report.counterexamples[0]?.detail).toBe('made from the schema, refused by the validator at /x');
    expect(report.tallies.agreement.failed).toBe(5);
  });

  it('round-trip: an encoder that drops a key', () => {
    const lossy = { encode: (value: unknown) => JSON.stringify(value, (key, item: unknown) => (key === 'b' ? undefined : item)) };
    const report = runProps(single({ type: 'object', required: ['a', 'b'], properties: { a: { type: 'array', items: { type: 'integer' } }, b: { type: 'string' } } }), { runs: 20, seed: 1, subject: lossy });
    // Shrunk: `a` emptied, `b` the shortest string.
    expect(report.counterexamples).toEqual([expect.objectContaining({ property: 'round-trip', value: { a: [], b: '' } })]);
  });

  it('round-trip: a decoder whose output the validator refuses', () => {
    const wrong = { decode: (text: string) => ({ ...(JSON.parse(text) as object), extra: 1 }) };
    const report = runProps(single({ type: 'object', additionalProperties: false, properties: { a: { const: 1 } } }), { runs: 20, seed: 1, subject: wrong });
    expect(report.counterexamples.map((found) => found.property)).toContain('round-trip');
  });

  it('normalise: a rewrite that is not idempotent, and one that changes what is accepted', () => {
    let calls = 0;
    const drifting = { normalise: (schema: unknown) => ({ ...(schema as object), title: String((calls += 1)) }) };
    const drift = runProps(single({ type: 'string' }), { runs: 5, seed: 1, subject: drifting });
    expect(drift.counterexamples).toEqual([expect.objectContaining({ property: 'normalise', value: { type: 'string' }, detail: expect.stringMatching(/^normalising twice gives/) as string })]);
    const widening = { normalise: (schema: unknown) => ({ ...(schema as object), maxLength: 2 }) };
    const changed = runProps(single({ type: 'string', minLength: 1, maxLength: 9 }), { runs: 50, seed: 1, subject: widening });
    expect(changed.counterexamples).toEqual([expect.objectContaining({ property: 'normalise', detail: expect.stringMatching(/^the schema accepts it and its normalised form does not/) as string })]);
    // Shrunk to the shortest string the rewrite refuses: three characters.
    expect([...(changed.counterexamples[0]?.value as string)]).toHaveLength(3);
  });

  it('normalise: a rewrite that makes refused values accepted', () => {
    const opening = { normalise: (schema: unknown) => ({ ...(schema as object), maxLength: 100 }) };
    const report = runProps(single({ type: 'string', maxLength: 2 }), { runs: 50, seed: 1, subject: opening });
    expect(report.counterexamples[0]?.detail).toMatch(/^the schema refuses it and its normalised form does not/);
  });

  it('normalise: skips the meaning check, not the payload, when the normalised schema cannot be read', () => {
    const unreadable = { normalise: () => ({ type: 'string', format: 7 }) };
    const report = runProps(single({ type: 'string' }), { runs: 5, seed: 1, subject: unreadable });
    expect(report.tallies.normalise.checked).toBe(0);
    expect(report.tallies['round-trip'].checked).toBe(5);
  });

  it('soundness: a classifier that calls a breaking change compatible, shown red before the fix and green after', () => {
    const blind = { compare: (a: Contract, b: Contract, options: { mode: 'backward' | 'forward' | 'full'; side: 'caller' | 'server' }) => ({ ...compareContracts(a, b, options), findings: [] }) };
    const red = runProps(old, { runs: 200, seed: 1, against: nu, subject: blind });
    expect(red.counterexamples.map((found) => `${found.operation} ${found.payload}`).sort()).toEqual([
      'getOrder response:200:application/json',
      'placeOrder body:application/json',
      'placeOrder response:201:application/json',
    ]);
    const request = red.counterexamples.find((found) => found.payload === 'body:application/json');
    expect(request?.detail).toMatch(/^called compatible \(backward\), but the old contract sends this and the new one refuses it at \/items\/0\/quantity$/);
    // Shrunk to one line whose quantity is the smallest the old contract allows and the new one refuses.
    expect((request?.value as { items: { quantity: number }[] }).items).toEqual([{ sku: expect.any(String) as string, quantity: 11 }]);
    expect(red.counterexamples.find((found) => found.payload === 'response:201:application/json')?.detail).toMatch(/\(forward\), but the new contract sends this and the old one refuses it/);
    const green = runProps(old, { runs: 200, seed: 1, against: nu });
    expect(green.counterexamples).toEqual([]);
  });

  it('soundness: skips a payload pair a validator cannot read, and an operation on one side only', () => {
    const one = single({ type: 'string', format: 7 });
    expect(runProps(one, { runs: 5, seed: 1, against: one }).tallies.soundness.checked).toBe(0);
    const renamed: Contract = { ...one, operations: [{ ...(one.operations[0] as Contract['operations'][number]), id: 'other' }] };
    expect(runProps(single({ type: 'string' }), { runs: 5, seed: 1, against: renamed }).tallies.soundness.checked).toBe(0);
    const added = single({ type: 'string' });
    const withMore: Contract = { ...added, operations: [{ ...(added.operations[0] as Contract['operations'][number]), payloads: [...(added.operations[0] as Contract['operations'][number]).payloads, { name: 'more', direction: 'request', schema: true, required: false }] }] };
    expect(runProps(withMore, { runs: 5, seed: 1, against: added }).tallies.soundness.checked).toBe(5);
    expect(runProps(single({ type: 'integer', minimum: 2, maximum: 1 }), { runs: 5, seed: 1, against: single({ type: 'integer', minimum: 2, maximum: 1 }) }).tallies.soundness.checked).toBe(0);
  });
});

/** Two operations, each with one request body. */
const twice = (schema: unknown): Contract => {
  const one = single(schema);
  const operation = one.operations[0] as Contract['operations'][number];
  return { ...one, operations: [operation, { ...operation, id: 'op2' }] };
};

/** contractdiff's validator, its issues moved by `move`. */
const moving = (move: (paths: string[]) => string[]) => ({
  validator: (schema: unknown, document: unknown, draft: Parameters<typeof payloadJudge>[2]) => {
    const real = payloadJudge(schema, document, draft);
    return { accepts: real.accepts, paths: (value: unknown) => move(real.paths(value)) };
  },
});

/** Each issue moved to the place around it. */
const parents = (paths: string[]): string[] => paths.map((path) => path.split('/').slice(0, -1).join('/'));

/** A classifier that finds only `findings`. */
const blind = (findings: readonly Partial<Finding>[]) => ({ compare: (a: Contract, b: Contract, options: { mode: 'backward' | 'forward' | 'full'; side: 'caller' | 'server' }) => ({ ...compareContracts(a, b, options), findings: findings as Finding[] }) });

describe('runProps, told apart', () => {
  const schema = { type: 'object', required: ['a'], properties: { a: { type: 'integer', maximum: 3 } } };
  const accepting = { validator: () => ({ accepts: () => true, paths: () => [] }) };

  it('keeps one counterexample per property and payload, and no fewer', () => {
    expect(runProps(twice(schema), { runs: 50, seed: 1, subject: accepting }).counterexamples.map((found) => `${found.property} ${found.operation}`)).toEqual(['agreement op', 'agreement op2']);
    const lossy = { ...accepting, decode: () => 'lost' };
    expect(runProps(single(schema), { runs: 50, seed: 1, subject: lossy }).counterexamples.map((found) => found.property)).toEqual(['agreement', 'round-trip']);
  });

  it('says where a break was made, the root as /, and every place the validator refused instead', () => {
    const root = runProps(single({ type: 'string' }), { runs: 5, seed: 1, subject: accepting });
    expect(root.counterexamples[0]?.detail).toBe('`type` broken at /, and the validator accepted it');
    const inner = runProps(single({ type: 'object', required: ['a'], properties: { a: { type: 'string', maxLength: 1 } }, additionalProperties: false }), { runs: 50, seed: 1, subject: moving(() => ['/x', '/y']) });
    expect(inner.counterexamples[0]?.detail).toMatch(/^`\S+` broken at \/\S*, refused at \/x, \/y instead$/);
    const refusing = { validator: () => ({ accepts: () => false, paths: () => ['/a', '/b'] }) };
    const refused = runProps(single(schema), { runs: 5, seed: 1, subject: refusing });
    expect(refused.counterexamples[0]?.detail).toBe('made from the schema, refused by the validator at /a, /b');
    expect(refused.tallies.agreement).toEqual({ checked: 5, discarded: 0, failed: 5 });
    expect(refused.tallies['round-trip'].checked).toBe(0);
  });

  it('takes an issue about the place around a break, or any issue among several at it, as refusing it there', () => {
    expect(runProps(single(schema), { runs: 50, seed: 1, subject: moving(parents) }).counterexamples).toEqual([]);
    expect(runProps(single(schema), { runs: 50, seed: 1, subject: moving((paths) => [...paths, '/zz']) }).counterexamples).toEqual([]);
  });

  it('round-trip: says what went wrong', () => {
    const report = runProps(single({ type: 'string' }), { runs: 5, seed: 1, subject: { decode: () => 'lost' } });
    expect(report.counterexamples).toEqual([{ property: 'round-trip', operation: 'op', payload: 'body', value: '', detail: 'changed through JSON text and back' }]);
  });

  it('normalise: checks the drawn value itself where nothing can be broken, and shows both forms when they drift', () => {
    const narrowing = { normalise: () => ({ type: 'null' }) };
    const report = runProps(single({}), { runs: 20, seed: 1, subject: narrowing });
    expect(report.counterexamples).toEqual([expect.objectContaining({ property: 'normalise', detail: 'the schema accepts it and its normalised form does not: {"type":"null"}' })]);
    let calls = 0;
    const drifting = { normalise: () => ({ title: String((calls += 1)) }) };
    expect(runProps(single({ type: 'string' }), { runs: 1, seed: 1, subject: drifting }).counterexamples[0]?.detail).toBe('normalising twice gives {"title":"2"}, once gives {"title":"1"}');
  });

  it('lists each reported keyword with its places in order', () => {
    const report = runProps(single({ type: 'object', properties: { b: { type: 'string', pattern: 'x' }, a: { type: 'string', pattern: 'y' } } }), { runs: 5, seed: 1 });
    const pattern = report.reported.find((found) => found.keyword === 'pattern');
    expect(pattern?.at).toEqual([...(pattern?.at ?? [])].sort());
    expect(pattern?.at).toHaveLength(2);
  });
});

/** The payloads soundness fails on, old to new, with a classifier that finds only `findings`. */
const failing = (findings: readonly Partial<Finding>[]): string[] => runProps(old, { runs: 200, seed: 1, against: nu, subject: blind(findings) }).counterexamples.map((found) => `${found.operation} ${found.payload}`).sort();

/** contractdiff's validator, except that it cannot read a schema whose text holds `marker`. */
const unreadable = (marker: string) => ({
  ...blind([]),
  validator: (schema: unknown, document: unknown, draft: Parameters<typeof payloadJudge>[2]) => {
    if (JSON.stringify(rooted(schema, document)).includes(marker)) throw new Error('unreadable');
    return payloadJudge(schema, document, draft);
  },
});

describe('soundness, told apart', () => {
  const all = ['getOrder response:200:application/json', 'placeOrder body:application/json', 'placeOrder response:201:application/json'];

  it('checks only the payloads no finding calls breaking', () => {
    expect(failing([{ operation: 'placeOrder', payload: 'body:application/json', verdict: 'breaking' }])).toEqual(['getOrder response:200:application/json', 'placeOrder response:201:application/json']);
    expect(failing([{ operation: 'placeOrder', verdict: 'breaking' }])).toEqual(['getOrder response:200:application/json']);
    expect(failing([{ operation: 'placeOrder', payload: 'body:application/json', verdict: 'non-breaking' }])).toEqual(all);
    expect(failing([{ operation: 'elsewhere', verdict: 'breaking' }])).toEqual(all);
  });

  it('names every place the receiver refused', () => {
    const report = runProps(old, { runs: 200, seed: 1, against: nu, subject: { ...blind([]), ...moving((paths) => [...paths, '/zz']) } });
    expect(report.counterexamples.find((found) => found.payload === 'body:application/json')?.detail).toMatch(/refuses it at \/items\/0\/quantity, \/zz$/);
  });

  it('skips a pair when either side cannot be read', () => {
    expect(() => runProps(old, { runs: 20, seed: 1, against: nu, subject: unreadable('"maximum":20') })).not.toThrow();
    expect(() => runProps(nu, { runs: 20, seed: 1, against: old, subject: unreadable('"maximum":20') })).not.toThrow();
  });
});

describe('the pieces the runner is built from', () => {
  it("is contractdiff's own code unless a test plants another", () => {
    expect(SUBJECT.normalise).toBe(normalise);
    expect(SUBJECT.compare).toBe(compareContracts);
    expect(SUBJECT.decode(SUBJECT.encode({ a: [1] }))).toEqual({ a: [1] });
  });
});
