/** F1 / N8 / N9 — the program as data, from the manifest alone. */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, schemaOf } from './index.js';
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
    defineCommand({ name: 'secret', hidden: true, run: () => 'x' }),
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
    expect(JSON.parse(r.stdout)).toEqual(schemaOf(program));
    const later = await runBurgee(program, { argv: ['deploy', '--schema'], env: {} });
    expect(JSON.parse(later.stdout)).toEqual(schemaOf(program));
  });

  it('reserves --schema and --mcp like --json and --help (V5)', () => {
    expect(() => defineCommand({ name: 'x', options: { schema: { type: 'boolean' } } })).toThrow(/reserved/);
    expect(() => defineCommand({ name: 'x', options: { mcp: { type: 'boolean' } } })).toThrow(/reserved/);
  });
});
