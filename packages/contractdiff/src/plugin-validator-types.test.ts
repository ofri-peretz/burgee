import { execFile } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { draft07, legacy, shop } from './__fixtures__/validate/corpus.js';
import { createHost } from './host.js';
import { builtinAdapters } from './inputs.js';
import { plugin, VALIDATORS_FILE } from './plugin-validator.js';

/**
 * `validators.ts` type-checks as it is written, with no `// @ts-nocheck`, under `strict`, on every
 * TypeScript line the repository holds (5.9, 6.0 and the native 7.0, each its own `tsc`, as
 * `scripts/typescript-matrix.test.ts` runs them), and each validator narrows to the type declared
 * beside it (gap A-20261118-validator-emit-untyped).
 */

const ROOT = join(import.meta.dirname, '../../..');
const VALIDATOR = join(ROOT, 'packages/loadline/src');
const scratch = scratchDirs();

const COMPILERS = [
  ['5.9', 'typescript-5.9'],
  ['6.0', 'typescript'],
  ['7.0', 'typescript-7.0'],
] as const;

/** Every corpus document, the sample, and the two documents that go through the run-time door. */
const DOCUMENTS: readonly (readonly [string, unknown])[] = [
  ['shop', shop],
  ['legacy', legacy],
  ['draft07', draft07],
  ['sample', plugin.generators?.validator?.sample.document],
  ['door', { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Pattern', type: 'string', format: 'regex' }],
  ['mixed', { title: 'T', type: 'string', format: 'regex', $defs: { Plain: { type: 'integer' } } }],
];

/** Code that only type-checks when the validators narrow to their types, and the types say what the documents say. */
const USE = `import { CreateOrderBody, ListTreesResponse200, operations } from './shop.ts';
import { ListPetsResponse200 } from './sample.ts';
import { PatternValue } from './door.ts';

declare const value: unknown;
if (CreateOrderBody(value)) {
  const id: string = value.id;
  const qty: number = value.qty;
  const status: 'open' | 'paid' = value.status;
  void [id, qty, status, value.tree?.children?.[0]?.value];
}
if (ListPetsResponse200(value)) for (const pet of value) void pet.id.toUpperCase();
if (PatternValue(value)) void value.length;
if (operations.listTrees['response:200:application/json'](value)) void (value satisfies ListTreesResponse200);
// @ts-expect-error -- narrowed to a list of pets, which has no \`id\` of its own
if (ListPetsResponse200(value)) void value.id;
`;

/**
 * tsc's diagnostics, or '' when it ran clean. A compiler that did not start fails the test: its
 * error carries no stdout, and `String(undefined)` is not ''.
 */
const tsc = async (dir: string, cwd: string): Promise<string> => {
  try {
    await promisify(execFile)(process.execPath, [join(ROOT, 'node_modules', dir, 'bin', 'tsc'), '-p', cwd], { cwd, encoding: 'utf8' });
    return '';
  } catch (error) {
    return String((error as { stdout?: unknown }).stdout);
  }
};

describe('validators.ts type-checks under strict', () => {
  let dir = '';

  beforeAll(async () => {
    dir = scratch('apicontract-validator-types-');
    const host = createHost();
    host.register({ name: 'contractdiff', adapters: builtinAdapters });
    host.register(plugin);
    const written = await Promise.all(DOCUMENTS.map(async ([name, document]) => [name, (await host.run('validator', document)).files] as const));
    for (const [name, [file]] of written) {
      expect(file?.path).toBe(VALIDATORS_FILE);
      expect(file?.content).not.toContain('@ts-nocheck');
      writeFileSync(join(dir, `${name}.ts`), file?.content ?? '');
    }
    writeFileSync(join(dir, 'use.ts'), USE);
    const compilerOptions = {
      strict: true,
      noEmit: true,
      target: 'esnext',
      module: 'esnext',
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      skipLibCheck: true,
      types: [],
      // The run-time door imports the validator package: this checkout's source stands for it.
      paths: { loadline: [join(VALIDATOR, 'index.ts')], 'loadline/json-schema': [join(VALIDATOR, 'json-schema.ts')] },
    };
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions, files: [...DOCUMENTS.map(([name]) => `${name}.ts`), 'use.ts'] }));
  });

  it.each(COMPILERS)('under TypeScript %s', { timeout: 120_000 }, async (_, compiler) => {
    expect(await tsc(compiler, dir)).toBe('');
  });
});
