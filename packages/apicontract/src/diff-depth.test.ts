/**
 * contractdiff-compat-depth R4 (`x-frozen`) and R2 (`dangerous`): the classifier's two refinements,
 * from one schema up to the command's exit code.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { diff, toSarif } from './command-diff.js';
import { type Contract, DIRECTIONS, type Direction, type Operation, type Payload } from './core/model.js';
import { isDangerous, refine, type Verdict } from './diff-classify.js';
import { compareContracts, type Finding } from './diff-contract.js';
import { compareSchemas, isFrozen } from './diff-schema.js';

const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();
const makeDir = scratchDirs();

const payload = (name: string, direction: Direction, schema: Payload['schema']): Payload => ({ name, direction, schema, required: true });
const op = (payloads: Payload[], source = '#/paths/~1a/get'): Operation => ({ id: 'o', source, payloads });
const contract = (operations: Operation[], document: unknown = {}): Contract => ({ format: 'openapi', document, operations });
const rows = (findings: readonly Finding[]) => findings.map((f) => [f.verdict, f.id, f.pointer]);
const response = (schema: Payload['schema']) => [payload('response:200:application/json', 'response', schema)];
const request = (schema: Payload['schema']) => [payload('body:application/json', 'request', schema)];

const SERVER_SENDS: readonly Direction[] = ['response', 'publish', 'tool-result'];
const SERVER_RECEIVES: readonly Direction[] = ['request', 'subscribe', 'tool-call', 'argv'];

describe('x-frozen on a schema (R4)', () => {
  it('marks every change under a schema the old contract froze, and keeps what each change does', () => {
    const old = { type: 'object', properties: { a: { type: 'string', maxLength: 5, 'x-frozen': true }, b: { type: 'string' } } };
    const nu = { type: 'object', properties: { a: { type: 'string', maxLength: 10, 'x-frozen': true }, b: { type: 'string', maxLength: 3 } } };
    expect(compareSchemas(old, nu, 'request')).toStrictEqual([
      { rule: 'maxLength-increased', pointer: '/properties/a/maxLength', before: 5, after: 10, effect: 'widens', frozen: true },
      { rule: 'maxLength-set', pointer: '/properties/b/maxLength', before: undefined, after: 3, effect: 'narrows' },
    ]);
  });

  it('marks a property added under a frozen object, and the mark taken off', () => {
    const old = { type: 'object', 'x-frozen': true };
    const nu = { type: 'object', properties: { c: { type: 'string' } } };
    expect(compareSchemas(old, nu, 'response')).toStrictEqual([
      { rule: 'frozen-unset', pointer: '/x-frozen', before: true, after: undefined, effect: 'neutral', frozen: true },
      { rule: 'property-added', pointer: '/properties/c', before: undefined, after: { type: 'string' }, effect: 'neutral', frozen: true },
    ]);
  });

  it('says what the mark was turned into', () => {
    expect(compareSchemas({ type: 'string', 'x-frozen': true }, { type: 'string', 'x-frozen': false }, 'request')).toStrictEqual([
      { rule: 'frozen-unset', pointer: '/x-frozen', before: true, after: false, effect: 'neutral', frozen: true },
    ]);
  });

  it('reads the mark through a reference, and only on the old side, and only as true', () => {
    const documents = { old: { A: { type: 'string', 'x-frozen': true } }, new: { A: { type: 'string', format: 'email', 'x-frozen': true } } };
    expect(compareSchemas({ $ref: '#/A' }, { $ref: '#/A' }, 'request', documents).map((change) => change.frozen)).toStrictEqual([true]);
    expect(compareSchemas({ type: 'string' }, { type: 'string', maxLength: 1, 'x-frozen': true }, 'request')[0]).not.toHaveProperty('frozen');
    expect(compareSchemas({ type: 'string', 'x-frozen': 'yes' }, { type: 'string', maxLength: 1 }, 'request')).toStrictEqual([
      { rule: 'maxLength-set', pointer: '/maxLength', before: undefined, after: 1, effect: 'narrows' },
    ]);
    expect(compareSchemas({ type: 'string', 'x-frozen': true }, false, 'request')).toStrictEqual([
      { rule: 'frozen-unset', pointer: '/x-frozen', before: true, after: undefined, effect: 'neutral', frozen: true },
      { rule: 'accepts-nothing', pointer: '', before: { type: 'string', 'x-frozen': true }, after: false, effect: 'narrows', frozen: true },
    ]);
  });

  it('is a schema marked `x-frozen: true` and nothing else', () => {
    expect([{ 'x-frozen': true }, { 'x-frozen': 'true' }, {}, true, undefined].map((schema) => isFrozen(schema))).toStrictEqual([true, false, false, false, false]);
  });
});

describe('x-frozen on a contract (R4)', () => {
  const frozen = { paths: { '/a': { get: { 'x-frozen': true } } } };

  it('makes every change under a frozen member breaking, one id, a fix that names the change', () => {
    const result = compareContracts(contract([op(response({ type: 'string', 'x-frozen': true }))]), contract([op(response({ type: ['string', 'null'] }))]));
    expect(rows(result.findings)).toStrictEqual([
      ['breaking', 'ac-frozen-changed', ''],
      ['breaking', 'ac-frozen-changed', '/x-frozen'],
    ]);
    expect(result.findings[0]).toMatchObject({ scheme: 'apicontract', effect: 'widens' });
    expect(result.findings[0]?.fix).toBe(
      'o response:200:application/json is under `x-frozen`, so nothing under it may change (`became-nullable`): revert it, or publish the change as a new version of the contract',
    );
    expect(result.verdict).toBe('breaking');
  });

  it('makes every change to an operation the old document froze breaking, even one that would not be', () => {
    const result = compareContracts(contract([op(request({ type: 'string', maxLength: 1 }))], frozen), contract([op(request({ type: 'string' }))]));
    expect(rows(result.findings)).toStrictEqual([['breaking', 'ac-frozen-changed', '/maxLength']]);
  });

  it('makes a frozen operation removed, and any operation added to a frozen document, breaking', () => {
    const removed = compareContracts(contract([op([])], frozen), contract([]));
    expect(rows(removed.findings)).toStrictEqual([['breaking', 'ac-frozen-changed', '']]);
    const added = compareContracts(contract([], { 'x-frozen': true }), contract([op([])]));
    expect(rows(added.findings)).toStrictEqual([['breaking', 'ac-frozen-changed', '']]);
    expect(added.findings[0]?.fix).toBe('o is under `x-frozen`, so nothing under it may change (`operation-added`): revert it, or publish the change as a new version of the contract');
  });

  it('freezes nothing an operation the old side did not mark, or that it cannot find', () => {
    const loose = { paths: { '/a': { get: { 'x-frozen': false } } } };
    expect(rows(compareContracts(contract([op(request({ type: 'string', maxLength: 1 }))], loose), contract([op(request({ type: 'string' }))])).findings)).toStrictEqual([
      ['non-breaking', 'ac-maxLength-unset', '/maxLength'],
    ]);
    expect(compareContracts(contract([op([], '#/nowhere/at/all')]), contract([])).findings[0]?.id).toBe('api-removed-without-deprecation');
    expect(compareContracts(contract([], frozen), contract([op([])])).findings[0]?.id).toBe('endpoint-added');
  });
});

describe('dangerous (R2)', () => {
  it('is a changed default anywhere, and a reader rule only where the client reads', () => {
    for (const direction of DIRECTIONS) expect(isDangerous('default-changed', direction)).toBe(true);
    for (const rule of ['enum-value-added', 'became-nullable', 'pattern-unset', 'format-unset']) {
      expect(SERVER_SENDS.map((direction) => isDangerous(rule, direction))).toStrictEqual([true, true, true]);
      expect(SERVER_RECEIVES.map((direction) => isDangerous(rule, direction))).toStrictEqual([false, false, false, false]);
    }
    expect(isDangerous('property-added', 'response')).toBe(false);
  });

  it('refines only a non-breaking verdict, and is breaking when the run asks', () => {
    const verdicts: Verdict[] = ['breaking', 'unknown', 'dangerous', 'non-breaking'];
    expect(verdicts.map((verdict) => refine({ rule: 'default-changed' }, 'request', verdict))).toStrictEqual(['breaking', 'unknown', 'dangerous', 'dangerous']);
    expect(refine({ rule: 'default-changed' }, 'request', 'non-breaking', true)).toBe('breaking');
    expect(refine({ rule: 'property-added' }, 'request', 'non-breaking', true)).toBe('non-breaking');
    expect(verdicts.map((verdict) => refine({ rule: 'property-added', frozen: true }, 'request', verdict))).toStrictEqual(['breaking', 'breaking', 'breaking', 'breaking']);
  });

  it('reports a changed default, with what a caller that leaves the value out now gets', () => {
    expect(compareSchemas({ type: 'string', default: 'a' }, { type: 'string', default: 'b' }, 'request')).toStrictEqual([
      { rule: 'default-changed', pointer: '/default', before: 'a', after: 'b', effect: 'neutral' },
    ]);
    expect(compareSchemas({ type: 'string', default: { a: [1] } }, { type: 'string', default: { a: [1] } }, 'request')).toStrictEqual([]);
    const result = compareContracts(contract([op(request({ type: 'string', default: 'a' }))]), contract([op(request({ type: 'string' }))]));
    expect(result).toMatchObject({ verdict: 'dangerous', summary: { breaking: 0, unknown: 0, dangerous: 1, 'non-breaking': 0 } });
    expect(result.findings[0]?.fix).toBe('a caller that leaves o body:application/json /default out now gets no default instead of "a": keep the old default, or say so in the release notes');
    const added = compareContracts(contract([op(request({ type: 'integer' }))]), contract([op(request({ type: 'integer', default: 2 }))]));
    expect(added.findings[0]?.fix).toBe('a caller that leaves o body:application/json /default out now gets 2 instead of no default: keep the old default, or say so in the release notes');
  });

  it('reports a value a reader may not expect, listed after unknown and before non-breaking', () => {
    const old = { type: 'object', properties: { kind: { enum: ['a'] }, id: { type: 'string', format: 'uuid' } } };
    const nu = { type: 'object', properties: { kind: { enum: ['a', 'b'] }, id: { type: 'string' }, extra: { type: 'string' } } };
    const result = compareContracts(contract([op(response(old))]), contract([op(response(nu))]), { side: 'server' });
    expect(rows(result.findings)).toStrictEqual([
      ['dangerous', 'ac-format-unset', '/properties/id/format'],
      ['dangerous', 'response-property-enum-value-added', '/properties/kind'],
      ['non-breaking', 'response-optional-property-added', '/properties/extra'],
    ]);
    expect(result.verdict).toBe('dangerous');
    expect(result.findings[1]?.fix).toBe(
      'a reader that rejects values it did not expect at o response:200:application/json /properties/kind may fail on this: make readers tolerate it, or say so in the release notes',
    );
    expect(compareContracts(contract([op(response(old))]), contract([op(response(nu))]), { side: 'server', dangerousBreaking: true }).verdict).toBe('breaking');
  });

  it('ranks the overall verdict breaking, unknown, dangerous, non-breaking', () => {
    const dangerous = request({ type: 'string', default: 'b' });
    const before = request({ type: 'string', default: 'a', pattern: 'x' });
    expect(compareContracts(contract([op(before)]), contract([op(request({ type: 'string', default: 'b', pattern: 'y' }))])).verdict).toBe('unknown');
    expect(compareContracts(contract([op(before)]), contract([op(dangerous)])).verdict).toBe('dangerous');
    expect(compareContracts(contract([op(request({ type: 'string', default: 'a' }))]), contract([op(request({ type: 'string', default: 'b', minLength: 1 }))])).verdict).toBe('breaking');
  });
});

const spec = (schema: string): string =>
  `openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths:\n  /a:\n    post:\n      operationId: a\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema: ${schema}\n      responses:\n        '204': { description: none }\n`;

const scratch = (files: Record<string, string>): string => {
  const dir = makeDir('apicontract-depth-');
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
};

describe('apicontract diff with dangerous changes', () => {
  const dir = scratch({ 'a.yaml': spec("{ type: string, default: 'a' }"), 'b.yaml': spec("{ type: string, default: 'b' }") });

  it('lists them with their fix, and does not fail the run', () => {
    const data = diff({ cwd: dir, old: 'a.yaml', new: 'b.yaml' });
    expect(data).toMatchObject({ verdict: 'dangerous', changed: false });
    expect(data).not.toHaveProperty('exitCode');
    expect(text(data).split('\n')).toStrictEqual([
      'dangerous: 0 breaking, 0 unknown, 1 dangerous, 0 non-breaking (--mode backward --side caller)',
      '',
      'a  #/paths/~1a/post',
      '  dangerous     ac-default-changed  body:application/json /default  "a" -> "b"',
      '                fix: a caller that leaves a body:application/json /default out now gets "b" instead of "a": keep the old default, or say so in the release notes',
    ]);
  });

  it('fails the run under --dangerous-breaking', () => {
    expect(diff({ cwd: dir, old: 'a.yaml', new: 'b.yaml', dangerousBreaking: true })).toMatchObject({ verdict: 'breaking', exitCode: ExitCode.RUNTIME });
  });

  it('is a SARIF warning and a minor bump', () => {
    const comparison = compareContracts(
      contract([op(request({ type: 'string', default: 'a' }))]),
      contract([op(request({ type: 'string', default: 'b' }))]),
    );
    expect(JSON.stringify(toSarif(comparison, { file: 'a.yaml' }, { file: 'b.yaml' }))).toContain('"level":"warning"');
    const written = diff({ cwd: dir, old: 'a.yaml', new: 'b.yaml', changeset: 'pets-api' });
    expect(readFileSync(join(dir, written.changeset as string), 'utf8')).toMatch(/^---\n'pets-api': minor\n/u);
    expect(text(diff({ cwd: dir, old: 'a.yaml', new: 'a.yaml' }))).toBe('no changes between a.yaml and a.yaml');
  });
});
