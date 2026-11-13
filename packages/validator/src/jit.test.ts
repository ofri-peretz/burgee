import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { check } from './check.js';
import { compile } from './jit.js';
import { custom, number, object, string } from './schema.js';

const isOne = (value: unknown): boolean => value === 1;
const isE = (text: string): boolean => text === 'e';

describe('compile', () => {
  it('returns a function that answers what check answers, and narrows', () => {
    const Point = object({ x: number(), label: string({ min: 1 }) });
    const isPoint = compile(Point);
    for (const value of [{ x: 1, label: 'a' }, { x: 1, label: '' }, { x: '1', label: 'a' }, null]) {
      expect(isPoint(value)).toBe(check(Point, value));
    }
    const value: unknown = { x: 1, label: 'a' };
    expect(isPoint(value) && value.label).toBe('a');
  });

  it('hands the functions a schema names to the text that calls them', () => {
    const schema = object({ one: custom<1>('one', isOne), e: string({ format: { name: 'e', test: isE } }) });
    const compiled = compile(schema);
    for (const value of [{ one: 1, e: 'e' }, { one: 2, e: 'e' }, { one: 1, e: 'f' }, { e: 'e' }, {}]) {
      expect(compiled(value)).toBe(check(schema, value));
    }
    expect(compiled({ one: 1, e: 'e' })).toBe(true);
  });
});

// spec.md R3 and R5: only `jit.ts` evaluates text, and nothing but its own test imports it.
describe('the default path', () => {
  const sources = readdirSync(import.meta.dirname)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && file !== 'jit.ts')
    .map((file) => [file, readFileSync(`${import.meta.dirname}/${file}`, 'utf8')] as const);

  it('has source files to read', () => {
    expect(sources.map(([file]) => file).toSorted()).toEqual(['assert.ts', 'check.ts', 'derive.ts', 'emit.ts', 'formats.ts', 'index.ts', 'issues.ts', 'json-schema.ts', 'parse.ts', 'schema.ts']);
  });

  it.each(sources)('%s never evaluates text and never imports the jit door', (_, source) => {
    expect(source).not.toMatch(/new Function|\beval\(/u);
    expect(source).not.toContain('./jit.js');
  });
});
