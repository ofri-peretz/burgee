/**
 * R3 — the nine tokens, one snapshot per level. The identity at level 0; at 1, 2 and 3 the
 * same paint whatever the mode, because the level obeys the user's instruction
 * (`NO_COLOR`, `FORCE_COLOR`, `--color`) in any mode and the mode decides only redraws
 * (R2 revised 2026-09-08). No third behaviour.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { flown, type Runtime } from './policy.js';
import { fly } from './theme.js';
import { command, error, flag, heading, hint, muted, ok, value, warn } from './tokens.js';

const tokens = { error, warn, ok, hint, muted, command, flag, value, heading };

function paint(): Record<keyof typeof tokens, string> {
  return Object.fromEntries(Object.entries(tokens).map(([n, t]) => [n, t('x')])) as Record<keyof typeof tokens, string>;
}

const PLAIN = Object.fromEntries(Object.keys(tokens).map((n) => [n, 'x']));

/** Escape sequences spelled out, so a reader can check them against ECMA-48 by eye. */
const E = '\u001B[';
const sixteen = {
  warn: `${E}33mx${E}39m`,
  hint: `${E}2mx${E}22m`,
  muted: `${E}90mx${E}39m`,
  command: `${E}1mx${E}22m`,
  flag: `${E}36mx${E}39m`,
  value: `${E}35mx${E}39m`,
  heading: `${E}1m${E}4mx${E}24m${E}22m`,
};

const tty = (env: Runtime['env']): Runtime => ({ env, isTTY: { stdout: true } });
const pipe = (env: Runtime['env']): Runtime => ({ env, isTTY: { stdout: false } });

beforeEach(() => {
  flown.level = 0;
  flown.paint = {};
});

describe('before fly()', () => {
  it('every token is the identity: a program that never declares its runtime prints plain text', () => {
    expect(paint()).toEqual(PLAIN);
  });
});

describe('tty', () => {
  it('level 3: the brand in truecolor, lifted for the near-black default ground', () => {
    fly({}, tty({ COLORTERM: 'truecolor' }));
    expect(paint()).toEqual({ ...sixteen, error: `${E}38;2;244;121;74mx${E}39m`, ok: `${E}38;2;13;148;96mx${E}39m` });
  });

  it('level 2: the same hex, nearest of 256', () => {
    fly({}, tty({ TERM: 'xterm-256color' }));
    expect(paint()).toEqual({ ...sixteen, error: `${E}38;5;209mx${E}39m`, ok: `${E}38;5;36mx${E}39m` });
  });

  it('level 1: the same hex, nearest of 16', () => {
    fly({}, tty({ TERM: 'xterm' }));
    expect(paint()).toEqual({ ...sixteen, error: `${E}91mx${E}39m`, ok: `${E}32mx${E}39m` });
  });

  it('a terminal that chalk would call level 0 gets plain text', () => {
    fly({}, tty({ NO_COLOR: '1', COLORTERM: 'truecolor' }));
    expect(paint()).toEqual(PLAIN);
  });
});

describe('every other mode: the identity with no instruction, the same paint under one', () => {
  const truecolor = { ...sixteen, error: `${E}38;2;244;121;74mx${E}39m`, ok: `${E}38;2;13;148;96mx${E}39m` };
  const forced = { COLORTERM: 'truecolor', FORCE_COLOR: '3' };

  it('pipe: 0 with nothing asked, whatever the terminal variables say', () => {
    fly({}, pipe({ COLORTERM: 'truecolor' }));
    expect(paint()).toEqual(PLAIN);
  });

  it('pipe: FORCE_COLOR colours it — the CI user who set it to get coloured logs', () => {
    fly({}, pipe(forced));
    expect(paint()).toEqual(truecolor);
  });

  it('ci: 0 with nothing asked and no vendor known to render colour', () => {
    fly({}, pipe({ CI: 'true', COLORTERM: 'truecolor' }));
    expect(paint()).toEqual(PLAIN);
  });

  it('ci: FORCE_COLOR colours it', () => {
    fly({}, pipe({ ...forced, CI: 'true' }));
    expect(paint()).toEqual(truecolor);
  });

  it('accessible: the terminal level, as on any terminal — the mode changes redraws, not paint', () => {
    fly({}, tty({ COLORTERM: 'truecolor', CLI_ACCESSIBLE: '1' }));
    expect(paint()).toEqual(truecolor);
  });

  it('json: the identity even when forced — structured output carries no escapes', () => {
    fly({}, tty(forced), { json: true });
    expect(paint()).toEqual(PLAIN);
  });
});

describe('a token', () => {
  it('styles only its argument, and an empty string stays empty in shape', () => {
    fly({}, tty({ TERM: 'xterm' }));
    expect(command('')).toBe(`${E}1m${E}22m`);
    expect(command('a b')).toBe(`${E}1ma b${E}22m`);
  });
});
