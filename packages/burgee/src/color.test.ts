import { colorLevel } from 'roundel/policy';
/**
 * O2: help is styled on a terminal and plain everywhere else — decided by roundel's
 * `colorLevel`, the family's one colour policy, so help agrees with every other surface.
 *
 * Four rows moved when help stopped carrying a rule of its own (2026-09-28), each pinned below:
 * `NO_COLOR` beats `FORCE_COLOR`; `--no-color` and `--color=` are read; `CLI_ACCESSIBLE` is
 * plain; and a terminal with no `TERM` (Windows' conhost) is plain.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, execute, runCommand } from './index.js';

const program = defineProgram({
  name: 'app',
  commands: [defineCommand({ name: 'x', description: 'a command', effects: 'read_only', run: () => undefined })],
});

/** A terminal that says what it is, which is what colour detection reads once nothing asked. */
const XTERM = { TERM: 'xterm-256color' };

async function help(env: Record<string, string>, isTTY: boolean, argv: string[] = ['--help']): Promise<boolean> {
  let text = '';
  const write = (s: string): boolean => ((text += s), true);
  await execute(program, { argv, env, stdout: { write, isTTY }, stderr: { write }, exit: () => undefined });
  return text.includes('\u001B[');
}

describe('help colour follows the terminal and the two variables (O2)', () => {
  it('is styled on a terminal, and only there', async () => {
    expect(await help(XTERM, true)).toBe(true);
    expect(await help(XTERM, false)).toBe(false);
  });
  it('NO_COLOR silences a terminal; an empty NO_COLOR does not (no-color.org)', async () => {
    expect(await help({ ...XTERM, NO_COLOR: '1' }, true)).toBe(false);
    expect(await help({ ...XTERM, NO_COLOR: '' }, true)).toBe(true);
    expect(await help({ TERM: 'dumb' }, true)).toBe(false);
  });
  it('FORCE_COLOR overrides a pipe, and FORCE_COLOR=0 overrides a terminal', async () => {
    expect(await help({ FORCE_COLOR: '1' }, false)).toBe(true);
    expect(await help({ FORCE_COLOR: '0' }, true)).toBe(false);
    expect(await help({ FORCE_COLOR: 'false' }, true)).toBe(false);
  });
  it('a detected agent reads plain help even on a terminal, as it reads non-interactive (N12)', async () => {
    expect(await help({ ...XTERM, CLAUDECODE: '1' }, true)).toBe(false);
  });
});

describe('help colour is roundel’s policy, not a rule of its own', () => {
  it('NO_COLOR beats FORCE_COLOR — it used to be the other way round', async () => {
    expect(await help({ FORCE_COLOR: '', NO_COLOR: '1' }, false)).toBe(false);
    expect(await help({ ...XTERM, FORCE_COLOR: '1', NO_COLOR: '1' }, true)).toBe(false);
  });
  it('reads --no-color and --color=, which it used to ignore', async () => {
    expect(await help(XTERM, true, ['--help', '--no-color'])).toBe(false);
    expect(await help(XTERM, true, ['--help', '--color=never'])).toBe(false);
    expect(await help(XTERM, false, ['--help', '--color=256'])).toBe(true);
    expect(await help(XTERM, true, ['help', '--no-color'])).toBe(false);
  });
  it('is plain under CLI_ACCESSIBLE, as every accessible surface is', async () => {
    expect(await help({ ...XTERM, CLI_ACCESSIBLE: '1' }, true)).toBe(false);
  });
  it('is plain on a terminal that names no TERM at all (conhost), unless asked', async () => {
    expect(await help({}, true)).toBe(false);
    expect(await help({ COLORTERM: 'truecolor' }, true)).toBe(true);
    expect(await help({ FORCE_COLOR: '1' }, true)).toBe(true);
  });
});

/**
 * agent-lint-conformance R1 — `--no-color` and `--color=<when>` are global: every command takes
 * them, and they reach every surface that colours, help and the handler's runtime alike. They
 * used to be read only where nothing parsed — root help — and every command that runs refused
 * them as `unknown option`, exit 2.
 */
describe('--no-color and --color=<when> are global options (R1)', () => {
  /** A handler that reports what roundel's policy decides for the runtime the engine handed it. */
  const levels = defineProgram({
    name: 'app',
    commands: [defineCommand({ name: 'level', effects: 'read_only', examples: [{ command: 'app level' }], run: ({ runtime }) => String(colorLevel(runtime)) })],
  });
  const level = async (env: Record<string, string>, isTTY: boolean, argv: string[]): Promise<{ code: number; out: string; err: string }> => {
    let out = '';
    let err = '';
    let code = -1;
    await execute(levels, { argv: ['level', ...argv], env, stdout: { write: (s: string) => ((out += s), true), isTTY }, stderr: { write: (s: string) => ((err += s), true) }, exit: (c) => void (code = c) });
    return { code, out, err };
  };

  it('--no-color under FORCE_COLOR=3 prints no SGR: in help, and in what the handler is told', async () => {
    expect(await help({ ...XTERM, FORCE_COLOR: '3' }, true, ['x', '--help', '--no-color'])).toBe(false);
    expect(await level({ ...XTERM, FORCE_COLOR: '3' }, true, ['--no-color'])).toEqual({ code: 0, out: '0\n', err: '' });
    expect((await level({ ...XTERM, FORCE_COLOR: '3' }, true, ['--color=never'])).out).toBe('0\n');
    expect((await level({ ...XTERM, FORCE_COLOR: '3' }, true, ['--color', 'never'])).out).toBe('0\n');
  });

  it('--color=always under a pipe prints SGR: in help, and in what the handler is told', async () => {
    expect(await help({}, false, ['x', '--help', '--color=always'])).toBe(true);
    expect((await level({}, false, ['--color=always'])).out).not.toBe('0\n');
    expect((await level({}, false, ['--color', 'always'])).out).not.toBe('0\n');
  });

  it('is read ahead of the command too: by root help, and by the command it names', async () => {
    expect(await help({}, false, ['--color', 'always', '--help'])).toBe(true);
    expect(await help({ ...XTERM, FORCE_COLOR: '3' }, true, ['--no-color', '--help'])).toBe(false);
    expect((await level({}, false, [])).out).toBe('0\n');
    let out = '';
    await execute(levels, { argv: ['--color', 'always', 'level'], env: {}, stdout: { write: (s: string) => ((out += s), true), isTTY: false }, stderr: { write: () => true }, exit: () => undefined });
    expect(out).not.toBe('0\n');
  });

  it('--color=auto is the default: detection decides, and NO_COLOR still wins over always', async () => {
    expect((await level({}, false, ['--color=auto'])).out).toBe('0\n');
    expect((await level(XTERM, true, ['--color=auto'])).out).not.toBe('0\n');
    expect((await level({ NO_COLOR: '1' }, false, ['--color=always'])).out).toBe('0\n');
  });

  it('refuses a value that is not always, never or auto, as a usage error that names them', async () => {
    const { code, err } = await level({}, false, ['--color=sometimes']);
    expect(code).toBe(2);
    expect(err).toMatch(/^error: --color takes always, never or auto, not "sometimes"\n/);
  });

  it('is listed under Global options at the root and on a command', async () => {
    const root = await runCommand(program, ['--help']);
    const command = await runCommand(program, ['x', '--help']);
    for (const text of [root.stdout, command.stdout]) {
      expect(text).toMatch(/^ {2}--color <when> +always, never or auto/m);
      expect(text).toMatch(/^ {2}--no-color +the same as --color=never/m);
    }
  });

  it('steps aside for a command that declares its own color option', async () => {
    const own = defineProgram({
      name: 'paint',
      commands: [defineCommand({ name: 'wall', effects: 'read_only', options: { color: { type: 'string', description: 'which paint' } }, run: ({ options }) => options.color ?? 'none' })],
    });
    expect((await runCommand(own, ['wall', '--color', 'red'])).stdout).toBe('red\n');
    expect((await runCommand(own, ['wall', '--help'])).stdout).not.toMatch(/--color <when>/);
  });
});
