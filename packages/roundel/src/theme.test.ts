/**
 * R4 and R5: `fly()` sets the theme once, refuses a format styleText does not know, and
 * refuses a truecolor token that would not read against the declared ground.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { BRAND_THEME, currentTheme, DEFAULT_THEME, fly, strike } from './theme.js';

afterEach(() => strike());

describe('fly() sets the process theme once (R4)', () => {
  it('merges over the defaults and is what currentTheme() reports', () => {
    fly({ command: ['underline'] });
    expect(currentTheme()).toEqual({ ...DEFAULT_THEME, command: ['underline'] });
  });

  it('the brand theme flies on the default ground', () => {
    expect(fly(BRAND_THEME)).toEqual(BRAND_THEME);
  });

  it('refuses a format styleText does not know, naming the token', () => {
    expect(() => fly({ ok: ['greenish'] })).toThrow(/"ok" names a format/);
    expect(currentTheme()).toEqual(DEFAULT_THEME);
  });
});

describe('a truecolor token that would not read is refused (R5)', () => {
  it('rock unlifted reads at 3.5:1 on the dark ground and is refused', () => {
    expect(() => fly({ command: '#a84c17' })).toThrow(/"command" \(#a84c17\) reads at 3\.50:1/);
  });

  it('the same colour passes against a ground it reads on', () => {
    expect(() => fly({ command: '#a84c17' }, { ground: '#efe9dd' })).not.toThrow();
  });

  it('never checks a format token: the 16-colour palette is the user’s', () => {
    expect(() => fly({ command: ['yellow'] })).not.toThrow();
  });
});
