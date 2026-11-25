/**
 * clispec's keys (`clispec.ts`) as data: no key for what a command or a global flag leaves
 * undeclared, and an example's program name stripped only when every word of it is there.
 */
import { describe, expect, it } from 'vitest';

import { commandKeysOf, exampleOf, globalArgsOf } from './clispec.js';
import { type CommandNode } from './manifest.js';

import { defineCommand, defineProgram } from './index.js';

const ok = (): string => 'ok';
const node = (extra: Partial<CommandNode> = {}): CommandNode => ({ path: ['app', 'go'], options: {}, ...extra }) as CommandNode;

describe('clispec keys', () => {
  it('writes no key a command leaves undeclared', () => {
    expect(Object.keys(commandKeysOf(node(), ['app']))).toEqual([]);
    expect(Object.keys(commandKeysOf(node({ output: { kind: 'opaque' } } as never), ['app']))).toEqual(['output_kind']);
  });

  it('strips the program name from an example only when all of its words lead', () => {
    const examples = [{ command: 'git status --short' }];
    expect(exampleOf(node({ examples }), ['git', 'remote'])).toEqual({ args: ['git', 'status', '--short'] });
    expect(exampleOf(node({ examples: [{ command: 'git remote add x' }] }), ['git', 'remote'])).toEqual({ args: ['add', 'x'] });
  });

  it('gives a global flag a short key only when it has one', () => {
    const program = defineProgram({ name: 'app', commands: [defineCommand({ name: 'go', effects: 'read_only', run: ok })] });
    const json = globalArgsOf(program).find((a) => a.name === 'json');
    expect(json).toBeDefined();
    expect(Object.keys(json as object)).not.toContain('short');
  });
});
