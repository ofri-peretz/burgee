/**
 * R3: every token returns its input unchanged under every mode but tty, and styles it
 * at the level the policy allows — a snapshot per mode, so the exact bytes are the lock.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { type PolicyRuntime } from './policy.js';
import { BRAND_THEME, fly, strike, TOKENS } from './theme.js';
import { createTokens, PLAIN } from './tokens.js';

const rt = (env: Record<string, string | undefined>, tty = true): PolicyRuntime => ({ isTTY: { stdout: tty }, env });

afterEach(() => strike());

describe('under every mode but tty, a token is the identity (R3)', () => {
  it.each([
    ['pipe', rt({ COLORTERM: 'truecolor' }, false), {}],
    ['ci', rt({ CI: '1', GITHUB_ACTIONS: 'true' }, false), {}],
    ['json', rt({ COLORTERM: 'truecolor' }), { json: true }],
    ['accessible', rt({ CLI_ACCESSIBLE: '1', COLORTERM: 'truecolor' }), {}],
  ] as const)('%s', (_mode, runtime, opts) => {
    const tokens = createTokens(runtime, opts);
    for (const t of TOKENS) expect(tokens[t]('x')).toBe('x');
  });

  it('PLAIN is the identity for every token, a safe default for a library', () => {
    for (const t of TOKENS) expect(PLAIN[t]('x')).toBe('x');
  });
});

describe('under tty, a token styles at the policy’s level', () => {
  it('level 1: the default theme is styleText formats', () => {
    const tokens = createTokens(rt({ TERM: 'xterm' }));
    expect(tokens.error('x')).toBe('\u001B[31m\u001B[1mx\u001B[22m\u001B[39m');
    expect(tokens.hint('x')).toBe('\u001B[2mx\u001B[22m');
    expect(tokens.heading('x')).toBe('\u001B[1m\u001B[4mx\u001B[24m\u001B[22m');
  });

  it('level 3: a hex token renders as truecolor', () => {
    fly(BRAND_THEME);
    const tokens = createTokens(rt({ COLORTERM: 'truecolor' }));
    expect(tokens.command('x')).toBe('\u001B[38;2;185;112;69mx\u001B[39m');
    expect(tokens.error('x')).toBe('\u001B[31m\u001B[1mx\u001B[22m\u001B[39m');
  });

  it('level 2: a hex token falls back to the nearest of the 256-colour cube', () => {
    fly(BRAND_THEME);
    const tokens = createTokens(rt({ TERM: 'xterm-256color' }));
    expect(tokens.command('x')).toBe('\u001B[38;5;173mx\u001B[39m');
  });

  it('level 1: a hex token falls back to the nearest basic colour', () => {
    fly(BRAND_THEME);
    const tokens = createTokens(rt({ TERM: 'xterm' }));
    expect(tokens.command('x')).toBe('\u001B[31mx\u001B[39m');
    expect(tokens.flag('x')).toBe('\u001B[32mx\u001B[39m');
  });

  it('an explicit theme wins over the one flown', () => {
    fly(BRAND_THEME);
    const tokens = createTokens(rt({ TERM: 'xterm' }), { theme: { ...BRAND_THEME, command: ['underline'] } });
    expect(tokens.command('x')).toBe('\u001B[4mx\u001B[24m');
  });
});
