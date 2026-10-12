/**
 * `localised-human-surfaces` R4 — the published pack schema is the catalog's, and it refuses
 * what it says it refuses.
 *
 * Three things: the committed `locale-pack-schema.json` is what `scripts/locale-pack-schema.ts`
 * writes from `messages.ts` today; it is published (`burgee/locale-pack-schema.json` in
 * `exports`, copied to `dist/` by `schema-to-dist.mjs`); and its patterns accept a placeholder
 * the English has and refuse one it does not, which is the half of R4 a schema can carry.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, as `locale-pack-schema.ts` reads it: the catalog is source, not an export
import { MESSAGES } from '../packages/burgee/src/messages.js';

import { rendered, SCHEMA_PATH } from './locale-pack-schema.js';

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as { $defs: { messages: { properties: Record<string, { pattern?: string; anyOf?: { pattern?: string }[] }> } } };
const properties = schema.$defs.messages.properties;
const patternOf = (id: string): RegExp => new RegExp((properties[id]?.pattern ?? properties[id]?.anyOf?.[0]?.pattern) as string, 'u');

describe('burgee/locale-pack-schema.json (R4)', () => {
  it('is what the generator writes from the catalog: run npx tsx scripts/locale-pack-schema.ts', () => {
    expect(readFileSync(SCHEMA_PATH, 'utf8')).toBe(rendered());
  });

  it('has one property per catalog id, and no other', () => {
    expect(Object.keys(properties)).toEqual(Object.keys(MESSAGES));
  });

  it('accepts the placeholders the English has, a brace that opens none, and refuses any other', () => {
    expect(patternOf('usage.unknownOption').test('unbekannte Option {option}')).toBe(true);
    expect(patternOf('usage.unknownOption').test('Option { ist offen')).toBe(true);
    expect(patternOf('usage.unknownOption').test('unbekannte Option {flag}')).toBe(false);
    expect(patternOf('hint.passOne').test('übergeben Sie {option}')).toBe(false);
  });

  it('is published beside the package’s other schemas', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../packages/burgee/package.json', import.meta.url)), 'utf8')) as { exports: Record<string, unknown> };
    expect(pkg.exports['./locale-pack-schema.json']).toBe('./dist/locale-pack-schema.json');
    expect(readFileSync(fileURLToPath(new URL('schema-to-dist.mjs', import.meta.url)), 'utf8')).toContain("'locale-pack-schema.json'");
  });
});
