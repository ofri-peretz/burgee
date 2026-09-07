import { describe, expect, it } from 'vitest';

import { type CompatRecord, diffRecords, isEmptyDiff, renderDiff, surfaceNames, testNames } from './upstream.js';

const record = (over: Partial<CompatRecord>): CompatRecord => ({
  repo: 'r',
  version: '1.0.0',
  tag: 'v1.0.0',
  commit: 'a'.repeat(40),
  vendored: '2026-09-07',
  files: 1,
  internalFiles: [],
  internals: [],
  hashes: { 'tests/a.test.js': 'h1' },
  tests: { 'tests/a.test.js': ['one', 'two'] },
  surface: { 'typings/index.d.ts': ['Command', 'Command.option'] },
  ...over,
});

describe('fingerprinting an upstream release', () => {
  it('reads test titles as written, in order, for node:test and mocha styles', () => {
    const src = `test('when x then y', () => {});\n  it("quoted \\"inner\\" name", async () => {});\ndescribe(\`tpl\`, () => {});`;
    expect(testNames(src)).toEqual(['when x then y', 'quoted \\"inner\\" name', 'tpl']);
  });

  it('reads exported names and Class.method names from a typings file', () => {
    const dts = [
      'export class Command extends EventEmitter {',
      '  constructor(name?: string);',
      '  option(flags: string): this;',
      '  requiredOption<T>(flags: string): this;',
      '}',
      'export function createCommand(name?: string): Command;',
      'export interface ParseOptions { from: string }',
    ].join('\n');
    expect(surfaceNames(dts)).toEqual(['Command', 'Command.option', 'Command.requiredOption', 'ParseOptions', 'createCommand']);
  });
});

describe('diffing two records', () => {
  it('is empty when a release re-tags the same tests and surface', () => {
    const before = record({});
    const after = record({ version: '1.0.1', tag: 'v1.0.1', commit: 'b'.repeat(40) });
    expect(isEmptyDiff(diffRecords(before, after))).toBe(true);
    expect(renderDiff('h', before, after, diffRecords(before, after))).toMatch(/re-tag of what is vendored/);
  });

  it('names exactly what a release added, removed and changed', () => {
    const before = record({});
    const after = record({
      version: '1.1.0',
      hashes: { 'tests/a.test.js': 'h2', 'tests/b.test.js': 'h3' },
      tests: { 'tests/a.test.js': ['one', 'three'], 'tests/b.test.js': ['four'] },
      surface: { 'typings/index.d.ts': ['Command', 'Command.option', 'Command.helpGroup'] },
    });
    const diff = diffRecords(before, after);
    expect(diff.files).toEqual({ added: ['tests/b.test.js'], removed: [], changed: ['tests/a.test.js'] });
    expect(diff.tests.added).toEqual(['tests/a.test.js :: three', 'tests/b.test.js :: four']);
    expect(diff.tests.removed).toEqual(['tests/a.test.js :: two']);
    expect(diff.surface.added).toEqual(['typings/index.d.ts :: Command.helpGroup']);
    const body = renderDiff('commander', before, after, diff);
    expect(body).toMatch(/## commander: 1\.0\.0 → 1\.1\.0/);
    expect(body).toMatch(/### Surface names added \(1\)/);
    expect(body).toMatch(/Command\.helpGroup/);
  });
});
