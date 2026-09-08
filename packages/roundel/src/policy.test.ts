/**
 * R1 and R2 as a truth table: one answer per input, which is the check that would have
 * caught five libraries disagreeing about the terminal (clack #286).
 */
import { describe, expect, it } from 'vitest';

import { colorLevel, outputMode, type PolicyRuntime } from './policy.js';

const rt = (env: Record<string, string | undefined>, tty = true): PolicyRuntime => ({ isTTY: { stdout: tty }, env });

describe('outputMode (R1): first match wins', () => {
  it.each([
    ['json wins over everything', rt({ CLI_ACCESSIBLE: '1', CI: '1' }, false), { json: true }, 'json'],
    ['accessible beats ci and pipe', rt({ CLI_ACCESSIBLE: '1', CI: '1' }, false), {}, 'accessible'],
    ['accessible on a terminal too', rt({ CLI_ACCESSIBLE: '1' }), {}, 'accessible'],
    ['ci off a terminal', rt({ CI: 'true' }, false), {}, 'ci'],
    ['CI on a terminal is still a terminal', rt({ CI: 'true' }), {}, 'tty'],
    ['a pipe', rt({}, false), {}, 'pipe'],
    ['an empty CI is not CI', rt({ CI: '' }, false), {}, 'pipe'],
    ['a terminal', rt({}), {}, 'tty'],
  ] as const)('%s', (_name, runtime, opts, mode) => {
    expect(outputMode(runtime, opts)).toBe(mode);
  });
});

describe('colorLevel (R2): chalk’s levels, and 0 under every mode but tty', () => {
  it.each([
    ['a pipe, whatever FORCE_COLOR says', rt({ FORCE_COLOR: '3', COLORTERM: 'truecolor' }, false), {}, 0],
    ['a json run on a terminal', rt({ COLORTERM: 'truecolor' }), { json: true }, 0],
    ['accessible mode on a terminal', rt({ CLI_ACCESSIBLE: '1', COLORTERM: 'truecolor' }), {}, 0],
    ['NO_COLOR', rt({ NO_COLOR: '1', COLORTERM: 'truecolor' }), {}, 0],
    ['FORCE_COLOR=0', rt({ FORCE_COLOR: '0', COLORTERM: 'truecolor' }), {}, 0],
    ['FORCE_COLOR=false', rt({ FORCE_COLOR: 'false' }), {}, 0],
    ['FORCE_COLOR=1', rt({ FORCE_COLOR: '1' }), {}, 1],
    ['FORCE_COLOR=true', rt({ FORCE_COLOR: 'true' }), {}, 1],
    ['FORCE_COLOR empty', rt({ FORCE_COLOR: '' }), {}, 1],
    ['FORCE_COLOR=2', rt({ FORCE_COLOR: '2' }), {}, 2],
    ['FORCE_COLOR=3', rt({ FORCE_COLOR: '3', TERM: 'dumb' }), {}, 3],
    ['FORCE_COLOR=9 clamps', rt({ FORCE_COLOR: '9' }), {}, 3],
    ['TERM=dumb', rt({ TERM: 'dumb', COLORTERM: 'truecolor' }), {}, 0],
    ['GitHub Actions on a terminal', rt({ CI: '1', GITHUB_ACTIONS: 'true' }), {}, 3],
    ['Travis', rt({ CI: '1', TRAVIS: '1' }), {}, 1],
    ['an unknown CI', rt({ CI: '1' }), {}, 0],
    ['COLORTERM=truecolor', rt({ COLORTERM: 'truecolor', TERM: 'xterm' }), {}, 3],
    ['COLORTERM=24bit', rt({ COLORTERM: '24bit' }), {}, 3],
    ['iTerm 3', rt({ TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '3.5.2' }), {}, 3],
    ['iTerm 2', rt({ TERM_PROGRAM: 'iTerm.app', TERM_PROGRAM_VERSION: '2.1' }), {}, 2],
    ['Apple Terminal', rt({ TERM_PROGRAM: 'Apple_Terminal' }), {}, 2],
    ['xterm-256color', rt({ TERM: 'xterm-256color' }), {}, 2],
    ['screen-256', rt({ TERM: 'screen-256' }), {}, 2],
    ['xterm', rt({ TERM: 'xterm' }), {}, 1],
    ['linux', rt({ TERM: 'linux' }), {}, 1],
    ['some COLORTERM', rt({ COLORTERM: 'yes' }), {}, 1],
    ['no TERM at all', rt({}), {}, 0],
  ] as const)('%s', (_name, runtime, opts, level) => {
    expect(colorLevel(runtime, opts)).toBe(level);
  });
});
