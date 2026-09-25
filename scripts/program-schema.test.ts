/**
 * burgee F1 / D-123 — `burgee/program-schema.json` describes what `--schema` prints, and every
 * run proves it: a program that exercises every optional field of the document is validated
 * against the published file with the family's one walker (`flagstaff/src/conforms.ts`).
 *
 * J4 — a commander- or yargs-syntax program that declares one of burgee's reserved surfaces for
 * itself keeps it (the program wins), and its `--schema` names what it shadows in `shadows`.
 * That document is validated against the same file, from each façade.
 *
 * No runtime validator ships (D-123): a program's `--schema` is checked here, where the shape
 * is decided, and the file is published so anyone else can check it where it is read.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- see above
import { Command } from '../packages/burgee/src/commander.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { ExitCode } from '../packages/burgee/src/exit-code.js';
// eslint-disable-next-line import-next/no-relative-packages -- the source, by path, on purpose: the package-name form resolves to `dist/`, which would check the last build rather than the tree
import { defineCommand, defineProgram } from '../packages/burgee/src/index.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import { schemaOf } from '../packages/burgee/src/schema.js';
// eslint-disable-next-line import-next/no-relative-packages -- see above
import yargs from '../packages/burgee/src/yargs.js';
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

/** `--schema` from a commander-syntax program, captured through the seam. */
function commanderSchema(program: Command): Record<string, unknown> {
  let out = '';
  program.parse(['--schema'], { from: 'user', stdout: { write: (s: string) => void (out += s) }, exit: () => undefined });
  return JSON.parse(out) as Record<string, unknown>;
}

/** `--schema` from a yargs-syntax program, captured through the seam. */
function yargsSchema(build: (y: ReturnType<typeof yargs>) => ReturnType<typeof yargs>): Record<string, unknown> {
  let out = '';
  build(yargs(['--schema']).burgee({ stdout: { write: (s: string) => void (out += s) }, exit: () => undefined })).parse();
  return JSON.parse(out) as Record<string, unknown>;
}

/** A commander program that declares all three for itself: `--json` at the root, `--mcp` on a subcommand, a `completion` command. */
function commanderShadowingAll(): Command {
  const program = new Command('tool').option('--json', 'its own');
  program.command('serve').option('--mcp', 'its own').action(() => undefined);
  program.command('completion').action(() => undefined);
  return program;
}

describe('--schema names the reserved surfaces a façade program shadows (J4)', () => {
  it('commander: `--json`, `--mcp` on a subcommand, and a `completion` command', () => {
    expect(commanderSchema(commanderShadowingAll())['shadows']).toEqual(['--json', '--mcp', 'completion']);
  });

  it('yargs: its own `--mcp` option, and yargs\' own `.completion()` under another name', () => {
    expect(yargsSchema((y) => y.option('mcp', { type: 'boolean' }).completion('comp'))['shadows']).toEqual(['--mcp', 'completion']);
  });

  it('yargs: `--json` declared as an alias', () => {
    expect(yargsSchema((y) => y.option('format', { alias: 'json', type: 'boolean' }))['shadows']).toEqual(['--json']);
  });

  it('a program that shadows nothing carries no `shadows` key, on either façade', () => {
    expect([commanderSchema(new Command('tool').option('--verbose')), yargsSchema((y) => y.option('verbose', { type: 'boolean' }))].map((doc) => 'shadows' in doc)).toEqual([false, false]);
  });

  it('the document it prints conforms to burgee/program-schema.json, from each façade', () => {
    const docs = [commanderSchema(commanderShadowingAll()), yargsSchema((y) => y.option('json', { type: 'boolean' }).option('mcp', { type: 'boolean' }).completion())];
    expect(docs.map((doc) => check(doc, published, 'schema'))).toEqual([undefined, undefined]);
  });

  it('the check can fail — the file admits only the three reserved surfaces, and never an empty list', () => {
    const doc = commanderSchema(commanderShadowingAll());
    expect([check({ ...doc, shadows: ['--help'] }, published, 'schema'), check({ ...doc, shadows: [] }, published, 'schema')]).toEqual([
      expect.stringContaining('shadows[0]'),
      expect.stringContaining('shadows'),
    ]);
  });

  it('every top-level field the file describes is emitted by a fixture here', () => {
    const emitted = new Set([...Object.keys(JSON.parse(JSON.stringify(schemaOf(everything()))) as object), ...Object.keys(commanderSchema(commanderShadowingAll()))]);
    expect(Object.keys(published.properties ?? {}).filter((k) => !emitted.has(k))).toEqual([]);
  });
});
