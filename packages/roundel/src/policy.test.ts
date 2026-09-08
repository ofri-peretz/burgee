/**
 * R1 and R2 — the truth table. One answer per input, and every input that matters is a
 * row here: mode × env × TTY × json. The check that would have caught clack #286 (five
 * libraries disagreeing about the terminal) is that this table exists and nothing else in
 * the family computes its own.
 */
import { describe, expect, it } from 'vitest';

import { colorLevel, outputMode, type OutputMode, type Runtime } from './policy.js';

function rt(env: Runtime['env'], tty: boolean): Runtime {
  return { env, isTTY: { stdout: tty } };
}

describe('outputMode — R1, first match wins', () => {
  // Every combination of the three switches and the flag: 2 × 2 × 2 × 2 rows.
  const both = { CLI_ACCESSIBLE: '1', CI: 'true' };
  const A = { CLI_ACCESSIBLE: '1' };
  const CI = { CI: 'true' };
  it.each<{ name: string; env: Runtime['env']; tty: boolean; json: boolean; mode: OutputMode }>([
    { name: 'nothing set, a terminal', env: {}, tty: true, json: false, mode: 'tty' },
    { name: 'nothing set, a pipe', env: {}, tty: false, json: false, mode: 'pipe' },
    { name: 'CI on a terminal is still a terminal', env: CI, tty: true, json: false, mode: 'tty' },
    { name: 'CI on a pipe', env: CI, tty: false, json: false, mode: 'ci' },
    { name: 'accessible on a terminal', env: A, tty: true, json: false, mode: 'accessible' },
    { name: 'accessible on a pipe', env: A, tty: false, json: false, mode: 'accessible' },
    { name: 'accessible beats CI', env: both, tty: true, json: false, mode: 'accessible' },
    { name: 'accessible beats CI on a pipe', env: both, tty: false, json: false, mode: 'accessible' },
    { name: '--json on a terminal', env: {}, tty: true, json: true, mode: 'json' },
    { name: '--json on a pipe', env: {}, tty: false, json: true, mode: 'json' },
    { name: '--json beats CI', env: CI, tty: true, json: true, mode: 'json' },
    { name: '--json beats CI on a pipe', env: CI, tty: false, json: true, mode: 'json' },
    { name: '--json beats accessible', env: A, tty: true, json: true, mode: 'json' },
    { name: '--json beats accessible on a pipe', env: A, tty: false, json: true, mode: 'json' },
    { name: '--json beats everything', env: both, tty: true, json: true, mode: 'json' },
    { name: '--json beats everything on a pipe', env: both, tty: false, json: true, mode: 'json' },
  ])('$name', ({ env, tty, json, mode }) => {
    expect(outputMode(rt(env, tty), { json })).toBe(mode);
  });

  it('an empty variable is not set — the NO_COLOR convention, applied to every switch', () => {
    expect(outputMode(rt({ CI: '', CLI_ACCESSIBLE: '' }, false))).toBe('pipe');
    expect(outputMode(rt({ CI: '', CLI_ACCESSIBLE: '' }, true))).toBe('tty');
  });

  it('reads only what the runtime carries — the same input always gives the same answer', () => {
    const a = rt({ CI: 'true', TERM: 'xterm-256color' }, false);
    expect(outputMode(a)).toBe(outputMode({ ...a, env: { ...a.env } }));
    expect(outputMode(a)).toBe('ci');
  });
});

describe('colorLevel — R2, chalk levels under tty and 0 everywhere else', () => {
  it.each<[string, Runtime['env'], boolean, 0 | 1 | 2 | 3]>([
    ['a terminal with no TERM is chalk level 0', {}, true, 0],
    ['TERM=xterm', { TERM: 'xterm' }, true, 1],
    ['TERM=screen', { TERM: 'screen' }, true, 1],
    ['TERM=linux', { TERM: 'linux' }, true, 1],
    ['TERM=xterm-256color', { TERM: 'xterm-256color' }, true, 2],
    ['TERM=screen-256', { TERM: 'screen-256' }, true, 2],
    ['COLORTERM=truecolor', { COLORTERM: 'truecolor', TERM: 'xterm-256color' }, true, 3],
    ['COLORTERM set to anything else is 16 colours', { COLORTERM: 'yes' }, true, 1],
    ['TERM=dumb', { TERM: 'dumb', COLORTERM: 'truecolor' }, true, 0],
    ['TERM=dumb with FORCE_COLOR=2 is the forced floor', { TERM: 'dumb', FORCE_COLOR: '2' }, true, 2],
    ['NO_COLOR wins over everything', { NO_COLOR: '1', COLORTERM: 'truecolor', FORCE_COLOR: '3' }, true, 0],
    ['NO_COLOR empty is not set', { NO_COLOR: '', COLORTERM: 'truecolor' }, true, 3],
    ['FORCE_COLOR=0', { FORCE_COLOR: '0', COLORTERM: 'truecolor' }, true, 0],
    ['FORCE_COLOR=false', { FORCE_COLOR: 'false', COLORTERM: 'truecolor' }, true, 0],
    ['FORCE_COLOR empty is level 1', { FORCE_COLOR: '' }, true, 1],
    ['FORCE_COLOR=true is level 1', { FORCE_COLOR: 'true' }, true, 1],
    ['FORCE_COLOR=3 with no TERM', { FORCE_COLOR: '3' }, true, 3],
    ['FORCE_COLOR=9 clamps to 3', { FORCE_COLOR: '9' }, true, 3],
    ['FORCE_COLOR=nonsense is level 1, not NaN', { FORCE_COLOR: 'yes' }, true, 1],
    ['FORCE_COLOR is a floor: the terminal may raise it (supports-color semantics)', { FORCE_COLOR: '1', COLORTERM: 'truecolor' }, true, 3],
    ['a pipe is 0 whatever the env says', { COLORTERM: 'truecolor', FORCE_COLOR: '3' }, false, 0],
    ['CI is 0', { CI: 'true', COLORTERM: 'truecolor' }, false, 0],
    ['accessible is 0, even on a terminal', { CLI_ACCESSIBLE: '1', COLORTERM: 'truecolor' }, true, 0],
  ])('%s', (_, env, tty, level) => {
    expect(colorLevel(rt(env, tty))).toBe(level);
  });

  it('json is 0, even on a truecolor terminal', () => {
    expect(colorLevel(rt({ COLORTERM: 'truecolor' }, true), { json: true })).toBe(0);
  });
});
