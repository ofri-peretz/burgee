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
import { toolsOf } from './mcp.js';

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

/** Capture what a run wrote and what code it left with, without touching the process. */
function capture() {
  const out: string[] = [];
  const err: string[] = [];
  let code: number | undefined;
  return {
    out,
    err,
    get code() {
      return code;
    },
    opts: {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
      exit: ((c: number) => {
        code = c;
      }) as unknown as (c: number) => never,
    },
  };
}

function deployProgram(log: string[]) {
  {
    const program = new Command('app').use(
      definePlugin({
        name: 'audit',
        hooks: { preRun: { filter: { command: /^deploy/ }, handler: ({ command }) => void log.push(command) } },
      }),
    );
    program
      .command('deploy')
      .description('Ship the current build')
      .requiredOption('--target <env>', 'where to ship')
      .option('--dry-run', 'do not write anything')
      .action((opts: Record<string, unknown>) => ({ shipped: opts['target'], dryRun: opts['dryRun'] === true }));
    return program;
  }
}

describe('a commander program actually runs, and gets the surfaces free', () => {
  const build = deployProgram;

  it('runs the action and renders its return value', async () => {
    const log: string[] = [];
    const c = capture();
    await build(log).parseAsync(['deploy', '--target', 'prod'], { from: 'user', ...c.opts });
    expect(c.code).toBe(0);
    expect(c.out.join('')).toContain('shipped: prod');
    expect(log).toEqual(['deploy']);
  });

  it('serves --json on a command written in commander syntax', async () => {
    const c = capture();
    await build([]).parseAsync(['deploy', '--target', 'prod', '--json'], { from: 'user', ...c.opts });
    expect(JSON.parse(c.out.join(''))).toMatchObject({ ok: true, data: { shipped: 'prod', dryRun: false } });
  });

  it('a missing required option is USAGE with the flag named, not a runtime failure', async () => {
    const c = capture();
    await build([]).parseAsync(['deploy'], { from: 'user', ...c.opts });
    expect(c.code).toBe(2);
    expect(c.err.join('')).toMatch(/--target/);
  });

  it('an unknown command is USAGE, and never runs a handler', async () => {
    const log: string[] = [];
    const c = capture();
    await build(log).parseAsync(['nope'], { from: 'user', ...c.opts });
    expect(c.code).toBe(2);
    expect(log).toEqual([]);
  });

  it('renders help for the resolved subcommand from the manifest', async () => {
    const c = capture();
    await build([]).parseAsync(['deploy', '--help'], { from: 'user', ...c.opts });
    expect(c.code).toBe(0);
    expect(c.out.join('')).toContain('where to ship');
  });
});

describe('a commander program gets --schema and MCP tools from its projected manifest (J2, N1)', () => {
  it('serves --schema with its commands, arguments, options and effects', async () => {
    const c = capture();
    const program = new Command('app').version('2.0.0');
    program.command('deploy').description('Ship it').argument('<target>').option('--dry-run', 'no writes').effects('non_idempotent').action(() => undefined);
    await program.parseAsync(['--schema'], { from: 'user', ...c.opts });
    expect(c.code).toBe(0);
    const schema = JSON.parse(c.out.join('')) as { name: string; version: string; commands: { name: string; effects?: string; inputSchema: { required: string[] } }[] };
    expect(schema).toMatchObject({ name: 'app', version: '2.0.0' });
    expect(schema.commands.map((d) => d.name)).toEqual(['deploy']);
    expect(schema.commands[0]).toMatchObject({ effects: 'non_idempotent', inputSchema: { required: ['target'] } });
  });

  it('exposes as MCP tools only the commands whose effects were declared (N2)', () => {
    const program = new Command('app');
    program.command('status').description('Show status').effects('read_only').action(() => undefined);
    program.command('wipe').description('Delete everything').action(() => undefined);
    expect(toolsOf(program.manifest).map((t) => t.name)).toEqual(['status']);
    expect(toolsOf(program.manifest)[0]?.annotations).toEqual({ readOnlyHint: true, idempotentHint: true, destructiveHint: false });
  });

  it('leaves a program that declares its own --schema option alone', async () => {
    const seen: string[] = [];
    const c = capture();
    const program = new Command('app');
    program.command('dump').option('--schema', 'my own flag').action((opts: { schema?: boolean }) => void seen.push(String(opts.schema)));
    await program.parseAsync(['dump', '--schema'], { from: 'user', ...c.opts });
    expect(seen).toEqual(['true']);
  });
});
