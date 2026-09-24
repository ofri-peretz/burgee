/**
 * burgee F1 / D-123 — `burgee/program-schema.json` describes what `--schema` prints, and every
 * run proves it: a program that exercises every optional field of the document is validated
 * against the published file with the family's one walker (`flagstaff/src/conforms.ts`).
 *
 * No runtime validator ships (D-123): a program's `--schema` is checked here, where the shape
 * is decided, and the file is published so anyone else can check it where it is read.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- see above
import { ExitCode } from '../packages/burgee/src/exit-code.js';
// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { defineCommand, defineProgram } from '../packages/burgee/src/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { schemaOf } from '../packages/burgee/src/schema.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { check, type Root } from '../packages/flagstaff/src/conforms.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const published = JSON.parse(readFileSync(join(root, 'packages/burgee/src/program-schema.json'), 'utf8')) as Root & { $defs: Record<string, { properties?: Record<string, unknown> }> };

/** Every optional field `--schema` can emit, on one program. */
function everything(): ReturnType<typeof defineProgram> {
  const program = defineProgram({
    name: 'full',
    version: '2.0.0',
    description: 'Exercises every field',
    commands: [
      defineCommand({
        name: 'deploy',
        description: 'Ship a build',
        summary: 'ship',
        group: 'Release',
        deprecated: 'release',
        arguments: [
          { name: 'target', description: 'where', required: true },
          { name: 'extra', variadic: true, required: false },
        ],
        options: {
          region: { type: 'string', description: 'where to', choices: ['eu', 'us'], default: 'eu', env: 'FULL_REGION', short: 'r', placeholder: 'name' },
          replicas: { type: 'number', minimum: 1, maximum: 9, integer: true },
          tags: { type: 'string', multiple: true, separator: ',' },
          dry: { type: 'boolean', hidden: true, deprecated: '--no-apply' },
          a: { type: 'boolean', exclusive: ['b'] },
          b: { type: 'boolean', dependsOn: ['region'] },
        },
        relations: [{ atMostOneOf: ['a', 'b'] }],
        examples: [{ command: 'full deploy prod', description: 'to prod' }],
        effects: 'non_idempotent',
        run: () => 'ok',
      }),
      defineCommand({ name: 'status', effects: 'read_only', load: async () => ({ run: () => 'fine' }) }),
    ],
  });
  program.use({ name: 'extra', contract: 1, commands: [{ path: ['full', 'ping'], options: {}, effects: 'withheld', run: () => 'pong' }] });
  return program;
}

describe('burgee/program-schema.json describes `--schema` (F1, D-123)', () => {
  const doc = JSON.parse(JSON.stringify(schemaOf(everything()))) as Record<string, unknown> & { commands: Record<string, unknown>[] };

  it('the check can fail — a key the file does not describe is refused', () => {
    expect(check({ ...doc, surprise: true }, published, 'schema')).toContain('surprise');
  });

  it('accepts the document a program with every optional field prints', () => {
    expect(check(doc, published, 'schema')).toBeUndefined();
  });

  it('carries the exit-code table, so a caller branches on the number (F1)', () => {
    expect(doc['exitCodes']).toEqual(ExitCode);
  });

  it('the fixture really does exercise every command field the file describes', () => {
    const emitted = new Set(doc.commands.flatMap((c) => Object.keys(c)));
    const described = Object.keys(published.$defs['command']?.properties ?? {});
    // `fields` arrives with N14; everything else must be on the fixture, or this test proves less than it says.
    expect(described.filter((k) => !emitted.has(k) && k !== 'fields')).toEqual([]);
  });
});
