import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  diffSource,
  disagreements,
  errorLine,
  expandPins,
  filesWithErrors,
  foldTool,
  median,
  parseFlags,
  parsePins,
  type PinFile,
  type PinnedSource,
  type Row,
  rawUrl,
  renderSummary,
  sample,
  seeded,
  serializePins,
} from './corpus-lib.js';
import { assertPinned } from './install.js';

const SHA = 'a'.repeat(64);
const COMMIT = 'b'.repeat(40);

const file: PinFile = {
  version: 1,
  sources: {
    zeta: { family: 'openapi', repo: 'o/z', commit: COMMIT, license: 'MIT', documents: { 'b.json': SHA, 'a b.yaml': SHA } },
    alpha: { family: 'asyncapi', repo: 'o/a', commit: COMMIT, license: 'Apache-2.0', documents: { 'x.yml': SHA } },
  },
};

const bad = (patch: object): string => JSON.stringify({ version: 1, sources: { s: { ...file.sources.zeta, ...patch } } });

const row = (id: string, tool: string, over: Partial<Row> = {}): Row => ({
  id,
  tool,
  read: true,
  generate: true,
  typecheck: { ts59: true, ts60: true, ts70: true },
  roundtrip: null,
  ms: 100,
  error: null,
  ...over,
});

describe('pins', () => {
  it('round-trips through the committed form, sorted', () => {
    const text = serializePins(file);
    expect(parsePins(text)).toEqual(parsePins(serializePins(parsePins(text))));
    expect(Object.keys(parsePins(text).sources)).toEqual(['alpha', 'zeta']);
    expect(text.indexOf('"a b.yaml"')).toBeLessThan(text.indexOf('"b.json"'));
  });

  it('expands to R1 rows with a commit-addressed, escaped URL', () => {
    const pins = expandPins(file);
    expect(pins.map((p) => p.id)).toEqual(['alpha:x.yml', 'zeta:a b.yaml', 'zeta:b.json']);
    expect(pins[1]).toMatchObject({ family: 'openapi', license: 'MIT', sha256: SHA, url: `https://raw.githubusercontent.com/o/z/${COMMIT}/a%20b.yaml` });
    expect(rawUrl('o/r', COMMIT, 'd/e.json')).toBe(`https://raw.githubusercontent.com/o/r/${COMMIT}/d/e.json`);
  });

  it('refuses a source without a commit, a family or a hash', () => {
    expect(() => parsePins(bad({ commit: 'main' }))).toThrow(/commit/);
    expect(() => parsePins(bad({ family: 'graphql' }))).toThrow(/family/);
    expect(() => parsePins(bad({ documents: { 'a.json': 'abc' } }))).toThrow(/sha256/);
    expect(() => parsePins('{"sources":{}}')).toThrow(/version/);
  });

  it('diffs a refresh into added, removed and changed', () => {
    const before = file.sources.zeta as PinnedSource;
    const after: PinnedSource = { ...before, documents: { 'b.json': 'c'.repeat(64), 'new.json': SHA } };
    expect(diffSource(before, after)).toEqual({ added: ['new.json'], removed: ['a b.yaml'], changed: ['b.json'] });
    expect(diffSource(undefined, after).added).toEqual(['b.json', 'new.json']);
  });

  it('the committed pin list parses and meets the counts the intent asks for, MCP excepted', () => {
    const pins = expandPins(parsePins(readFileSync(path.join(import.meta.dirname, 'corpus', 'pins.json'), 'utf8')));
    const count = (family: string): number => pins.filter((p) => p.family === family).length;
    expect(count('openapi')).toBeGreaterThanOrEqual(2000);
    expect(count('asyncapi')).toBeGreaterThanOrEqual(30);
    expect(count('jsonschema')).toBeGreaterThanOrEqual(500);
    expect(new Set(pins.map((p) => p.id)).size).toBe(pins.length);
  });
});

describe('sampling', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: `d${String(i).padStart(2, '0')}` }));

  it('is deterministic per seed, sorted, and distinct', () => {
    const a = sample(items, 10, 42);
    expect(sample(items, 10, 42)).toEqual(a);
    expect(a.map((x) => x.id)).toEqual(a.map((x) => x.id).toSorted());
    expect(new Set(a.map((x) => x.id)).size).toBe(10);
    expect(sample(items, 10, 43)).not.toEqual(a);
  });

  it('does not depend on input order, and returns everything without n', () => {
    expect(sample(items.toReversed(), 7, 1)).toEqual(sample(items, 7, 1));
    expect(sample(items, undefined, 1)).toHaveLength(50);
    expect(sample(items, 500, 1)).toHaveLength(50);
  });

  it('seeded() is a stable stream in [0, 1)', () => {
    const r = seeded(1);
    const values = [r(), r(), r()];
    const again = seeded(1);
    expect([again(), again(), again()]).toEqual(values);
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});

describe('type-check attribution', () => {
  it('maps tsc --pretty false lines to the files that failed, relative to the root', () => {
    const output = ['3/types.ts(10,5): error TS2304: Cannot find name', '/w/out/7/types.gen.ts(1,1): error TS1005: x', '  12/a.ts(1,1): warning', 'Found 2 errors.'].join('\n');
    expect([...filesWithErrors(output, '/w/out')]).toEqual(['3/types.ts', '7/types.gen.ts']);
  });

  it('reads a path tsc printed relative to the real working directory, as macOS gives it for /var', () => {
    // The 2026-11-18 readings counted every document as type-checked: tsc ran in /private/var/…/out
    // and printed ../../…/var/…/out/36/types.ts, which matched no folder, so no error was attributed.
    const root = '/var/folders/x/T/run/out';
    const real = '/private/var/folders/x/T/run/out';
    const output = '../../../../../../../../var/folders/x/T/run/out/36/types.ts(150,22): error TS2304: Cannot find name';
    expect([...filesWithErrors(output, root, real)]).toEqual(['36/types.ts']);
    expect([...filesWithErrors('/private/var/folders/x/T/run/out/7/t.ts(1,1): error TS1: x', root, real)]).toEqual(['7/t.ts']);
    expect([...filesWithErrors('C:\\w\\out\\5\\t.ts(1,1): error TS1: x', 'C:/w/out')]).toEqual(['5/t.ts']);
    expect([...filesWithErrors('/elsewhere/a.ts(1,1): error TS1: x', root, real)]).toEqual(['/elsewhere/a.ts']);
  });

  it('errorLine picks the Error line out of a banner and a stack', () => {
    expect(errorLine('✨ openapi-typescript 7.13.0\nfile:///x/redoc.mjs:95\n  throw …\nError: Unsupported Swagger version: 2.x.\n    at f')).toBe('Error: Unsupported Swagger version: 2.x.');
    expect(errorLine('\u001B[31m✘ bad input\u001B[39m')).toBe('✘ bad input');
    expect(errorLine('[Job 1] [1] a.yaml\n[Job 1] ❌ Input file not found:\n/x.json')).toBe('[Job 1] ❌ Input file not found:');
    expect(errorLine('plain')).toBe('plain');
  });
});

describe('summary folding', () => {
  const ours = [row('a', 'ours'), row('b', 'ours', { generate: false, typecheck: { ts59: null, ts60: null, ts70: null }, ms: 5, error: 'boom' }), row('c', 'ours', { typecheck: { ts59: true, ts60: true, ts70: false }, ms: 300 })];
  const theirs = [row('a', 'them', { read: null }), row('b', 'them', { read: null }), row('c', 'them', { read: null, generate: false, typecheck: { ts59: null, ts60: null, ts70: null } })];

  it('counts shares over measured rows and medians over generated ones', () => {
    const folded = foldTool('ours', ours);
    expect(folded.generate).toEqual({ passed: 2, of: 3 });
    expect(folded.typecheck.ts70).toEqual({ passed: 1, of: 3 });
    expect(folded.usable).toEqual({ passed: 1, of: 3 });
    expect(folded.roundtrip).toEqual({ passed: 0, of: 0 });
    expect(folded.medianMs).toBe(200);
    expect(foldTool('them', theirs).read).toEqual({ passed: 0, of: 0 });
  });

  it('lists losing rows both ways', () => {
    expect(disagreements(ours, theirs)).toEqual({ onlyA: [], onlyB: ['b'] });
    const md = renderSummary({ run: 'r', tools: [foldTool('ours', ours), foldTool('them', theirs)], rows: { ours, them: theirs }, subject: 'ours' });
    expect(md).toContain('| ours | 3 | 100.0% (3/3) | 66.7% (2/3) |');
    expect(md).toContain('| them | 3 | — |');
    expect(md).toContain('Usable for them only (where we lose): 1\n\n- `b`');
  });

  it('median handles empty, odd and even', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3);
  });
});

describe('flags and pins of incumbents', () => {
  it('parses --name value, --name=value and bare flags', () => {
    const { flags, positional } = parseFlags(['dir', '--tool', 'ours:types', '--sample=20', '--json']);
    expect(Object.fromEntries(flags)).toEqual({ tool: 'ours:types', sample: '20', json: true });
    expect(positional).toEqual(['dir']);
  });

  it('accepts exact versions only', () => {
    expect(() => assertPinned('openapi-typescript@7.13.0')).not.toThrow();
    expect(() => assertPinned('@hey-api/openapi-ts@0.99.0')).not.toThrow();
    expect(() => assertPinned('typescript@7.1.0-beta')).not.toThrow();
    expect(() => assertPinned('openapi-typescript')).toThrow(/not pinned/);
    expect(() => assertPinned('openapi-typescript@^7')).toThrow(/not pinned/);
  });
});
