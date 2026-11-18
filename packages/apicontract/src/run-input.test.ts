import { mkdirSync, writeFileSync } from 'node:fs';
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
    // No overlays: the document is not handed to `apply` at all.
    expect(readInput({ root, file: 'c.json', input: 'spec.yaml', overlays: [] }, apply)).toEqual({ openapi: '3.1.0' });
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

  it("applies the config's overlays with input-overlay.ts by default", () => {
    const root = temp();
    writeFileSync(join(root, 'spec.yaml'), 'openapi: 3.1.0\ninfo: { title: before, version: 1.0.0 }\npaths: {}\n');
    writeFileSync(join(root, 'o.yaml'), "overlay: 1.0.0\ninfo: { title: rename, version: 1.0.0 }\nactions:\n  - target: '$.info'\n    update: { title: after }\n");
    expect(readInput({ root, file: '/c.json', input: 'spec.yaml', overlays: ['o.yaml'] })).toMatchObject({ info: { title: 'after' } });
  });
});

const overlaid = (document: unknown): unknown => ({ ...(document as object), info: { title: 'overlaid' } });

describe('readInput, over files that refer to each other', () => {
  it('bundles the files the spec names, relative to the spec, after the overlays', () => {
    const root = temp();
    mkdirSync(join(root, 'api'));
    writeFileSync(join(root, 'api', 'spec.yaml'), 'openapi: 3.1.0\ncomponents:\n  schemas:\n    A:\n      $ref: ./part.yaml\n');
    writeFileSync(join(root, 'api', 'part.yaml'), 'type: string\n');
    writeFileSync(join(root, 'one.yaml'), 'overlay: 1\n');
    expect(readInput({ root, file: 'c.json', input: 'api/spec.yaml', overlays: ['one.yaml'] }, overlaid)).toEqual({
      openapi: '3.1.0',
      info: { title: 'overlaid' },
      components: { schemas: { A: { $ref: '#/components/schemas/part' }, part: { type: 'string' } } },
    });
  });

  it('refuses a spec whose sibling is not there, naming the file', () => {
    const root = temp();
    writeFileSync(join(root, 'spec.yaml'), 'swagger: "2.0"\ndefinitions:\n  A:\n    $ref: ./loadBalancer.json#/definitions/LoadBalancer\n');
    expect(() => readInput({ root, file: 'c.json', input: 'spec.yaml', overlays: [] })).toThrow(
      'fix: add loadBalancer.json next to spec.yaml, or replace the `$ref` with what it names',
    );
  });
});
