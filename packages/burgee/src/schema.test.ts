/** F1 / N8 / N9 — the program as data, from the manifest alone. */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './index.js';
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
    // and the `completion` command the engine serves (agent-lint-conformance R5), last.
    const native = JSON.parse(r.stdout) as ReturnType<typeof schemaOf>;
    expect({ ...native, commands: native.commands.slice(0, -1) }).toEqual({ ...schemaOf(program), explain: '--explain <option> on a command says where its value came from: default, env, config or flag' });
    expect(native.commands.at(-1)?.name).toBe('completion');
    // Naming a command drills into it (N13): that command's schema alone.
    const later = await runBurgee(program, { argv: ['deploy', '--schema'], env: {} });
    expect(JSON.parse(later.stdout)).toEqual(schemaOf(program).commands[0]);
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
