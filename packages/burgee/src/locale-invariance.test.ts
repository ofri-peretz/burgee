/**
 * `localised-human-surfaces` R3 — machine surfaces are invariant under the locale, and this is
 * the lock that says so.
 *
 * The demo (`examples/demo-cli-burgee`, declared again below on this package's own source so
 * the lock measures the engine it ships beside) runs with the test pack registered, once under
 * `LANG=C` and once under `LANG=de_DE.UTF-8`. Every machine surface must come out byte for byte
 * the same: `--json` success and failure (stdout, and the error line on stderr), `--schema`,
 * `--mcp` `initialize` and `tools/list`, `--format=agent`, and the exit code of every failure
 * kind. Then human help and the human error line must **differ**, so the lock cannot pass by
 * localising nothing.
 *
 * Nothing machine-readable reads the catalog — `locale.ts` is reached only from the prose
 * paths — and this is the guard against the edit that would change that.
 */
import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import pack from './__fixtures__/locale-pack-de.json' with { type: 'json' };
import { defineCommand, defineProgram, runCommand } from './execute.js';
import { ExitCode, isExitCode } from './exit-code.js';
import { type Plugin } from './plugin.js';

const CONFIG = new Map<string, string>([
  ['user.name', 'ada'],
  ['greeting', 'Hello'],
]);

const demo = defineProgram({
  name: 'demo',
  version: '1.0.0',
  description: 'The burgee reference demo',
  commands: [
    defineCommand({
      name: 'greet',
      description: 'Greet someone',
      effects: 'read_only',
      arguments: [{ name: 'name', description: 'who to greet', required: true }],
      examples: [{ command: 'demo greet ada --shout', description: 'greet ada, loudly' }],
      output: { cardinality: 'single', schema: { type: 'string' } },
      options: {
        shout: { type: 'boolean', description: 'uppercase the greeting' },
        greeting: { type: 'string', description: 'the greeting word', env: 'DEMO_GREETING', default: 'Hello' },
        times: { type: 'number', description: 'how many times' },
      },
      run: ({ options, positionals }) => {
        const line = `${String(options['greeting'])}, ${positionals[0] ?? ''}!`;
        return options['shout'] === true ? line.toUpperCase() : line;
      },
    }),
    defineCommand({
      name: 'config',
      description: 'Read configuration',
      commands: [
        defineCommand({
          name: 'get',
          description: 'Print one configuration value',
          effects: 'read_only',
          arguments: [{ name: 'key', description: 'dotted key', required: true }],
          output: { cardinality: 'single', schema: { type: 'string' } },
          run: ({ positionals }) => {
            const value = CONFIG.get(positionals[0] ?? '');
            if (value === undefined) throw new Error(`unknown key: ${positionals[0] ?? ''}`);
            return value;
          },
        }),
      ],
    }),
    defineCommand({
      name: 'fail',
      description: 'Fail on purpose',
      effects: 'idempotent',
      options: { code: { type: 'string', description: 'exit with this E1 code instead of throwing' } },
      output: { cardinality: 'single', schema: { not: {} } },
      run: ({ options, exit }) => {
        const code = Number(options['code']);
        if (options['code'] !== undefined && isExitCode(code)) exit(code);
        throw new Error('boom');
      },
    }),
  ],
});
demo.use(pack as Plugin);

const BASE = { LANG: 'C' };
const GERMAN = { LANG: 'de_DE.UTF-8' };

type Run = Awaited<ReturnType<typeof runCommand>>;

async function under(env: Record<string, string>, argv: string[], input?: string[]): Promise<Run> {
  if (input === undefined) return await runCommand(demo, argv, { env });
  const stdin = new PassThrough();
  for (const line of input) stdin.write(`${line}\n`);
  stdin.end();
  return await runCommand(demo, argv, { env, stdin });
}

/** Both runs of one line: the base language and German. */
const both = async (argv: string[], input?: string[]): Promise<[Run, Run]> => [await under(BASE, argv, input), await under(GERMAN, argv, input)];

/** The stderr line a failure ends with, which is a machine surface wherever it is written (clispec-conformance R6). */
const errorLine = (stderr: string): string => stderr.trimEnd().split('\n').at(-1) as string;

const rpc = (id: number, method: string): string => JSON.stringify({ jsonrpc: '2.0', id, method, params: {} });

describe('machine surfaces are byte-identical under LANG=de_DE.UTF-8 and LANG=C (R3)', () => {
  it.each([
    ['--json success', ['greet', 'ada', '--json']],
    ['--json success, nested', ['config', 'get', 'user.name', '--json']],
    ['--json failure: an unknown option', ['greet', 'ada', '--nope', '--json']],
    ['--json failure: a missing argument', ['greet', '--json']],
    ['--json failure: an unknown command', ['gret', '--json']],
    ['--json failure: a value that is not a number', ['greet', 'ada', '--times', 'x', '--json']],
    ['--json failure: a handler that throws', ['fail', '--json']],
    ['--json help', ['greet', '--help', '--json']],
    ['--schema', ['--schema']],
    ['--schema of one command', ['--schema', 'greet']],
    ['--format=agent success', ['config', 'get', 'user.name', '--format=agent']],
    ['--format=agent failure', ['greet', '--format=agent']],
  ])('%s', async (_, argv) => {
    const [base, german] = await both(argv);
    expect(german.stdout).toBe(base.stdout);
    expect(german.code).toBe(base.code);
    expect(errorLine(german.stderr)).toBe(errorLine(base.stderr));
  });

  it('--json writes the same stderr byte for byte, not only its last line', async () => {
    const [base, german] = await both(['greet', 'ada', '--nope', '--json']);
    expect(base.stderr).not.toBe('');
    expect(german.stderr).toBe(base.stderr);
  });

  it('--mcp answers initialize and tools/list identically, and a tool call too', async () => {
    const input = [rpc(1, 'initialize'), rpc(2, 'tools/list'), JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'greet', arguments: { nope: true } } })];
    const [base, german] = await both(['--mcp'], input);
    expect(base.stdout.split('\n').filter((l) => l !== '')).toHaveLength(3);
    expect(german.stdout).toBe(base.stdout);
  });

  it('leaves with the same exit code for every failure kind', async () => {
    const lines = [['greet', 'ada', '--nope'], ['greet'], ['gret'], ['fail'], ...Object.values(ExitCode).map((code) => ['fail', '--code', String(code)])];
    const runs = await Promise.all(lines.map(async (argv) => ({ argv, runs: await both(argv) })));
    for (const { argv, runs: [base, german] } of runs) {
      expect({ argv, code: german.code }).toEqual({ argv, code: base.code });
      expect(errorLine(german.stderr)).toBe(errorLine(base.stderr));
    }
  });
});

describe('human surfaces do change, so the lock above is not passing by localising nothing (R3)', () => {
  it('help speaks German', async () => {
    const [base, german] = await both(['--help']);
    expect(german.stdout).not.toBe(base.stdout);
    expect(german.stdout).toContain('Aufruf:');
    expect(german.stdout).toContain('Für Agenten:');
    expect(base.stdout).toContain('Usage:');
  });

  it('the human error line speaks German, and its labels and machine line do not', async () => {
    const [base, german] = await both(['greet', 'ada', '--nope']);
    expect(base.stderr.split('\n')[0]).toBe('error: unknown option --nope');
    expect(german.stderr.split('\n')[0]).toBe('error: unbekannte Option --nope');
    expect(errorLine(german.stderr)).toBe('{"error":{"kind":"usage","code":2,"message":"unknown option --nope"}}');
  });
});
