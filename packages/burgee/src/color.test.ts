/**
 * O2: help is styled on a terminal and plain everywhere else — decided by roundel's
 * `colorLevel`, the family's one colour policy, so help agrees with every other surface.
 *
 * Four rows moved when help stopped carrying a rule of its own (2026-09-28), each pinned below:
 * `NO_COLOR` beats `FORCE_COLOR`; `--no-color` and `--color=` are read; `CLI_ACCESSIBLE` is
 * plain; and a terminal with no `TERM` (Windows' conhost) is plain.
 */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, execute } from './index.js';

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
