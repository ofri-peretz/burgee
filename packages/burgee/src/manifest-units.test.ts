/**
 * `Manifest` (`manifest.ts`) by hand: what `add` keeps, which paths `use` counts as taken,
 * `declares`, and the longest match `resolve` picks whatever order the commands came in.
 */
import { describe, expect, it } from 'vitest';

import { type CommandNode } from './manifest.js';
import { Manifest } from './schema-entry.js';

const ok = (): string => 'ok';
const node = (path: string[], extra: Partial<CommandNode> = {}): CommandNode => ({ path, options: {}, ...extra }) as CommandNode;

describe('Manifest', () => {
  it('keeps the run of a node that declares both run and load', () => {
    const m = new Manifest();
    m.add(node(['go'], { run: ok, load: async () => ({ default: ok }) } as never));
    expect(m.find(['go'])?.run).toBe(ok);
  });

  it('refuses a plugin command on a path of several words already declared', () => {
    const m = new Manifest();
    m.add(node(['remote', 'add'], { run: ok, effects: 'read_only' } as never));
    expect(() => m.use({ name: 'p', contract: 1, commands: [node(['remote', 'add'], { run: ok, effects: 'read_only' } as never)] } as never)).toThrow('"remote add", which is already declared');
  });

  it('declares a stage when any plugin hooks it, and not for a plugin without hooks', () => {
    const m = new Manifest();
    m.use({ name: 'bare', contract: 1 } as never);
    expect(m.declares('preRun')).toBe(false);
    m.use({ name: 'hooked', contract: 1, hooks: { preRun: { handler: ok } } } as never);
    expect(m.declares('preRun')).toBe(true);
  });

  it('resolves from no root by default, and keeps the longest match when a shorter one comes later', () => {
    const m = new Manifest();
    m.add(node(['remote', 'add'], { run: ok }));
    m.add(node(['remote'], { run: ok }));
    expect(m.resolve(['remote', 'add', 'x'])).toEqual({ node: m.find(['remote', 'add']), rest: ['x'] });
    expect(m.resolve(['remote'])).toEqual({ node: m.find(['remote']), rest: [] });
  });
});
