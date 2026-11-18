import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterAll, describe, expect, it } from 'vitest';

import { TYPED } from './__fixtures__/typed.js';
import { emit, emitWith, typeOf } from './emit.js';
import { type AnySchema, array, discriminated, enumOf, intersection, lazy, literal, type Node, nullable, nullish, number, object, oneOf, optional, record, type Schema, string, union } from './schema.js';

/**
 * `typeOf` says from the node what `Infer` says from the builder (gap
 * A-20261118-validator-emit-untyped), and the typed text `emit` writes type-checks under `strict`:
 * both are held to it by the TypeScript the repository builds with, on every kind.
 */

const ROOT = join(import.meta.dirname, '../../..');
const TSC = join(ROOT, 'node_modules/typescript/bin/tsc');

const scratch = mkdtempSync(join(tmpdir(), 'validator-typed-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** The diagnostics `tsc` prints for a module, under `strict`: empty when it type-checks. */
const typeCheck = async (source: string): Promise<string> => {
  writeFileSync(join(scratch, 'typed.ts'), source);
  const options = { strict: true, noEmit: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', allowImportingTsExtensions: true, skipLibCheck: true, types: [] };
  writeFileSync(join(scratch, 'tsconfig.json'), JSON.stringify({ compilerOptions: options, files: ['typed.ts'] }));
  try {
    await promisify(execFile)(process.execPath, [TSC, '-p', scratch]);
    return '';
  } catch (error) {
    return String((error as { stdout?: unknown }).stdout);
  }
};

const declared = (name: string, schema: Node): string => {
  const { text, aliases } = typeOf(schema, name);
  return [`type ${name} = ${text};`, ...[...aliases].map(([alias, type]) => `type ${alias} = ${type};`)].join('\n');
};

describe('typeOf', () => {
  it('writes the type Infer gives, for every kind, and tsc agrees', { timeout: 60_000 }, async () => {
    const lines = [
      `import { TYPED } from ${JSON.stringify(join(import.meta.dirname, '__fixtures__/typed.ts'))};`,
      `import { type Infer } from ${JSON.stringify(join(import.meta.dirname, 'schema.ts'))};`,
      'type Guard<T> = (value: unknown) => value is T;',
      'declare const value: unknown;',
    ];
    for (const [name, { schema, same }] of Object.entries(TYPED) as [string, { schema: AnySchema; same: boolean }][]) {
      const typed = `Typed_${name}`;
      lines.push(declared(typed, schema), `type Inferred_${name} = Infer<typeof TYPED.${name}.schema>;`);
      // The type written is never narrower than the one inferred: what the guard says it checked, it checked.
      lines.push(`export const ${name}Wide: [Inferred_${name}] extends [${typed}] ? true : false = true;`);
      if (same) lines.push(`export const ${name}Same: [${typed}] extends [Inferred_${name}] ? true : false = true;`);
      const { source, hooks } = emitWith(schema, { typescript: true, type: typed });
      lines.push(`export const ${name}Guard: Guard<${typed}> = (${source})([]);`);
      if (hooks.length === 0) {
        lines.push(`export const ${name}Inline = ${emit(schema, { typescript: true })};`, `if (${name}Inline(value)) { const narrowed: ${typed} = value; void narrowed; }`);
      }
    }
    expect(await typeCheck(lines.join('\n'))).toBe('');
  });

  it('writes a schema that names itself by an alias, once, and one that does not inline', () => {
    interface Node2 {
      readonly next: Node2 | null;
    }
    const Linked: Schema<Node2> = object({ next: union([lazy(() => Linked), literal(null)]) });
    expect(typeOf(Linked, 'L')).toEqual({ text: '{ "next": L_0 | null }', aliases: new Map([['L_0', '{ "next": L_0 | null }']]) });
    expect(typeOf(lazy(() => Linked))).toEqual({ text: 'T_0', aliases: new Map([['T_0', '{ "next": T_0 | null }']]) });
    interface Pair {
      readonly left: Pair | null;
      readonly right: Pair | null;
    }
    const Twice: Schema<Pair> = object({ left: nullable(lazy(() => Twice)), right: nullable(lazy(() => Twice)) });
    expect(typeOf(Twice).aliases).toEqual(new Map([['T_0', '{ "left": T_0 | null; "right": T_0 | null }']]));
    const Leaf = object({ n: number() });
    expect(typeOf(array(union([lazy(() => Leaf), lazy(() => Leaf)])))).toEqual({ text: '({ "n": number } | { "n": number })[]', aliases: new Map() });
  });

  it('brackets a type only where it binds less tightly than its place', () => {
    expect(typeOf(array(array(string()))).text).toBe('string[][]');
    expect(typeOf(array(union([string()]))).text).toBe('string[]');
    expect(typeOf(record(number(), { key: union([literal('a'), literal('b')]) })).text).toBe('{ [K in ("a" | "b") & string]?: number }');
    expect(typeOf(record(number(), { key: string() })).text).toBe('Record<string, number>');
    expect(typeOf(union([TYPED.fn.schema, string()])).text).toBe('((...args: never[]) => unknown) | string');
    expect(typeOf(TYPED.orNull.schema).text).toBe('string | number | null');
    expect(typeOf(TYPED.both.schema).text).toBe('{ "a": string } & { "b": number }');
    expect(typeOf(TYPED.rest.schema).text).toBe('{ "id": string } & Readonly<Record<string, number>>');
    expect(typeOf(TYPED.shape.schema).text).toBe('{ "id": string; "odd key"?: number | undefined; "exact"?: boolean; "maybe"?: string | null | undefined; "anything"?: unknown }');
    expect(typeOf(TYPED.word.schema).text).toBe(String.raw`"a\"\u003c\u002fb\u003e"`);
    expect(typeOf(literal(Number.NaN)).text).toBe('number');
    expect(typeOf({ ...literal(1), value: {} } as Node).text).toBe('unknown');
    expect(typeOf(array(intersection([object({ a: string() }), object({ b: number() })]))).text).toBe('({ "a": string } & { "b": number })[]');
    expect(typeOf(intersection([string(), union([literal('a'), literal('b')])])).text).toBe('string & ("a" | "b")');
    expect(typeOf(object({ k: optional(union([literal(undefined), string()])) })).text).toBe('{ "k"?: undefined | string | undefined }');
    expect(typeOf(object({ k: optional(union([string(), literal(undefined)])) })).text).toBe('{ "k"?: string | undefined }');
    expect(typeOf(object({})).text).toBe('{}');
    expect(typeOf(TYPED.restOnly.schema).text).toBe('Readonly<Record<string, number>>');
    expect(typeOf(nullable(union([string(), number()]))).text).toBe('string | number | null');
    expect(typeOf(nullish(TYPED.fn.schema)).text).toBe('((...args: never[]) => unknown) | null | undefined');
    expect([enumOf([]), discriminated('k', {}), oneOf([]), union([])].map((schema) => typeOf(schema).text)).toEqual(['never', 'never', 'never', 'never']);
    expect(['string', 'number', 'bigint', 'boolean', 'undefined', 'object', 'xml'].map((value) => typeOf({ ...TYPED.sym.schema, value } as Node).text)).toEqual(['string', 'number', 'bigint', 'boolean', 'undefined', 'object | null', 'unknown']);
  });

  it('refuses a node of no kind, and a prefix that is no name', () => {
    expect(() => typeOf({ ...string(), kind: 'constructor' } as unknown as Node)).toThrow('cannot write the type of a node of the kind "constructor": there is no such kind. fix: build the schema with the builders');
    expect(() => typeOf({ ...string(), kind: 5 } as unknown as Node)).toThrow('cannot write the type of a node of the kind a value of the type number: there is no such kind');
    expect(() => typeOf({ ...string(), kind: { toString: () => 'string' } } as unknown as Node)).toThrow('cannot write the type of a node of the kind a value of the type object');
    expect(() => typeOf(string(), '1x')).toThrow('cannot name the aliases of a type "1x": it is not an identifier. fix: give a name of letters, digits, _ and $ that does not start with a digit');
  });
});

describe('emit, typed', () => {
  it('writes the same checks as the JavaScript, with types', () => {
    const schema = object({ a: array(string({ min: 2 })) });
    const plain = emit(schema);
    const typed = emit(schema, { typescript: true });
    expect(typed.replaceAll(/: (?:any|boolean|number)\b/gu, '').replace(/: v is .*? =>/u, ' =>')).toBe(plain);
    expect(typed).toContain('return (v: any): v is { "a": string[] } => ');
    expect(plain).not.toMatch(/«|»|: any/u);
  });

  it('names the type it is given, and refuses one that is no name', () => {
    expect(emit(string(), { typescript: true, type: 'Name' })).toBe('(() => {\n\nreturn (v: any): v is Name => typeof v === "string";\n})()');
    expect(emitWith(string(), { typescript: true }).source).toBe('(h: any) => {\n\nreturn (v: any): v is string => typeof v === "string";\n}');
    expect(() => emit(string(), { typescript: true, type: 'a b' })).toThrow('cannot name the type of a guard "a b": it is not an identifier. fix: give a name of letters, digits, _ and $ that does not start with a digit');
    expect(() => emit(string(), { typescript: true, type: { toString: () => 'Name' } as unknown as string })).toThrow('cannot name the type of a guard a value of the type object');
    expect(() => emit(string(), { typescript: true, type: 5 as unknown as string })).toThrow('cannot name the type of a guard a value of the type number');
  });

  it('declares the aliases of a schema that names itself inside the text, one to a line', () => {
    interface List {
      readonly next: List | null;
    }
    const Linked: Schema<List> = object({ next: nullable(lazy(() => Linked)) });
    expect(emit(lazy(() => Linked), { typescript: true }).startsWith('(() => {\ntype T_0 = { "next": T_0 | null };\nconst ')).toBe(true);
    const Other: Schema<List> = object({ next: nullable(lazy(() => Other)) });
    const both = emit(object({ a: lazy(() => Linked), b: lazy(() => Other) }), { typescript: true });
    expect(both.startsWith('(() => {\ntype T_0 = { "next": T_0 | null };\ntype T_1 = { "next": T_1 | null };\nconst ')).toBe(true);
  });

  it('keeps the marks of an annotation that a value of the schema holds, as a value', () => {
    const schema = object({ '«: any»': literal('»«') });
    const source = emit(schema);
    expect(source).toContain(String.raw`v["\u00ab: any\u00bb"] === "\u00bb\u00ab"`);
    // eslint-disable-next-line node-security/detect-eval-with-expression -- the text is the emitter's, from a schema built here
    const run = new Function(`return ${source};`)() as (value: unknown) => boolean;
    expect(run({ '«: any»': '»«' })).toBe(true);
    expect(run({ '«: any»': '' })).toBe(false);
  });
});
