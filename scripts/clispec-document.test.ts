/**
 * clispec-conformance R1, R3, R4, R5, R8 — the reference demo's `--schema` is a valid clispec
 * v0.3 document (https://clispec.dev), validated against the schema clispec's own scorer
 * validates with (`packages/burgee/src/__fixtures__/clispec-v0.3.json`, vendored from
 * clispec-cli `v0.3.0`; the NOTICE beside it says where from).
 *
 * The demo is run as the scorer runs it: the built bin, spawned, stdout piped, `schema` (the
 * D-151 alias of `--schema`). Its own `package.json` supplies the version.
 *
 * **The walker is strict.** clispec's schema leans on `allOf` / `if` / `then` / `anyOf` / `not`
 * (a data command must state its cardinality; an opaque one must name its media type), and the
 * family's walker (`flagstaff/src/conforms.ts`) reads none of those keywords: it would pass a
 * document with no cardinality at all. So this file walks with every keyword the vendored schema
 * uses, and **refuses a keyword it does not know**, so a later schema cannot be half-read in
 * silence. No validator dependency (D-123).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLISPEC = JSON.parse(readFileSync(join(ROOT, 'packages/burgee/src/__fixtures__/clispec-v0.3.json'), 'utf8')) as Schema;
const DEMO = join(ROOT, 'examples/demo-cli-burgee/dist/bin.js');

type Schema = Record<string, unknown> | boolean;
type Node = Record<string, unknown>;
type Problem = string | undefined;

/** Keywords that say nothing about validity: annotations, and the schema's own `x-` extensions. */
const ANNOTATIONS = new Set(['$schema', '$id', 'title', 'description', '$comment', 'default', 'deprecated', '$defs']);
/** Keywords this walker enforces. Anything else in the schema is an error, not a pass. */
const ENFORCED = new Set(['type', 'const', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'minLength', 'minimum', 'maximum', 'pattern', '$ref', 'allOf', 'anyOf', 'if', 'then', 'not']);

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number';
  return typeOf(value) === type;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The first problem a list of checks reports, in order. */
const first = (checks: (() => Problem)[]): Problem => checks.reduce<Problem>((found, check) => found ?? check(), undefined);

function refuseUnknown(s: Node, path: string): void {
  for (const key of Object.keys(s)) {
    if (!ANNOTATIONS.has(key) && !ENFORCED.has(key) && !key.startsWith('x-')) throw new Error(`the walker does not know the keyword "${key}" at ${path}; teach it, or this test reads less than it says`);
  }
}

function checkRef(value: unknown, s: Node, path: string, root: Schema): Problem {
  if (typeof s['$ref'] !== 'string') return undefined;
  const target = ((root as Node)['$defs'] as Record<string, Schema> | undefined)?.[s['$ref'].replace('#/$defs/', '')];
  return target === undefined ? `${path}: unknown $ref ${s['$ref']}` : validate(value, target, path, root);
}

function checkValue(value: unknown, s: Node, path: string): Problem {
  if (typeof s['type'] === 'string' && !matchesType(value, s['type'])) return `${path}: expected ${s['type']}, got ${typeOf(value)}`;
  if ('const' in s && !same(value, s['const'])) return `${path}: expected ${JSON.stringify(s['const'])}`;
  if (Array.isArray(s['enum']) && !s['enum'].some((e) => same(e, value))) return `${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(s['enum'])}`;
  return undefined;
}

function checkScalar(value: unknown, s: Node, path: string): Problem {
  if (typeof value === 'string' && typeof s['minLength'] === 'number' && value.length < s['minLength']) return `${path}: shorter than ${String(s['minLength'])}`;
  // The pattern is the vendored schema's own, never an input's.
  if (typeof value === 'string' && typeof s['pattern'] === 'string' && !new RegExp(s['pattern'], 'u').test(value)) return `${path}: ${JSON.stringify(value)} does not match ${s['pattern']}`;
  if (typeof value === 'number' && typeof s['minimum'] === 'number' && value < s['minimum']) return `${path}: below ${String(s['minimum'])}`;
  if (typeof value === 'number' && typeof s['maximum'] === 'number' && value > s['maximum']) return `${path}: above ${String(s['maximum'])}`;
  return undefined;
}

function checkArray(value: unknown, s: Node, path: string, root: Schema): Problem {
  if (!Array.isArray(value)) return undefined;
  if (typeof s['minItems'] === 'number' && value.length < s['minItems']) return `${path}: fewer than ${String(s['minItems'])} items`;
  const items = s['items'] as Schema | undefined;
  return items === undefined ? undefined : first(value.map((item, i) => () => validate(item, items, `${path}[${String(i)}]`, root)));
}

function checkObject(value: unknown, s: Node, path: string, root: Schema): Problem {
  if (typeOf(value) !== 'object') return undefined;
  const record = value as Node;
  const missing = ((s['required'] as string[] | undefined) ?? []).find((key) => !(key in record));
  if (missing !== undefined) return `${path}.${missing}: required`;
  const properties = (s['properties'] ?? {}) as Record<string, Schema>;
  const rule = (key: string): Schema | undefined => properties[key] ?? (s['additionalProperties'] as Schema | undefined);
  return first(Object.entries(record).map(([key, child]) => () => (rule(key) === undefined ? undefined : validate(child, rule(key) as Schema, `${path}.${key}`, root))));
}

function checkCombinators(value: unknown, s: Node, path: string, root: Schema): Problem {
  const all = first(((s['allOf'] as Schema[] | undefined) ?? []).map((part) => () => validate(value, part, path, root)));
  if (all !== undefined) return all;
  if (Array.isArray(s['anyOf']) && s['anyOf'].every((part: Schema) => validate(value, part, path, root) !== undefined)) return `${path}: matches none of anyOf`;
  if (s['not'] !== undefined && validate(value, s['not'] as Schema, path, root) === undefined) return `${path}: matches what "not" forbids`;
  const holds = s['if'] !== undefined && validate(value, s['if'] as Schema, path, root) === undefined;
  return holds && s['then'] !== undefined ? validate(value, s['then'] as Schema, path, root) : undefined;
}

/** The first way `value` breaks `schema`, as `path: why`, or undefined when it conforms. */
export function validate(value: unknown, schema: Schema, path = '$', root: Schema = schema): Problem {
  if (typeof schema === 'boolean') return schema ? undefined : `${path}: no value is allowed here`;
  refuseUnknown(schema, path);
  return first([
    () => checkRef(value, schema, path, root),
    () => checkValue(value, schema, path),
    () => checkScalar(value, schema, path),
    () => checkArray(value, schema, path, root),
    () => checkObject(value, schema, path, root),
    () => checkCombinators(value, schema, path, root),
  ]);
}

/** The demo's document, the way clispec's scorer asks for it. */
function demoSchema(): Record<string, unknown> & { commands: Record<string, unknown>[] } {
  expect(existsSync(DEMO), `${DEMO} is not built — run \`npm run build\` first; this test does not skip`).toBe(true);
  return JSON.parse(execFileSync(process.execPath, [DEMO, 'schema'], { encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '', HOME: ROOT } })) as Record<string, unknown> & { commands: Record<string, unknown>[] };
}

describe('the walker reads what the clispec schema says (the check can fail)', () => {
  const minimal = { clispec: '0.3', name: 'tool', version: '1.0.0', commands: [{ name: 'list', description: 'List', effects: 'read_only', cardinality: 'single', stdout_schema: {} }], errors: [{ kind: 'usage', exit_code: 2 }] };

  it('passes clispec-cli’s own minimal valid document', () => {
    expect(validate(minimal, CLISPEC)).toBeUndefined();
  });

  it.each([
    ['no errors', { ...minimal, errors: undefined }, /errors: required/],
    ['no version', { ...minimal, version: undefined }, /version: required/],
    ['clispec 0.2', { ...minimal, clispec: '0.2' }, /clispec: expected "0.3"/],
    ['a kebab-case kind', { ...minimal, errors: [{ kind: 'quota-exceeded', exit_code: 7 }] }, /does not match/],
    ['a data command with no cardinality', { ...minimal, commands: [{ ...minimal.commands[0], cardinality: undefined }] }, /cardinality: required/],
    ['a data command that does not describe its output', { ...minimal, commands: [{ ...minimal.commands[0], stdout_schema: undefined }] }, /anyOf/],
    ['an opaque command with no media type', { ...minimal, commands: [{ name: 'x', description: 'x', effects: 'read_only', output_kind: 'opaque' }] }, /media_type: required/],
    ['a withheld command', { ...minimal, commands: [{ ...minimal.commands[0], effects: 'withheld' }] }, /is not one of/],
  ])('refuses %s', (_name, doc, why) => {
    expect(validate(JSON.parse(JSON.stringify(doc)), CLISPEC)).toMatch(why);
  });

  it('refuses a keyword it does not enforce, rather than passing over it', () => {
    expect(() => validate({}, { uniqueItems: true })).toThrow(/does not know the keyword "uniqueItems"/);
  });
});

describe('the reference demo’s --schema is a clispec v0.3 document (R1, R3, R4, R5, R8)', () => {
  const doc = demoSchema();

  it('validates against the vendored v0.3 schema', () => {
    expect(validate(doc, CLISPEC)).toBeUndefined();
  });

  it('says what it conforms to, and always carries a version: the demo’s package.json’s (R1)', () => {
    expect(doc['clispec']).toBe('0.3');
    const own = JSON.parse(readFileSync(join(ROOT, 'examples/demo-cli-burgee/package.json'), 'utf8')) as { version: string };
    expect(doc['version']).toBe(own.version);
    // burgee's own keys stay where they were.
    expect(doc['schemaVersion']).toBe(1);
    expect(doc['exitCodes']).toBeDefined();
  });

  it('declares its global arguments and its piped default (R3, R7)', () => {
    expect(doc['global_args']).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'json', type: 'boolean' })]));
    expect(doc['output']).toMatchObject({ piped: 'text' });
  });

  it('gives every command an example to run, a cardinality and an output description (R4, R5, R8)', () => {
    for (const command of doc.commands.filter((c) => c['output_kind'] !== 'opaque')) {
      expect(command['example'], String(command['name'])).toEqual({ args: expect.arrayContaining([expect.any(String)]) as unknown });
      expect(command['cardinality'], String(command['name'])).toMatch(/^(single|bounded|unbounded)$/);
      expect(command['stdout_schema'], String(command['name'])).toBeTypeOf('object');
    }
  });

  it.each(['errors', 'version', 'clispec'])('fails without %s: the check reads the document it was given', (key) => {
    const { [key]: _gone, ...rest } = doc;
    expect(validate(rest, CLISPEC)).toMatch(new RegExp(`${key}: (required|expected)`));
  });

  it('runs its declared example with --json, and gets JSON back (clispec "Valid JSON output")', () => {
    const greet = doc.commands.find((c) => c['name'] === 'greet') as { example: { args: string[] } };
    const out = execFileSync(process.execPath, [DEMO, ...greet.example.args, '--json'], { encoding: 'utf8', env: { PATH: process.env['PATH'] ?? '' } });
    expect(JSON.parse(out)).toMatchObject({ ok: true });
  });
});
