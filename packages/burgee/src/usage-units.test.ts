/**
 * The refusal's reminder piece by piece, on a manifest the test builds by hand: the option notes
 * that read a list, where the rows stop, and which commands a group lists at what depth.
 */
import { describe, expect, it } from 'vitest';

import { Manifest, type CommandNode, type OptionSpec } from './manifest.js';
import { childrenOf, commandUsage, listed, runnableBelow } from './usage.js';

const run = (): undefined => undefined;
const cmd = (path: string, extra: Partial<CommandNode> = {}): CommandNode => ({ path: ['app', ...path.split(' ').filter((w) => w !== '')], options: {}, ...extra });
const manifestOf = (...nodes: CommandNode[]): Manifest => {
  const m = new Manifest();
  m.rootPath = ['app'];
  m.config = { name: 'app' };
  for (const n of nodes) m.add(n);
  return m;
};
const optionsOf = (n: number): Record<string, OptionSpec> => Object.fromEntries(Array.from({ length: n }, (_, i) => [`o${i}`, { type: 'string' } as OptionSpec]));
const paths = (nodes: CommandNode[]): string[] => nodes.map((c) => c.path.join(' '));

describe('usage, piece by piece', () => {
  it('names every option a flag requires or conflicts with, and none for an empty list', () => {
    const usage = commandUsage(
      cmd('go', {
        options: {
          a: { type: 'string', dependsOn: ['b', 'c'], exclusive: ['d', 'e'] },
          b: { type: 'string', dependsOn: [], exclusive: [] },
        },
      }),
    );
    expect(usage.options?.map((r) => r.description)).toEqual(['(requires --b, --c) (conflicts with --d, --e)', '']);
  });

  it('lists no options key for a command with none, and points at --help only past the eighth row', () => {
    expect(commandUsage(cmd('go'))).toEqual({ command: 'app go' });
    const eight = commandUsage(cmd('go', { options: optionsOf(8) }));
    expect(eight.options).toHaveLength(8);
    expect(eight.more).toBeUndefined();
    expect(commandUsage(cmd('go', { options: optionsOf(9) })).more).toBe('app go --help');
  });

  it('lists only the visible commands one level below the group itself', () => {
    const m = manifestOf(cmd(''), cmd('remote'), cmd('remote add', { run }), cmd('remote secret', { run, hidden: true }), cmd('other add', { run }), cmd('push', { run }));
    expect(paths(childrenOf(m, m.find(['app', 'remote']) as CommandNode))).toEqual(['app remote add']);
  });

  it('lists what runs below a hidden group when the group itself is asked', () => {
    const m = manifestOf(cmd(''), cmd('remote', { hidden: true }), cmd('remote add', { run }), cmd('other add', { run }));
    expect(paths(runnableBelow(m, m.find(['app', 'remote']) as CommandNode))).toEqual(['app remote add']);
    expect(paths(runnableBelow(m, m.find(['app']) as CommandNode))).toEqual(['app other add']);
  });

  it('lists every runnable command when exactly eight fit, and its own level past that', () => {
    const eight = Array.from({ length: 8 }, (_, i) => cmd(`g${i % 2} c${i}`, { run }));
    const m = manifestOf(cmd(''), cmd('g0'), cmd('g1'), ...eight);
    expect(listed(m, m.find(['app']) as CommandNode)).toHaveLength(8);
    const nine = manifestOf(cmd(''), cmd('g0'), cmd('g1'), ...eight, cmd('g1 c8', { run }));
    expect(paths(listed(nine, nine.find(['app']) as CommandNode))).toEqual(['app g0', 'app g1']);
  });
});
