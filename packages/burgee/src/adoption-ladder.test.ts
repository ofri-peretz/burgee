/**
 * J2, J5, J7, J8 — the load-bearing claim of the adoption strategy, proven.
 *
 * A program written in *commander's* syntax gains burgee's surfaces and burgee's
 * plugins, without one line of it changing. Neither commander nor yargs has a
 * plugin system at all — commander's RFC #2505 is still unlanded — so this is a
 * capability a commander user cannot get from commander at any price.
 */
import { describe, expect, it } from 'vitest';

import { Command } from './commander.js';
import { definePlugin, hookApplies, Manifest } from './manifest.js';

function marker(order: string[], name: string, enforce?: 'pre' | 'post') {
  return definePlugin({
    name,
    ...(enforce === undefined ? {} : { enforce }),
    hooks: { preRun: { handler: () => void order.push(name) } },
  });
}

/** One plugin. It knows nothing about which syntax the host program is written in. */
const audit = (log: string[]) =>
  definePlugin({
    name: 'audit',
    commands: [{ path: ['audit'], description: 'Contributed by the audit plugin', options: {} }],
    hooks: {
      preRun: {
        filter: { command: /^deploy/ },
        handler: ({ command }) => void log.push(`pre:${command}`),
      },
    },
  });

describe('a commander-syntax program, with burgee plugins hooked into it', () => {
  it('accepts a plugin and records what it contributed', () => {
    const log: string[] = [];
    const program = new Command('app').use(audit(log));
    program.command('deploy').description('Ship it').option('--dry-run', 'no writes');

    const contributed = program.manifest.commands.find((c) => c.path.join(' ') === 'audit');
    expect(contributed?.plugin).toBe('audit');
    expect(contributed?.description).toBe('Contributed by the audit plugin');
  });

  it('fires the plugin hook on a command declared in commander syntax', async () => {
    const log: string[] = [];
    const program = new Command('app').use(audit(log));
    program.command('deploy').action(() => undefined);

    await program.manifest.fire('preRun', 'deploy', {});
    expect(log).toEqual(['pre:deploy']);
  });

  it('honours the hook filter, so unrelated commands never load the handler', async () => {
    const log: string[] = [];
    const program = new Command('app').use(audit(log));
    program.command('status').action(() => undefined);

    await program.manifest.fire('preRun', 'status', {});
    expect(log).toEqual([]);
    expect(hookApplies(audit(log).hooks?.preRun, 'status')).toBe(false);
    expect(hookApplies(audit(log).hooks?.preRun, 'deploy')).toBe(true);
  });

  it('puts commander-syntax and plugin commands in one manifest, so every surface sees both', () => {
    const program = new Command('app').use(audit([]));
    program.command('deploy').description('Ship it').requiredOption('--target <env>', 'where to');

    // What --schema, --help, --mcp and completions all read from.
    expect(program.manifest.commands.map((c) => c.path.join(' ')).sort()).toEqual(['app', 'audit', 'app deploy'].sort());
    expect(program.manifest.find(['app', 'deploy'])?.options['target']).toMatchObject({
      type: 'string',
      required: true,
      description: 'where to',
    });
  });

  it('runs plugins in pre → unordered → post order, the Vite convention', async () => {
    const order: string[] = [];
    const mark = (name: string, enforce?: 'pre' | 'post') => marker(order, name, enforce);
    const manifest = new Manifest();
    manifest.use(mark('middle'));
    manifest.use(mark('last', 'post'));
    manifest.use(mark('first', 'pre'));

    await manifest.fire('preRun', 'anything', {});
    expect(order).toEqual(['first', 'middle', 'last']);
  });
});

describe('option names cannot reach Object.prototype', () => {
  it('rejects a polluting flag name instead of writing it', () => {
    const program = new Command('app');
    expect(() => program.command('x').option('--__proto__ <v>')).toThrow(/would reach Object.prototype/);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('stores options on a null-prototype object', () => {
    const program = new Command('app');
    program.command('x').option('--safe <v>');
    expect(Object.getPrototypeOf(program.manifest.find(['app', 'x'])?.options)).toBeNull();
  });
});
