/**
 * R12 — `roundel/terminal`: whether anybody is there to type, and whether the terminal can draw
 * a tick. The first is the row caique got wrong (an agent with a terminal was asked to type);
 * the second is is-unicode-supported 2.1.0's table, which flagstaff and caique each carried.
 */
import { describe, expect, it } from 'vitest';

import { AGENTS, interactive, unicode } from './terminal.js';

const tty = (env: Record<string, string>, stdin = true) => interactive({ env, isTTY: { stdin } });

describe('interactive', () => {
  it('is a terminal on stdin with no CI and no agent', () => {
    expect(tty({})).toBe(true);
    expect(tty({}, false)).toBe(false);
    expect(tty({ CI: 'true' })).toBe(false);
    // An empty CI names no runner — the convention every switch in the package follows.
    expect(tty({ CI: '' })).toBe(true);
  });

  it.each(AGENTS)('is not interactive under %s, even on a terminal', (name) => {
    expect(tty({ [name]: '1' })).toBe(false);
    expect(tty({ [name]: '' })).toBe(true);
  });

  it('names CLAUDECODE, which is the case that hung an agent', () => {
    expect(AGENTS).toContain('CLAUDECODE');
  });

  // D-20260930-one-interactive-rule: a variable joins AGENTS only when it names an agent and
  // nothing else. Cursor sets CURSOR_TRACE_ID in every integrated terminal, so taking it as an
  // agent would stop every person typing in Cursor from being asked anything.
  it('asks a person in Cursor: CURSOR_TRACE_ID is set in every integrated terminal', () => {
    expect(AGENTS).not.toContain('CURSOR_TRACE_ID');
    expect(tty({ CURSOR_TRACE_ID: 'abc' })).toBe(true);
  });

  it('FORCE_TTY=1 says yes outright, as it does to burgee’s detectAgent', () => {
    expect(tty({ FORCE_TTY: '1', CLAUDECODE: '1' })).toBe(true);
    expect(tty({ FORCE_TTY: '1' }, false)).toBe(true);
    expect(tty({ FORCE_TTY: '1', CI: 'true' })).toBe(true);
    expect(tty({ FORCE_TTY: 'true', CLAUDECODE: '1' })).toBe(false);
  });
});

describe('unicode — is-unicode-supported 2.1.0', () => {
  it('is yes everywhere but Windows, except the Linux console', () => {
    expect(unicode({ env: {}, platform: 'darwin' })).toBe(true);
    expect(unicode({ env: { TERM: 'xterm-256color' }, platform: 'linux' })).toBe(true);
    expect(unicode({ env: { TERM: 'linux' }, platform: 'linux' })).toBe(false);
    // No platform is not Windows: a runtime literal that leaves it out is a POSIX one.
    expect(unicode({ env: {} })).toBe(true);
  });

  it.each([
    [{ WT_SESSION: 'x' }],
    [{ TERMINUS_SUBLIME: '1' }],
    [{ ConEmuTask: '{cmd::Cmder}' }],
    [{ TERM_PROGRAM: 'Terminus-Sublime' }],
    [{ TERM_PROGRAM: 'vscode' }],
    [{ TERM: 'xterm-256color' }],
    [{ TERM: 'alacritty' }],
    [{ TERM: 'rxvt-unicode' }],
    [{ TERM: 'rxvt-unicode-256color' }],
    [{ TERMINAL_EMULATOR: 'JetBrains-JediTerm' }],
  ])('is yes on Windows under %j', (env) => {
    expect(unicode({ env, platform: 'win32' })).toBe(true);
  });

  it('is no on a Windows console the table does not name', () => {
    expect(unicode({ env: {}, platform: 'win32' })).toBe(false);
    expect(unicode({ env: { WT_SESSION: '' }, platform: 'win32' })).toBe(false);
    expect(unicode({ env: { TERM: 'xterm' }, platform: 'win32' })).toBe(false);
    expect(unicode({ env: { ConEmuTask: '{cmd}' }, platform: 'win32' })).toBe(false);
  });
});
