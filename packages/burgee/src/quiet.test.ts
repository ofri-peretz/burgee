/**
 * agent-lint-conformance R2 — `--quiet` / `-q` is global. It silences decoration and keeps the
 * work: what a handler draws through the runtime the engine hands it (`ctx.runtime.quiet`, which
 * flagstaff's `hoist` reads), and every framework hint on the way, such as a deprecation warning.
 * Stdout's payload, the `--json` envelope and every failure stay exactly as they were.
 *
 * The drawing half is flagstaff's (`loop.test.ts`, "under quiet"): burgee cannot import it, so
 * the handler here draws the way a component does, through the runtime it was given.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, runCommand } from './index.js';
import { type RunContext } from './manifest.js';

/** What a progress line does: it draws on stderr unless the runtime it was handed is quiet. */
const draw = (ctx: Pick<RunContext, 'runtime'>, line: string, err: (s: string) => void): void => {
  if (ctx.runtime.quiet !== true) err(line);
};

const drawn: string[] = [];
const program = defineProgram({
  name: 'app',
  commands: [
    defineCommand({
      name: 'sync',
      description: 'Sync, drawing progress on the way',
      effects: 'idempotent',
      examples: [{ command: 'app sync' }],
      run: (ctx) => {
        draw(ctx, 'syncing…\n', (s) => drawn.push(s));
        return { changed: true, synced: 3, quiet: ctx.quiet };
      },
    }),
    defineCommand({ name: 'old', description: 'Superseded', deprecated: 'sync', effects: 'read_only', examples: [{ command: 'app old' }], run: () => 'still runs' }),
    defineCommand({ name: 'boom', effects: 'read_only', examples: [{ command: 'app boom' }], run: () => Promise.reject(new Error('it broke')) }),
  ],
});

describe('--quiet silences decoration and keeps the work (R2)', () => {
  it('stdout and the --json envelope are byte-identical with and without it, and stderr is empty', async () => {
    drawn.length = 0;
    const loud = await runCommand(program, ['sync', '--json']);
    expect(drawn).toEqual(['syncing…\n']);
    drawn.length = 0;
    const quiet = await runCommand(program, ['sync', '--json', '--quiet']);
    expect(drawn).toEqual([]);
    expect(quiet.stderr).toBe('');
    // The handler is told it ran quiet; everything else in the document is the same bytes.
    expect(quiet.stdout).toBe(loud.stdout.replace('"quiet":false', '"quiet":true'));
    expect(quiet.code).toBe(0);
  });

  it('-q is the same flag, wherever it is typed after the command', async () => {
    drawn.length = 0;
    expect((await runCommand(program, ['sync', '-q'])).code).toBe(0);
    expect((await runCommand(program, ['-q', 'sync'])).code).toBe(0);
    expect(drawn).toEqual([]);
  });

  it('is the handler’s after --, like every flag (G5)', async () => {
    const echo = defineProgram({ name: 'app', commands: [defineCommand({ name: 'echo', effects: 'read_only', run: ({ passthrough, quiet }) => `${passthrough.join(' ')}:${String(quiet)}` })] });
    expect((await runCommand(echo, ['echo', '--', '--quiet', '-q'])).stdout).toBe('--quiet -q:false\n');
  });

  it('typed ahead of a command that does not resolve, still reads as help or a refusal', async () => {
    // Nothing after it: the root's help, as the usage error a bare call is.
    const bare = await runCommand(program, ['--quiet']);
    expect(bare.code).toBe(2);
    expect(bare.stderr).toMatch(/^Usage: app <command>/);
    expect((await runCommand(program, ['--quiet', '--help'])).code).toBe(0);
    // An unknown word after it is refused as itself, not as `--quiet`.
    expect((await runCommand(program, ['--quiet', 'nope'])).stderr).toMatch(/^error: unknown command "nope"\n/);
    // A group's own word after it resolves the same way: `config --quiet get` is `config get --quiet`.
    const grouped = defineProgram({ name: 'app', commands: [defineCommand({ name: 'config', commands: [defineCommand({ name: 'get', effects: 'read_only', run: ({ quiet }) => String(quiet) })] })] });
    expect((await runCommand(grouped, ['config', '--quiet', 'get'])).stdout).toBe('true\n');
    expect((await runCommand(grouped, ['--timeout', '5s', 'config', 'get', '--json'])).stdout).toBe('{"ok":true,"data":"false","meta":{"provenance":{}}}\n');
  });

  it('silences the framework hint a deprecated command prints, and still runs it', async () => {
    const quiet = await runCommand(program, ['old', '--quiet']);
    expect(quiet).toEqual({ code: 0, stdout: 'still runs\n', stderr: '' });
  });

  it('never hides a failure: the message, and its envelope under --json', async () => {
    const plain = await runCommand(program, ['boom', '--quiet']);
    expect(plain.code).toBe(1);
    expect(plain.stderr).toMatch(/^error: it broke\n/);
    const json = await runCommand(program, ['boom', '--quiet', '--json']);
    expect(JSON.parse(json.stdout)).toMatchObject({ ok: false, error: { code: 1, message: 'it broke' } });
  });

  it('is listed under Global options, and steps aside for a command that declares its own', async () => {
    expect((await runCommand(program, ['--help'])).stdout).toMatch(/^ {2}-q, --quiet +silence progress and hints; data and errors still print/m);
    const own = defineProgram({
      name: 'own',
      commands: [
        defineCommand({ name: 'mine', effects: 'read_only', options: { quiet: { type: 'string', description: 'how quiet' } }, run: ({ options, quiet }) => `${options.quiet ?? ''}:${String(quiet)}` }),
        defineCommand({ name: 'query', effects: 'read_only', options: { query: { type: 'string', short: 'q' } }, run: ({ options, quiet }) => `${options.query ?? ''}:${String(quiet)}` }),
      ],
    });
    expect((await runCommand(own, ['mine', '--quiet', 'very'])).stdout).toBe('very:false\n');
    // `-q` is the command's own short flag; `--quiet` is still the global one.
    expect((await runCommand(own, ['query', '-q', 'x'])).stdout).toBe('x:false\n');
    expect((await runCommand(own, ['query', '-q', 'x', '--quiet'])).stdout).toBe('x:true\n');
  });
});
