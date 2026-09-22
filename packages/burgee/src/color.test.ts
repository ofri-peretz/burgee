/** O2: help is styled on a terminal and plain everywhere else; `NO_COLOR` silences it and `FORCE_COLOR` decides both ways. */
import { describe, expect, it } from 'vitest';

import { defineCommand, defineProgram, execute } from './index.js';

const program = defineProgram({
  name: 'app',
  commands: [defineCommand({ name: 'x', description: 'a command', effects: 'read_only', run: () => undefined })],
});

async function help(env: Record<string, string>, isTTY: boolean): Promise<boolean> {
  let text = '';
  const write = (s: string): boolean => ((text += s), true);
  await execute(program, { argv: ['--help'], env, stdout: { write, isTTY }, stderr: { write }, exit: () => undefined });
  return text.includes('\u001B[');
}

describe('help colour follows the terminal and the two variables (O2)', () => {
  it('is styled on a terminal, and only there', async () => {
    expect(await help({}, true)).toBe(true);
    expect(await help({}, false)).toBe(false);
  });
  it('NO_COLOR silences a terminal; an empty NO_COLOR does not (no-color.org)', async () => {
    expect(await help({ NO_COLOR: '1' }, true)).toBe(false);
    expect(await help({ NO_COLOR: '' }, true)).toBe(true);
    expect(await help({ TERM: 'dumb' }, true)).toBe(false);
  });
  it('FORCE_COLOR overrides a pipe and NO_COLOR, and FORCE_COLOR=0 overrides a terminal', async () => {
    expect(await help({ FORCE_COLOR: '1' }, false)).toBe(true);
    expect(await help({ FORCE_COLOR: '', NO_COLOR: '1' }, false)).toBe(true);
    expect(await help({ FORCE_COLOR: '0' }, true)).toBe(false);
    expect(await help({ FORCE_COLOR: 'false' }, true)).toBe(false);
  });
  it('a detected agent reads plain help even on a terminal, as it reads non-interactive (N12)', async () => {
    expect(await help({ CLAUDECODE: '1' }, true)).toBe(false);
  });
});
