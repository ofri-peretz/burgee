/**
 * Completion scripts for the programs completions.test.ts's fixture is not: one with no root
 * node (a façade that registered only subcommands), one with no name at all, and a camelCase
 * option with choices in PowerShell — whose value table was keyed by the declared name,
 * `--outputFormat`, while every other table and the parser use the typed one.
 */
import { describe, expect, it } from 'vitest';

import { completionTree, renderCompletion, renderFigSpec } from './completions.js';
import { defineCommand, defineProgram } from './execute.js';
import { Manifest } from './manifest.js';

const rootless = (): Manifest => {
  const m = new Manifest();
  m.rootPath = ['tool'];
  m.add({ path: ['tool', 'sync'], description: 'Sync it', options: {}, effects: 'idempotent', run: () => ({ changed: false }) });
  return m;
};

describe('a program with no root node', () => {
  it('still completes its commands, under a root with no options of its own', () => {
    const { program, root } = completionTree(rootless());
    expect(program).toBe('tool');
    expect(root.path).toEqual([]);
    expect(root.children.map((c) => c.path)).toEqual([['sync']]);
    expect(renderCompletion(rootless(), 'bash')).toContain('sync');
    expect(renderFigSpec(rootless())).toMatchObject({ name: 'tool', subcommands: [{ name: 'sync', description: 'Sync it' }] });
  });
});

describe('a program with no name', () => {
  it('is completed as “program”', () => {
    expect(completionTree(new Manifest()).program).toBe('program');
    expect(renderCompletion(new Manifest(), 'fish')).toMatch(/^# program completion for fish/);
  });
});

describe('PowerShell completes a choice after the flag the user typed', () => {
  it('keys the value table by the kebab-case flag', () => {
    const p = defineProgram({
      name: 'app',
      commands: [defineCommand({ name: 'show', effects: 'read_only', options: { outputFormat: { type: 'string', choices: ['json', 'text'] } }, run: () => undefined })],
    });
    const script = renderCompletion(p, 'pwsh');
    expect(script).toContain("Values = @{ '--output-format' = @('json', 'text') }");
    expect(script).not.toContain("'--outputFormat'");
  });
});
