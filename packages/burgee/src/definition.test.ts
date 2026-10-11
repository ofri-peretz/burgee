/**
 * agent-lint-conformance R6 — examples are expected. A runnable command declared without one is
 * a warning, never a refusal: `missingExamples` says so, `defineCommand` does not stop on it, and
 * `burgee dev` prints it on every load, which is where an author is looking.
 */
import { describe, expect, it } from 'vitest';

import { report } from './dev.js';
import { missingExamples } from './examples-check.js';
import { defineCommand, defineProgram } from './index.js';
import { Manifest } from './manifest.js';

const run = (): string => 'ok';
const invoke = async (): Promise<{ stdout: string; stderr: string; code: number }> => ({ stdout: '', stderr: '', code: 0 });
const warnings = (text: string): string[] => text.split('\n').filter((l) => l.startsWith('warning: '));

describe('a runnable command with no examples is warned about, never refused (R6)', () => {
  it('warns, naming the command and what to add', () => {
    expect(missingExamples('greet', { effects: 'read_only', run })).toMatch(/^command "greet" declares no examples; add examples: \[\{ command: '…' \}\]/);
  });

  it('is silent for a command with an example, a group, and a lazy command with one', () => {
    expect(missingExamples('greet', { effects: 'read_only', run, examples: [{ command: 'demo greet ada' }] })).toBeUndefined();
    expect(missingExamples('config', {})).toBeUndefined();
    expect(missingExamples('later', { effects: 'read_only', load: async () => ({ run }), examples: [{ command: 'demo later' }] })).toBeUndefined();
  });

  it('counts an empty list as none, and a lazy command as runnable', () => {
    expect(missingExamples('greet', { effects: 'read_only', run, examples: [] })).toBeDefined();
    expect(missingExamples('later', { effects: 'read_only', load: async () => ({ run }) })).toBeDefined();
  });

  it('never refuses: defineCommand still returns the command', () => {
    expect(defineCommand({ name: 'greet', effects: 'read_only', run }).name).toBe('greet');
  });

  it('burgee dev prints the warning for every command that has none, and nothing for one that has', () => {
    const manifest = defineProgram({
      name: 'demo',
      commands: [
        defineCommand({ name: 'greet', effects: 'read_only', run }),
        defineCommand({ name: 'shown', effects: 'read_only', examples: [{ command: 'demo shown' }], run }),
        defineCommand({ name: 'config', commands: [defineCommand({ name: 'get', effects: 'read_only', run })] }),
      ],
    });
    expect(warnings(report(undefined, { manifest, kind: 'burgee', ms: 1, invoke }))).toEqual([
      expect.stringContaining('command "greet" declares no examples'),
      expect.stringContaining('command "config get" declares no examples'),
    ]);
    // commander and yargs have no `examples` to declare, so a façade program is told nothing.
    expect(warnings(report(undefined, { manifest, kind: 'commander', ms: 1, invoke }))).toEqual([]);
  });

  it('names a single-command program by its own name', () => {
    const manifest = new Manifest();
    manifest.rootPath = ['solo'];
    manifest.add({ path: ['solo'], options: {}, effects: 'read_only', run });
    expect(warnings(report(undefined, { manifest, kind: 'burgee', ms: 1, invoke }))).toEqual([expect.stringContaining('command "solo" declares no examples')]);
  });
});
