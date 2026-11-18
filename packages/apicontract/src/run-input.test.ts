import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { readDocument, readInput } from './run-input.js';


const scratch = scratchDirs();
const temp = (): string => scratch('apicontract-input-');

const refusal = (attempt: () => unknown): string => {
  try {
    attempt();
  } catch (error) {
    expect((error as { code?: unknown }).code).toBe('CONFIG');
    return (error as Error).message;
  }
  throw new Error('expected a config error');
};

describe('readDocument', () => {
  it('reads JSON by its extension and YAML otherwise', () => {
    const root = temp();
    writeFileSync(join(root, 'a.json'), '{"openapi":"3.1.0"}');
    writeFileSync(join(root, 'a.yaml'), 'openapi: 3.1.0\n');
    expect(readDocument(join(root, 'a.json'), 'c.json')).toEqual({ openapi: '3.1.0' });
    expect(readDocument(join(root, 'a.yaml'), 'c.json')).toEqual({ openapi: '3.1.0' });
  });

  it('refuses a file that is missing, and one that does not parse', () => {
    const root = temp();
    expect(refusal(() => readDocument(join(root, 'no.yaml'), '/c.json'))).toBe(`/c.json cannot be used:\n  - ${join(root, 'no.yaml')} does not exist. fix: point \`input\` at the spec, relative to the config`);
    writeFileSync(join(root, 'bad.json'), 'openapi: 3.1.0');
    expect(refusal(() => readDocument(join(root, 'bad.json'), '/c.json'))).toMatch(/bad\.json is not JSON or YAML \(.+\)\. fix: correct the file, or point `input` at another$/u);
    writeFileSync(join(root, 'bad.yaml'), 'a: [\n');
    expect(refusal(() => readDocument(join(root, 'bad.yaml'), '/c.json'))).toContain('bad.yaml is not JSON or YAML');
  });
});

const apply = (document: unknown, overlays: readonly unknown[]): unknown => ({ document, overlays });

describe('readInput', () => {
  it('reads the input relative to the config folder', () => {
    const root = temp();
    writeFileSync(join(root, 'spec.yaml'), 'openapi: 3.1.0\n');
    expect(readInput({ root, file: 'c.json', input: 'spec.yaml', overlays: [] }, undefined)).toEqual({ openapi: '3.1.0' });
  });

  it('applies the overlays in order, each read relative to the config folder', () => {
    const root = temp();
    writeFileSync(join(root, 'spec.yaml'), 'openapi: 3.1.0\n');
    writeFileSync(join(root, 'one.yaml'), 'overlay: 1\n');
    writeFileSync(join(root, 'two.json'), '{"overlay":2}');
    expect(readInput({ root, file: 'c.json', input: 'spec.yaml', overlays: ['one.yaml', 'two.json'] }, apply)).toEqual({
      document: { openapi: '3.1.0' },
      overlays: [{ overlay: 1 }, { overlay: 2 }],
    });
  });

  it('refuses overlays while nothing can apply them, rather than reading without them', () => {
    const root = temp();
    writeFileSync(join(root, 'spec.yaml'), 'openapi: 3.1.0\n');
    expect(refusal(() => readInput({ root, file: '/c.json', input: 'spec.yaml', overlays: ['o.yaml'] }, undefined))).toBe(
      '/c.json cannot be used:\n  - `overlays` are not supported by this apicontract yet. fix: remove `overlays`, or apply them to the spec before `gen`',
    );
    // The default is input-overlay.ts's own, which is a stub until its lane lands.
    expect(refusal(() => readInput({ root, file: '/c.json', input: 'spec.yaml', overlays: ['o.yaml'] }))).toContain('`overlays` are not supported');
  });
});
