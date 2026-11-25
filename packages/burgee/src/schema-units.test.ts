/**
 * The schema documents (`schema.ts`) key by key: what an option's property carries, which keys a
 * command passes through, and the summary's fixed fields, for a root of more than one word too.
 */
import { describe, expect, it } from 'vitest';

import { type CommandNode } from './manifest.js';
import { Manifest } from './schema-entry.js';
import { commandSchemaOf, inputSchemaOf, schemaOf, summaryOf } from './schema.js';

const ok = (): string => 'ok';

const go = {
  path: ['git', 'remote', 'go'],
  run: ok,
  effects: 'read_only',
  summary: 'go briefly',
  description: 'go at length',
  aliases: ['g'],
  deprecated: 'went',
  group: 'Moving:',
  options: {
    ratio: { type: 'number' },
    count: { type: 'number', integer: true },
    seed: { type: 'string', required: true, default: 'x' },
    must: { type: 'string', required: true },
    lone: { type: 'string', dependsOn: [], exclusive: [] },
  },
} as unknown as CommandNode;

const manifest = new Manifest();
manifest.add(go);
manifest.rootPath = ['git', 'remote'];

describe('the schema documents', () => {
  it('types a number by whether it is an integer', () => {
    const { properties } = inputSchemaOf(go);
    expect(properties['ratio']).toMatchObject({ type: 'number' });
    expect(properties['count']).toMatchObject({ type: 'integer' });
  });

  it('publishes no dependsOn or exclusive for an empty list', () => {
    const lone = inputSchemaOf(go).properties['lone'];
    expect(lone).not.toHaveProperty('dependsOn');
    expect(lone).not.toHaveProperty('exclusive');
  });

  it('requires a required option only when it has no default', () => {
    expect(inputSchemaOf(go).required).toEqual(['must']);
  });

  it('passes the declared keys through, and no examples as none', () => {
    expect(commandSchemaOf(go, ['git', 'remote'])).toMatchObject({
      name: 'go',
      summary: 'go briefly',
      description: 'go at length',
      aliases: ['g'],
      deprecated: 'went',
      group: 'Moving:',
      examples: [],
    });
  });

  it('carries no key for what the command left undeclared', () => {
    expect(Object.keys(commandSchemaOf(go, ['git', 'remote']))).toEqual([
      'name',
      'arguments',
      'options',
      'examples',
      'inputSchema',
      'description',
      'summary',
      'aliases',
      'effects',
      'deprecated',
      'group',
    ]);
  });

  it('names a root of two words with a space, in the document and the summary', () => {
    expect(schemaOf(manifest)).toMatchObject({ schemaVersion: 1, name: 'git remote' });
    expect(summaryOf(manifest, 10)).toMatchObject({
      schemaVersion: 1,
      name: 'git remote',
      summarised: true,
      budget: 10,
      commands: [{ name: 'go', summary: 'go briefly', effects: 'read_only' }],
      hint: 'run `git remote <command> --schema` for one command in full',
    });
  });
});
