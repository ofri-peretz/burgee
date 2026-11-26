/**
 * Root help's pieces one at a time, on a manifest the test builds by hand: the completion node's
 * media type, and which command lends the root screen its example when the root declares none.
 */
import { describe, expect, it } from 'vitest';

import { Manifest, type CommandNode } from './manifest.js';
import { completionNode, rootExamples } from './root-help.js';

const manifestOf = (...nodes: CommandNode[]): Manifest => {
  const m = new Manifest();
  m.rootPath = ['app'];
  m.config = { name: 'app' };
  m.add({ path: ['app'], options: {} });
  for (const n of nodes) m.add(n);
  return m;
};
const cmd = (path: string, extra: Partial<CommandNode> = {}): CommandNode => ({ path: ['app', ...path.split(' ')], options: {}, ...extra });
const ex = (command: string): Partial<CommandNode> => ({ examples: [{ command }] });

describe('root help, piece by piece', () => {
  it('names the completion script as plain text', () => {
    expect(completionNode(manifestOf())?.output).toEqual({ kind: 'opaque', mediaType: 'text/plain' });
  });

  it('spells the completion example with every word of a two-word program', () => {
    const m = manifestOf();
    m.rootPath = ['my', 'app'];
    expect(completionNode(m)?.examples).toEqual([{ command: 'my app completion bash' }]);
  });

  it('takes one example per top-level command, the first one declared under it', () => {
    const m = manifestOf(cmd('remote add', ex('app remote add origin')), cmd('remote rm', ex('app remote rm origin')), cmd('push', ex('app push')));
    expect(rootExamples(m, m.find(['app']) as CommandNode).map((e) => e.command)).toEqual(['app remote add origin', 'app push']);
  });

  it('takes no example from a hidden command, even under a top-level command that is shown', () => {
    const m = manifestOf(cmd('remote'), cmd('remote secret', { hidden: true, ...ex('app remote secret') }), cmd('remote add', ex('app remote add origin')));
    expect(rootExamples(m, m.find(['app']) as CommandNode).map((e) => e.command)).toEqual(['app remote add origin']);
  });

  it('reads a command whose top-level word declares no node of its own, and does not throw', () => {
    const m = manifestOf(cmd('db migrate', ex('app db migrate')));
    expect(rootExamples(m, m.find(['app']) as CommandNode).map((e) => e.command)).toEqual(['app db migrate']);
  });
});
