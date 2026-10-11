/**
 * `--schema`'s rarer fields, each asserted where it lands: a positional's default, choices on
 * a repeatable option, a lazy command, a plugin's command — and the summary a program over its
 * budget prints, which dropped every declared `summary` until this file.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram } from './execute.js';
import { Manifest } from './manifest.js';
import { definePlugin } from './plugin.js';
import { commandSchemaOf, inputSchemaOf, summaryOf } from './schema.js';
import { runBurgee } from './testing.js';

describe('a command’s input schema', () => {
  it('publishes a positional’s default', () => {
    const schema = inputSchemaOf({ path: ['app', 'x'], options: {}, arguments: [{ name: 'dir', required: false, default: '.' }] });
    expect(schema.properties['dir']).toEqual({ type: 'string', default: '.' });
    expect(schema.required).toEqual([]);
  });
  it('puts the choices of a repeatable option on its items, not on the array', () => {
    const schema = inputSchemaOf({ path: ['app', 'x'], options: { tag: { type: 'string', multiple: true, choices: ['a', 'b'] } } });
    expect(schema.properties['tag']).toEqual({ type: 'array', items: { type: 'string', enum: ['a', 'b'] }, flag: '--tag' });
  });
});

describe('a command’s schema says where it comes from', () => {
  it('marks a lazy command, whose module has not loaded', () => {
    const node = { path: ['app', 'later'], options: {}, effects: 'read_only' as const, load: async () => ({ run: () => undefined }) };
    expect(commandSchemaOf(node, ['app'])).toMatchObject({ name: 'later', lazy: true });
    expect(commandSchemaOf({ path: ['app', 'now'], options: {} }, ['app'])).not.toHaveProperty('lazy');
  });
  it('names the plugin that contributed it', () => {
    const m = new Manifest();
    m.rootPath = ['app'];
    m.use(definePlugin({ name: 'audit', commands: [{ path: ['app', 'audit'], options: {}, effects: 'read_only', run: () => undefined }] }));
    expect(commandSchemaOf(m.find(['app', 'audit']) as never, ['app'])).toMatchObject({ name: 'audit', plugin: 'audit' });
  });
});

describe('the summary over budget (N13)', () => {
  const program = defineProgram({
    name: 'app',
    version: '2.0.0',
    description: 'An app',
    commands: [
      defineCommand({ name: 'listed', summary: 'Short line', description: 'The long description', effects: 'read_only', run: () => undefined }),
      defineCommand({ name: 'described', description: 'Only a description', effects: 'read_only', run: () => undefined }),
      defineCommand({ name: 'bare', effects: 'read_only', run: () => undefined }),
    ],
  });

  it('lists each command by its summary, falling back to its description, and neither when it has none', () => {
    expect(summaryOf(program, 10).commands).toStrictEqual([
      { name: 'listed', summary: 'Short line', effects: 'read_only' },
      { name: 'described', summary: 'Only a description', effects: 'read_only' },
      { name: 'bare', effects: 'read_only' },
    ]);
  });
  it('carries the program’s version and description', () => {
    expect(summaryOf(program, 10)).toMatchObject({ name: 'app', version: '2.0.0', description: 'An app' });
  });
  it('names no effects a façade command did not declare, and no version or description a program lacks', () => {
    const m = new Manifest();
    m.rootPath = ['f'];
    m.add({ path: ['f', 'x'], options: {}, run: () => undefined });
    const summary = summaryOf(m, 10);
    expect(summary.commands).toStrictEqual([{ name: 'x' }]);
    expect(summary).not.toHaveProperty('version');
    expect(summary).not.toHaveProperty('description');
  });
});

/**
 * clispec-conformance R5 — a command's declared `output` (and its `fields`) become clispec's
 * `output_kind`, `cardinality`, `media_type` and `stdout_schema`. `stdout_schema` is what
 * `--json` prints: the envelope, with the declared result as its `data`.
 */
/** What `--json` prints on success, with `data` as the declared result. */
const envelope = (data: unknown): unknown => ({ type: 'object', properties: { ok: { const: true }, data, meta: { type: 'object' } }, required: ['ok', 'data'] });

describe('a command’s declared output, as --schema publishes it (R5)', () => {
  const program = defineProgram({
    name: 'app',
    commands: [
      defineCommand({ name: 'typed', effects: 'read_only', output: { cardinality: 'single', schema: { type: 'string' } }, run: () => 'x' }),
      defineCommand({ name: 'one', effects: 'read_only', fields: ['id', 'size'], output: { cardinality: 'single' }, run: () => ({ id: 'a', size: 1 }) }),
      defineCommand({ name: 'undeclared', effects: 'read_only', fields: ['id'], run: () => ({ id: 'a' }) }),
      defineCommand({ name: 'many', effects: 'read_only', fields: ['id'], output: { kind: 'data', cardinality: 'bounded' }, run: () => [{ id: 'a' }] }),
      defineCommand({ name: 'script', effects: 'read_only', output: { kind: 'opaque', mediaType: 'text/x-shellscript', schema: { type: 'string' } }, run: () => 'echo' }),
      defineCommand({ name: 'tail', effects: 'read_only', output: { kind: 'stream' }, run: () => 'line' }),
      defineCommand({ name: 'silent', effects: 'read_only', run: () => 'x' }),
    ],
  });

  it('turns each declaration into clispec’s keys, and says nothing it was not told', async () => {
    const commands = (JSON.parse((await runBurgee(program, { argv: ['--schema'] })).stdout) as { commands: Record<string, unknown>[] }).commands;
    const by = (name: string): Record<string, unknown> => commands.find((c) => c['name'] === name) ?? {};
    expect(by('typed')).toMatchObject({ cardinality: 'single', stdout_schema: envelope({ type: 'string' }) });
    expect(by('typed')).not.toHaveProperty('output_kind');
    // `fields` name the keys; their types are not declared, so none is claimed.
    expect(by('one')['stdout_schema']).toEqual(envelope({ type: 'object', properties: { id: {}, size: {} } }));
    expect(by('undeclared')['stdout_schema']).toEqual(envelope({ type: 'object', properties: { id: {} } }));
    expect(by('many')).toMatchObject({ output_kind: 'data', cardinality: 'bounded', stdout_schema: envelope({ type: 'array', items: { type: 'object', properties: { id: {} } } }) });
    // Opaque bytes name their media type and carry no shape (clispec forbids one).
    expect(by('script')).toMatchObject({ output_kind: 'opaque', media_type: 'text/x-shellscript' });
    expect(by('script')).not.toHaveProperty('stdout_schema');
    expect(by('tail')).toMatchObject({ output_kind: 'stream' });
    for (const key of ['output_kind', 'cardinality', 'media_type', 'stdout_schema', 'output_fields']) expect(by('silent')).not.toHaveProperty(key);
    // The completion command the engine serves is a script: opaque, plain text.
    expect(by('completion')).toMatchObject({ output_kind: 'opaque', media_type: 'text/plain' });
  });

  it('is in `--help --json` too, the same shape as `--schema` (F2)', async () => {
    const help = JSON.parse((await runBurgee(program, { argv: ['many', '--help', '--json'] })).stdout) as Record<string, unknown>;
    expect(help).toMatchObject({ output_kind: 'data', cardinality: 'bounded' });
  });
});
