/** F1 / N8 / N9 — the program as data, from the manifest alone. */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCommand } from './execute.js';
import { defineCommand, defineProgram } from './index.js';
import { Manifest } from './manifest.js';
import { schemaOf } from './schema-entry.js';
import { runBurgee } from './testing.js';

const program = defineProgram({
  name: 'app',
  version: '1.2.3',
  description: 'Fixture',
  commands: [
    defineCommand({
      name: 'deploy',
      description: 'Ship a build',
      effects: 'non_idempotent',
      arguments: [{ name: 'target', required: true }, { name: 'files', variadic: true, required: false }],
      options: {
        region: { type: 'string', choices: ['eu', 'us'], default: 'eu', description: 'the region', env: 'APP_REGION' },
        force: { type: 'boolean', short: 'f' },
        token: { type: 'string', hidden: true },
        name: { type: 'string', required: true },
      },
      examples: [{ command: 'app deploy prod' }],
      run: () => 'ok',
    }),
    defineCommand({ name: 'status', effects: 'read_only', run: () => 'fine' }),
    defineCommand({ name: 'secret', hidden: true, effects: 'withheld', run: () => 'x' }),
  ],
});

describe('--schema', () => {
  it('is the manifest as data: name, version, commands with arguments, options, effects, examples', () => {
    const schema = schemaOf(program);
    expect(schema).toMatchObject({ schemaVersion: 1, name: 'app', version: '1.2.3', description: 'Fixture' });
    expect(schema.commands.map((c) => c.name)).toEqual(['deploy', 'status']);
    const deploy = schema.commands[0];
    expect(deploy?.effects).toBe('non_idempotent');
    expect(deploy?.examples).toEqual([{ command: 'app deploy prod' }]);
  });

  it('carries choices, defaults and requiredness as data in a JSON Schema per command (N9)', () => {
    const { inputSchema } = schemaOf(program).commands[0] ?? { inputSchema: undefined };
    expect(inputSchema).toMatchObject({
      type: 'object',
      properties: {
        target: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        region: { type: 'string', enum: ['eu', 'us'], default: 'eu', description: 'the region' },
        force: { type: 'boolean' },
        name: { type: 'string' },
      },
      required: ['target', 'name'],
      additionalProperties: false,
    });
    expect(inputSchema?.properties['token']).toBeUndefined();
  });

  it('omits hidden commands and never lists a group as a command', () => {
    expect(schemaOf(program).commands.some((c) => c.name === 'secret')).toBe(false);
  });

  it('is served by every program with no config, no network and no handler run (N8)', async () => {
    const r = await runBurgee(program, { argv: ['--schema'], env: {} });
    expect(r.code).toBe(0);
    // The native surface adds where to ask for a value's source (D-20261009-b1-totals-and-explain),
    // the `completion` command the engine serves (agent-lint-conformance R5), last, and the error
    // kinds (clispec-conformance R2), which `define-error.test.ts` reads row by row.
    // And the clispec keys (clispec-conformance R1–R5), which this file's `the clispec keys` block reads.
    const { clispec, global_args: globalArgs, output, ...native } = JSON.parse(r.stdout) as ReturnType<typeof schemaOf> & { errors: unknown[]; clispec: string; global_args: unknown[]; output: unknown };
    expect([clispec, globalArgs.length > 0, output]).toEqual(['0.3', true, expect.objectContaining({ piped: 'text' })]);
    expect(native.errors.length).toBeGreaterThan(0);
    const commands = (native.commands.slice(0, -1) as (ReturnType<typeof schemaOf>['commands'][number] & { example?: unknown })[]).map(({ example: _e, ...rest }) => rest);
    expect({ ...native, commands }).toEqual({ ...schemaOf(program), explain: '--explain <option> on a command says where its value came from: default, env, config or flag', errors: native.errors });
    expect(native.commands.at(-1)?.name).toBe('completion');
    // Naming a command drills into it (N13): that command's schema alone.
    const later = await runBurgee(program, { argv: ['deploy', '--schema'], env: {} });
    expect(JSON.parse(later.stdout)).toEqual({ ...schemaOf(program).commands[0], example: { args: ['deploy', 'prod'] } });
  });

  it('lists the completion command the engine serves, read-only, taking a shell (agent-lint-conformance R5)', async () => {
    const r = await runBurgee(program, { argv: ['--schema'], env: {} });
    const completion = (JSON.parse(r.stdout) as { commands: { name: string; effects?: string; arguments: { name: string }[] }[] }).commands.find((c) => c.name === 'completion');
    expect(completion).toMatchObject({ name: 'completion', effects: 'read_only', arguments: [{ name: 'shell', required: true }] });
    // Drilled into like any other command, to a field too, and absent when the program declares its own.
    expect(JSON.parse((await runBurgee(program, { argv: ['completion', '--schema'], env: {} })).stdout)).toEqual(completion);
    expect(JSON.parse((await runBurgee(program, { argv: ['completion', '--schema', '--field', 'effects'], env: {} })).stdout)).toBe('read_only');
    expect((await runBurgee(program, { argv: ['--schema', '--field', 'effects'], env: {} })).code).toBe(2);
    const own = defineProgram({ name: 'own', commands: [defineCommand({ name: 'completion', description: 'mine', effects: 'withheld', run: () => 'x' })] });
    const listed = (JSON.parse((await runBurgee(own, { argv: ['--schema'], env: {} })).stdout) as { commands: { name: string; description?: string }[] }).commands;
    expect(listed).toEqual([expect.objectContaining({ name: 'completion', description: 'mine' })]);
  });

  it('reserves --schema and --mcp like --json and --help (V5)', () => {
    expect(() => defineCommand({ name: 'x', options: { schema: { type: 'boolean' } } })).toThrow(/reserved/);
    expect(() => defineCommand({ name: 'x', options: { mcp: { type: 'boolean' } } })).toThrow(/reserved/);
  });
});

/** The program's `--schema`, as `run()` prints it. */
async function native(manifest: Manifest, argv: string[] = ['--schema']): Promise<Record<string, unknown> & { commands: Record<string, unknown>[] }> {
  return JSON.parse((await runBurgee(manifest, { argv, env: {} })).stdout) as Record<string, unknown> & { commands: Record<string, unknown>[] };
}

describe('the clispec keys (clispec-conformance)', () => {
  it('R1 — says it is clispec 0.3, right after the version burgee keys on', async () => {
    const doc = await native(program);
    expect(Object.keys(doc).slice(0, 2)).toEqual(['schemaVersion', 'clispec']);
    expect(doc['clispec']).toBe('0.3');
    expect(doc['version']).toBe('1.2.3');
  });

  it('R1 — always carries a version: the owning package.json’s when the program declares none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'burgee-clispec-version-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'owned', version: '9.8.7' }));
      const bare = defineProgram({ name: 'owned', commands: [defineCommand({ name: 'go', effects: 'read_only', run: () => 'ok' })] });
      const doc = JSON.parse((await runCommand(bare, ['--schema'], { entry: join(dir, 'cli.mjs') })).stdout) as Record<string, unknown>;
      expect(doc['version']).toBe('9.8.7');
      // With no version anywhere there is none to publish, and none is invented.
      expect(JSON.parse((await runCommand(bare, ['--schema'], { entry: '/' })).stdout)).not.toHaveProperty('version');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('R3 — global_args are root help’s `Global options:` rows, name for name', async () => {
    const help = (await runBurgee(program, { argv: ['--help'], env: {} })).stdout;
    const section = help.slice(help.indexOf('Global options:'), help.indexOf('\n\n', help.indexOf('Global options:')));
    // The row's own flag, first on its line: a description may name another (`the same as --color=never`).
    const shown = [...section.matchAll(/^ {2}(?:-\w, )?--([\w-]+)/gmu)].map((m) => m[1]);
    const globals = (await native(program))['global_args'] as { name: string }[];
    expect(globals.map((g) => g.name)).toEqual(shown);
    expect(globals).toContainEqual({ name: 'color', type: 'string', description: expect.any(String) as string, enum: ['always', 'never', 'auto'], default: 'auto' });
    expect(globals).toContainEqual({ name: 'quiet', type: 'boolean', short: '-q', description: expect.any(String) as string });
    expect(globals).toContainEqual({ name: 'timeout', type: 'string', description: expect.stringMatching(/^end the run after this long/) as string });
  });

  it('R3 — a program with no root node lists what its root help does: the three it always has', async () => {
    const bare = new Manifest();
    bare.rootPath = ['bare'];
    bare.add({ path: ['bare', 'x'], options: {}, effects: 'read_only', run: () => 'x' });
    expect(((await native(bare))['global_args'] as { name: string }[]).map((g) => g.name)).toEqual(['json', 'help', 'schema']);
  });

  it('R4 — each command carries its first example as the arguments clispec’s probe runs', async () => {
    const quoted = defineProgram({
      name: 'app',
      commands: [
        defineCommand({ name: 'say', effects: 'read_only', examples: [{ command: `app say "two words" 'and more' --loud` }, { command: 'app say later' }], run: () => 'x' }),
        defineCommand({ name: 'bare', effects: 'read_only', examples: [{ command: 'bare --flag' }], run: () => 'x' }),
        defineCommand({ name: 'plain', effects: 'read_only', run: () => 'x' }),
      ],
    });
    const [say, bare, plain] = (await native(quoted)).commands;
    expect(say?.['example']).toEqual({ args: ['say', 'two words', 'and more', '--loud'] });
    // A line that does not start with the program's name is taken whole.
    expect(bare?.['example']).toEqual({ args: ['bare', '--flag'] });
    expect(plain).not.toHaveProperty('example');
    // Drilled into, the command carries it too.
    expect((await native(quoted, ['say', '--schema']))['example']).toEqual({ args: ['say', 'two words', 'and more', '--loud'] });
  });

  it('over its budget, the summary keeps errors and the version and claims no clispec conformance', async () => {
    const tight = defineProgram({ name: 'app', version: '1.0.0', schemaBudget: 10, commands: [defineCommand({ name: 'go', effects: 'read_only', run: () => 'ok' })] });
    const doc = await native(tight);
    expect(doc).toMatchObject({ summarised: true, version: '1.0.0', errors: expect.any(Array) as unknown[] });
    expect(doc).not.toHaveProperty('clispec');
    expect(doc).not.toHaveProperty('global_args');
  });
});

/**
 * `localised-human-surfaces` R5 — `--schema` is a machine document: a localised description is
 * published in the author's base language, whatever the locale (R3).
 */
describe('--schema carries the base language of a localised description (R5)', () => {
  const tool = defineProgram({
    name: 'tool',
    description: { en: 'A tool', de: 'Ein Werkzeug' },
    commands: [
      defineCommand({
        name: 'deploy',
        description: { en: 'Deploy the site', de: 'Die Seite bereitstellen' },
        summary: { en: 'deploy it', de: 'bereitstellen' },
        effects: 'non_idempotent',
        examples: [{ command: 'tool deploy', description: { en: 'go', de: 'los' } }],
        options: { dryRun: { type: 'boolean', description: { en: 'change nothing', de: 'nichts ändern' } } },
        run: () => 'ok',
      }),
    ],
  });

  it('under LANG=de_DE.UTF-8, byte for byte the LANG=C document, with every description in English', async () => {
    const german = await runCommand(tool, ['--schema'], { env: { LANG: 'de_DE.UTF-8' } });
    expect(german.stdout).toBe((await runCommand(tool, ['--schema'], { env: { LANG: 'C' } })).stdout);
    expect(german.stdout).toContain('"Deploy the site"');
    expect(german.stdout).toContain('"change nothing"');
    expect(german.stdout).not.toMatch(/Werkzeug|bereitstellen|ändern|"los"/u);
  });
});
