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
