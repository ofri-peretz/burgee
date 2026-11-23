/**
 * contractdiff-compat-depth R3: `diff --usage`, a breaking change judged against who uses it.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { diff } from './command-diff.js';
import { type Contract, type Operation, type Payload } from './core/model.js';
import { compareContracts } from './diff-contract.js';
import { applyUsage, memberOf, parseUsage } from './diff-usage.js';

const TEXT = Symbol.for('burgee.text');
const text = (data: Record<string | symbol, unknown>): string => (data[TEXT] as () => string)();
const makeDir = scratchDirs();

const body = (schema: Payload['schema']): Payload => ({ name: 'body:application/json', direction: 'request', schema, required: true });
const limit = (maximum: number): Payload => ({ name: 'param:query:limit', direction: 'request', schema: { type: 'integer', maximum }, required: false });
const op = (id: string, payloads: Payload[]): Operation => ({ id, source: `#/paths/~1${id}/post`, payloads });
const contract = (operations: Operation[]): Contract => ({ format: 'openapi', document: {}, operations });
const owner = (maxLength: number) => body({ type: 'object', properties: { owner: { type: 'object', properties: { id: { type: 'string', maxLength }, name: { type: 'string', maxLength } } } } });

const old = contract([op('a', [owner(10), limit(100)]), op('b', [])]);
const nu = contract([op('a', [owner(5), limit(50)])]);
const rows = (usage: string) =>
  applyUsage(compareContracts(old, nu), parseUsage(usage, 'usage.json')).findings.map((f) => [f.verdict, f.operation, f.payload ?? '', f.pointer, f.note ?? '', (f.usedBy ?? []).join(',')]);

describe('memberOf', () => {
  it('is a parameter by name, a property by its path, the whole payload as nothing', () => {
    expect(memberOf({ payload: 'param:query:limit', pointer: '/maximum' })).toStrictEqual(['limit']);
    expect(memberOf({ payload: 'param:header:x:y', pointer: '' })).toStrictEqual(['x:y']);
    expect(memberOf({ payload: 'body:application/json', pointer: '/properties/owner/properties/id/maxLength' })).toStrictEqual(['owner', 'id']);
    expect(memberOf({ payload: 'body', pointer: '/properties/properties/properties/a~1b~0c' })).toStrictEqual(['properties', 'a/b~c']);
    expect(memberOf({ payload: 'body', pointer: '/items/properties/x/maxLength' })).toStrictEqual(['x']);
    expect(memberOf({ payload: 'body', pointer: '/properties' })).toStrictEqual([]);
    expect(memberOf({ pointer: '' })).toStrictEqual([]);
  });
});

describe('applyUsage', () => {
  it('makes a breaking change to an operation nobody uses non-breaking, noted unused', () => {
    expect(rows('{ "operations": { "a": {} } }')).toStrictEqual([
      ['breaking', 'a', 'body:application/json', '/properties/owner/properties/id/maxLength', '', ''],
      ['breaking', 'a', 'body:application/json', '/properties/owner/properties/name/maxLength', '', ''],
      ['breaking', 'a', 'param:query:limit', '/maximum', '', ''],
      ['non-breaking', 'b', '', '', 'unused', ''],
    ]);
  });

  it('keeps only the members used breaking, a parent and a child of one each used, and names the callers', () => {
    expect(rows('{ "operations": { "a": { "members": ["owner.id"], "callers": ["web", "ios"] }, "b": { "callers": [] } } }')).toStrictEqual([
      ['breaking', 'a', 'body:application/json', '/properties/owner/properties/id/maxLength', '', 'web,ios'],
      ['breaking', 'b', '', '', '', ''],
      ['non-breaking', 'a', 'body:application/json', '/properties/owner/properties/name/maxLength', 'unused', ''],
      ['non-breaking', 'a', 'param:query:limit', '/maximum', 'unused', ''],
    ]);
    expect(rows('{ "operations": { "a": { "members": ["owner", "limit"] } } }').filter((row) => row[0] === 'breaking')).toHaveLength(3);
    const parent = applyUsage(
      compareContracts(contract([op('a', [owner(10)])]), contract([op('a', [body({ type: 'object', properties: { owner: { type: 'string' } } })])])),
      parseUsage('{ "operations": { "a": { "members": ["owner.id"], "callers": [] } } }', 'usage.json'),
    );
    expect(parent.findings.filter((f) => f.verdict === 'breaking').map((f) => f.pointer)).toStrictEqual(['/properties/owner']);
    expect(parent.findings[0]).not.toHaveProperty('usedBy');
  });

  it('recounts the summary and the verdict, and leaves what is not breaking alone', () => {
    const result = applyUsage(compareContracts(old, nu), parseUsage('{ "operations": {} }', 'usage.json'));
    expect(result).toMatchObject({ verdict: 'non-breaking', summary: { breaking: 0, unknown: 0, dangerous: 0, 'non-breaking': 4 } });
    expect(result.findings[0]?.fix).toBe('nothing to do: the usage file names no caller of it');
    const widened = applyUsage(compareContracts(nu, old), parseUsage('{ "operations": {} }', 'usage.json'));
    expect(widened.findings.every((finding) => finding.note === undefined)).toBe(true);
  });

  it('reads a contract map, whose files are the callers', () => {
    const map = JSON.stringify({ version: 1, operations: { a: [{ file: 'src/b.ts', symbol: 'a', target: 'ts' }, { file: 'src/a.ts', symbol: 'A', target: 'ts' }, { file: 'src/a.ts', symbol: 'aa', target: 'ts' }, 'junk', { file: 1 }] }, files: {} });
    expect(parseUsage(map, 'apicontract.map.json').get('a')).toStrictEqual({ callers: ['src/a.ts', 'src/b.ts'] });
  });

  it('refuses a file it cannot read, each with the shape it takes', () => {
    const shape = 'fix: pass JSON shaped { "operations": { "<operationId>": { "members": ["name"], "callers": ["web"] } } }, or an apicontract.map.json';
    expect(() => parseUsage('{', 'u.json')).toThrow(/^u\.json is not JSON: .+\. fix: pass JSON shaped/u);
    expect(() => parseUsage('null', 'u.json')).toThrow(`u.json has no \`operations\` object. ${shape}`);
    expect(() => parseUsage('[]', 'u.json')).toThrow(`u.json has no \`operations\` object. ${shape}`);
    expect(() => parseUsage('{ "operations": [] }', 'u.json')).toThrow(`u.json has no \`operations\` object. ${shape}`);
    for (const entry of ['1', 'null', '{ "members": "a" }', '{ "callers": [1] }']) {
      expect(() => parseUsage(`{ "operations": { "a": ${entry} } }`, 'u.json')).toThrow(`u.json: operation \`a\` is not an object of string lists. ${shape}`);
    }
    const usage = parseUsage('{ "operations": { "a": { "members": [], "callers": ["x"] }, "b": { "callers": ["y"] }, "c": { "members": ["z"] } } }', 'u.json');
    expect([...usage.values()]).toStrictEqual([{ members: [], callers: ['x'] }, { callers: ['y'] }, { members: ['z'] }]);
  });
});

const spec = (maxLength: number): string =>
  `openapi: 3.1.0\ninfo: { title: t, version: '1' }\npaths:\n  /a:\n    post:\n      operationId: a\n      requestBody:\n        required: true\n        content:\n          application/json:\n            schema: { type: object, properties: { name: { type: string, maxLength: ${String(maxLength)} } } }\n      responses:\n        '204': { description: none }\n`;

describe('apicontract diff --usage', () => {
  const dir = makeDir('apicontract-usage-');
  writeFileSync(join(dir, 'a.yaml'), spec(10));
  writeFileSync(join(dir, 'b.yaml'), spec(5));
  writeFileSync(join(dir, 'unused.json'), '{ "operations": {} }');
  writeFileSync(join(dir, 'used.json'), '{ "operations": { "a": { "callers": ["web", "ios"] } } }');

  it('passes a run whose only breaking change nobody uses, and says so', () => {
    const data = diff({ cwd: dir, old: 'a.yaml', new: 'b.yaml', usage: 'unused.json' });
    expect(data).toMatchObject({ verdict: 'non-breaking' });
    expect(data).not.toHaveProperty('exitCode');
    expect(text(data)).toContain('/properties/name/maxLength  10 -> 5  (unused)');
  });

  it('fails one whose breaking change a caller uses, naming the caller', () => {
    const data = diff({ cwd: dir, old: 'a.yaml', new: 'b.yaml', usage: 'used.json' });
    expect(data).toMatchObject({ verdict: 'breaking', exitCode: ExitCode.RUNTIME });
    expect(text(data)).toContain('/properties/name/maxLength  10 -> 5  (used by web, ios)');
  });

  it('refuses a usage file that is not there, with the fix', () => {
    expect(() => diff({ cwd: dir, old: 'a.yaml', new: 'b.yaml', usage: 'missing.json' })).toThrow(
      'there is no usage file missing.json. fix: pass the path of a JSON file that says which operations callers use, or an apicontract.map.json',
    );
  });
});
