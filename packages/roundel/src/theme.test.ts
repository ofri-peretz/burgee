/**
 * R4 and R5 — the theme, and the contrast gate on it. A hex token that would not read on
 * the declared ground is refused before it is flown, at every level, so the failure lands
 * in CI rather than on the one laptop with a truecolor terminal.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { flown, type Runtime } from './policy.js';
import { fly } from './theme.js';

const truecolor: Runtime = { env: { COLORTERM: 'truecolor' }, isTTY: { stdout: true } };
const colors256: Runtime = { env: { TERM: 'xterm-256color' }, isTTY: { stdout: true } };
const colors16: Runtime = { env: { TERM: 'xterm' }, isTTY: { stdout: true } };
const pipe: Runtime = { env: { COLORTERM: 'truecolor' }, isTTY: { stdout: false } };

const DEEP_ROCK = { sgr: [38, 2, 168, 76, 23] };
const LIFTED_ROCK = { sgr: [38, 2, 244, 121, 74] };
const DEEP_JUNIPER = { sgr: [38, 2, 10, 107, 71] };
const LIFTED_JUNIPER = { sgr: [38, 2, 13, 148, 96] };

beforeEach(() => {
  flown.level = 0;
  flown.paint = {};
});

describe('fly — defaults', () => {
  it('flies the lifted brand on the near-black default ground', () => {
    fly({}, truecolor);
    expect(flown.level).toBe(3);
    expect(flown.paint.error).toEqual(LIFTED_ROCK);
    expect(flown.paint.ok).toEqual(LIFTED_JUNIPER);
  });

  it('flies the deep brand on a light ground', () => {
    fly({ ground: '#ffffff' }, truecolor);
    expect(flown.paint.error).toEqual(DEEP_ROCK);
    expect(flown.paint.ok).toEqual(DEEP_JUNIPER);
  });

  it('leaves the other seven to the terminal palette, as format names', () => {
    fly({}, truecolor);
    expect(flown.paint.command).toEqual(['bold']);
    expect(flown.paint.heading).toEqual(['bold', 'underline']);
    expect(flown.paint.muted).toEqual(['gray']);
  });

  it('a partial theme keeps the defaults for the rest', () => {
    fly({ warn: ['red'] }, truecolor);
    expect(flown.paint.warn).toEqual(['red']);
    expect(flown.paint.error).toEqual(LIFTED_ROCK);
    expect(flown.paint.command).toEqual(['bold']);
  });

  it('a later fly() replaces the theme', () => {
    fly({ warn: ['red'] }, truecolor);
    fly({}, colors16);
    expect(flown.level).toBe(1);
    expect(flown.paint.warn).toEqual(['yellow']);
  });
});

describe('fly — hex below truecolor', () => {
  it('falls back to the nearest of 256 at level 2', () => {
    fly({}, colors256);
    expect(flown.level).toBe(2);
    expect(flown.paint.error).toEqual({ sgr: [38, 5, 209] });
    expect(flown.paint.ok).toEqual({ sgr: [38, 5, 36] });
  });

  it('falls back to the nearest of 16 at level 1, as a styleText name', () => {
    fly({ hint: '#808080', value: '#ffffff', muted: '#40ffff' }, colors16);
    expect(flown.level).toBe(1);
    expect(flown.paint.error).toEqual(['redBright']);
    expect(flown.paint.ok).toEqual(['green']);
    expect(flown.paint.hint).toEqual(['white']);
    expect(flown.paint.value).toEqual(['whiteBright']);
    expect(flown.paint.muted).toEqual(['cyanBright']);
  });

  it('reads the 256-colour grey ramp for greys', () => {
    fly({ hint: '#808080', value: '#ffffff', ground: '#000000' }, colors256);
    expect(flown.paint.hint).toEqual({ sgr: [38, 5, 244] });
    expect(flown.paint.value).toEqual({ sgr: [38, 5, 231] });
  });
});

describe('fly — the contrast gate (R5)', () => {
  it('refuses a truecolor token below 4.5:1 against the ground, naming token and ratio', () => {
    expect(() => fly({ error: '#a84c17' }, truecolor)).toThrow(/error #a84c17 on #0a0a0a is 3\.50:1/);
  });

  it('refuses it at level 0 too: the check is about the declaration, not this terminal', () => {
    expect(() => fly({ error: '#a84c17' }, pipe)).toThrow(/3\.50:1/);
    expect(flown.paint.error).toBeUndefined();
  });

  it('refuses the brand itself on a ground neither variant can read on, naming every failure', () => {
    expect(() => fly({ ground: '#808080' }, truecolor)).toThrow(/error .*; ok /);
  });

  it('never checks or claims a format list — that palette is the terminal\'s', () => {
    expect(() => fly({ error: ['black'], ground: '#000000' }, truecolor)).not.toThrow();
  });

  it('rejects something that is not a hex colour', () => {
    expect(() => fly({ error: '#red' }, truecolor)).toThrow(/not a hex colour/);
  });

  it('leaves the previous theme flying when the new one is refused', () => {
    fly({ warn: ['red'] }, truecolor);
    expect(() => fly({ error: '#a84c17' }, truecolor)).toThrow();
    expect(flown.paint.warn).toEqual(['red']);
  });
});

describe('fly — json', () => {
  it('flies at level 0 when the run was asked for --json', () => {
    fly({}, truecolor, { json: true });
    expect(flown.level).toBe(0);
  });
});

/**
 * The contrast promise used to be made about the hex and kept about nothing else. `fly()`
 * checked `contrast(style, ground)` while `resolve()` sent the terminal a *different* colour
 * at level 2 — so the guarantee covered a colour the terminal never received, and the header
 * said "whatever the level" while meaning "at truecolor".
 *
 * Both colours that can reach a terminal are checked now, at every level, so a theme that
 * would fail on somebody's 256-colour terminal fails in CI on a truecolor one.
 */
describe('the 256-colour substitution is checked too', () => {
  const ground = '#0a0a0a';
  /**
   * `#7e7e7e` reads at 4.88:1 against near-black and the grey ramp rounds it to index 243,
   * `#767676`, which is 4.36:1 — under the floor. One of 167 such hexes found by sweeping the
   * sRGB cube, so this is a class of input and not a curiosity; `#e418b1` -> `#d700af`
   * (4.77 -> 4.25) is the same failure through the colour cube rather than the grey ramp.
   */
  it('refuses a hex that reads at truecolor and not at 256', () => {
    let message = '';
    try {
      fly({ ok: '#7e7e7e' }, truecolor);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('ok #7e7e7e at 256 colours is #767676 on #0a0a0a, 4.36:1');
    // And not for the truecolor value, which is above the floor: the two checks are separate
    // verdicts on two different colours, not one verdict reported twice.
    expect(message).not.toContain('ok #7e7e7e on #0a0a0a');
  });

  it('accepts the defaults, which clear both', () => {
    // `brand()` picks the lighter of each pair against near-black, and both survive the cube.
    expect(() => fly({}, truecolor)).not.toThrow();
    expect(() => fly({}, { ...truecolor, env: { FORCE_COLOR: '2' } })).not.toThrow();
  });

  /**
   * Level 1 is absent and stays absent. The basic sixteen are the user's own terminal theme,
   * so there is no RGB to measure — `contrast.ts` says so, and inventing a number there would
   * be worse than declining to.
   */
  it('says nothing about the sixteen, because there is nothing to say', () => {
    let message = '';
    try {
      fly({ ok: '#7e7e7e' }, { ...truecolor, env: { FORCE_COLOR: '1' } });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('at 256 colours');
    expect(message).not.toContain('16 colours');
  });

  /** The check is the same on every run, so a developer on truecolor sees what CI sees. */
  it('gives the same verdict at every level', () => {
    const verdict = (env: Record<string, string>): string => {
      try {
        fly({ ok: '#7e7e7e' }, { ...truecolor, env });
        return 'accepted';
      } catch (error) {
        return (error as Error).message;
      }
    };
    const atTruecolor = verdict({ COLORTERM: 'truecolor' });
    expect(verdict({ FORCE_COLOR: '2' })).toBe(atTruecolor);
    expect(verdict({ FORCE_COLOR: '1' })).toBe(atTruecolor);
  });
});
