/**
 * R4 and R5 — the theme, and the contrast gate on it. A hex token that would not read on
 * the declared ground is refused before it is flown, at every level, so the failure lands
 * in CI rather than on the one laptop with a truecolor terminal.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { AA, AAA, contrast, reportTheme } from './contrast.js';

import { flown, type Runtime } from './policy.js';
import { audit, fly, rgb256, type Theme, toOklab } from './theme.js';

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
  /**
   * The 256 choices changed on 2026-09-13 and both moved the right way. `degrade` searches
   * OKLab among entries that clear the floor, where `ansi256` rounded each sRGB channel:
   *
   *   error  #f4794a  209 -> 209   unchanged; per-channel already found the best entry
   *   ok     #0d9460   36 ->  65   dE 0.0842 -> 0.0627, and 4.82:1 rather than 7.05:1
   *
   * `ok` trades contrast headroom for hue fidelity and stays above the floor by construction,
   * which is the trade the constraint exists to make safely.
   */
  it('degrades to the nearest readable of 256 at level 2', () => {
    fly({}, colors256);
    expect(flown.level).toBe(2);
    expect(flown.paint.error).toEqual({ sgr: [38, 5, 209] });
    expect(flown.paint.ok).toEqual({ sgr: [38, 5, 65] });
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
describe('the 256-colour substitution is checked, and chosen to pass', () => {
  const ground = '#0a0a0a';

  /**
   * The invariant the last two changes buy together, and the one worth having: **a hex that
   * reads at truecolor also reads at 256.** It did not hold before. Sweeping the sRGB cube
   * found 167 hexes that cleared 4.5:1 and whose per-channel substitute did not — `#7e7e7e`
   * at 4.88:1 rounding to grey-ramp 243 (`#767676`, 4.36:1), `#e418b1` at 4.77:1 rounding
   * through the cube to `#d700af` (4.25:1).
   *
   * Those are the inputs, so those are the test. Each one is accepted now rather than
   * refused, because `degrade` picks a readable entry instead of the arithmetically nearest
   * one — which is a better outcome than the refusal the check alone would have produced.
   */
  it.each(['#7e7e7e', '#e418b1', '#e415b1', '#e412b1'] as const)('%s read at truecolor and not at 256, and now does both', (hex) => {
    expect(contrast(hex, ground)).toBeGreaterThanOrEqual(AA.TEXT);
    expect(() => fly({ ok: hex }, truecolor)).not.toThrow();
    fly({ ok: hex }, colors256);
    const paint = flown.paint.ok as { sgr: number[] };
    const index = paint.sgr[2] as number;
    // The entry the terminal actually receives clears the floor. Not the hex — the entry.
    expect(contrast(rgb256(index), ground)).toBeGreaterThanOrEqual(AA.TEXT);
  });

  /**
   * `degrade` has a fallback for "no entry clears the floor", and it is **unreachable by
   * construction**: entries 16 and 231 are pure black and pure white, and no ground can be
   * more than 4.5:1 from both. The hardest grey ground, `#757575`, still leaves 4.61:1 on the
   * table. Asserted rather than claimed, because an unreachable branch that quietly becomes
   * reachable is how a safety net turns into dead code nobody noticed.
   */
  it('never has to fall back: every ground leaves a readable entry', () => {
    const worst = Array.from({ length: 256 }, (_, v) => {
      const g = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
      let best = 0;
      for (let i = 16; i <= 255; i++) best = Math.max(best, contrast(rgb256(i), g));
      return best;
    });
    expect(Math.min(...worst)).toBeGreaterThanOrEqual(AA.TEXT);
  });

  /**
   * Level 1 is absent and stays absent. The basic sixteen *are* the user's terminal theme, so
   * there is no RGB to measure — `contrast.ts` says so, and inventing a number there would be
   * worse than declining to. `ansi16` keeps its per-channel rounding for the same reason:
   * there is no ground-relative choice to make over values that are not ours.
   */
  it('says nothing about the sixteen, because there is nothing to say', () => {
    fly({ ok: '#7e7e7e' }, { ...truecolor, env: { FORCE_COLOR: '1' } });
    expect(flown.level).toBe(1);
    // And here is the limitation at its starkest: a mid-grey becomes plain `black`, which on
    // a near-black ground is invisible. roundel still refuses to call that a failure, and is
    // right to — the user's `black` is whatever their terminal says it is, and on a light
    // scheme this is the most readable answer available. A number here would be fiction, so
    // the honest move is to paint the nearest name and stay quiet about the ratio.
    expect(flown.paint.ok).toEqual(['black']);
  });
});

/**
 * The OKLab transform, against values that did not come from it.
 *
 * Every other assertion about `degrade` computes distance with whatever matrix is in the file,
 * so all of them agree with a wrong one — a mutation of the first coefficient left the whole
 * suite green. These five are Björn Ottosson's published reference values, and they are the
 * only thing here that would notice.
 */
describe('toOklab', () => {
  const PLACES = 6;
  it.each([
    ['#ffffff', [255, 255, 255], [1, 0, 0]],
    ['#000000', [0, 0, 0], [0, 0, 0]],
    ['#ff0000', [255, 0, 0], [0.627_955_4, 0.224_863_1, 0.125_846_3]],
    ['#00ff00', [0, 255, 0], [0.866_439_6, -0.233_887_6, 0.179_498_5]],
    ['#0000ff', [0, 0, 255], [0.452_013_7, -0.032_457, -0.311_528_1]],
  ] as const)('%s', (_hex, [r, g, b], [L, a, bb]) => {
    const [gotL, gotA, gotB] = toOklab(r, g, b);
    expect(gotL).toBeCloseTo(L, PLACES);
    expect(gotA).toBeCloseTo(a, PLACES);
    expect(gotB).toBeCloseTo(bb, PLACES);
  });

  /** Lightness is monotonic in grey, which no single reference value would catch. */
  it('is monotonic in lightness along the grey axis', () => {
    const greys = Array.from({ length: 16 }, (_, i) => toOklab(i * 17, i * 17, i * 17)[0]);
    for (let i = 1; i < greys.length; i++) expect(greys[i] as number).toBeGreaterThan(greys[i - 1] as number);
  });
});

/**
 * `conformance` — the knob a team turns when AA is not enough: low vision, a projector, a
 * terminal in daylight, an accessibility policy that says AAA and does not care that this is a
 * terminal.
 *
 * The thing worth testing is not that 7 is bigger than 4.5. It is that the **two** users of the
 * floor move together — the check that refuses a theme, and the search that picks the
 * 256-colour substitute. If only one moved, a caller asking for AAA would get a verdict at one
 * standard and a colour chosen at another, which is worse than not offering the option.
 */
describe('conformance: AA by default, AAA on request', () => {
  const ground = '#0a0a0a';

  it('defaults to AA, and says which level it judged by', () => {
    let message = '';
    try {
      fly({ ok: '#0a6b47' }, truecolor);
    } catch (error) {
      message = (error as Error).message;
    }
    // 3.02:1 — under AA, and the message names the level so a reader knows which bar was used.
    expect(message).toContain('below 4.5:1 (WCAG AA)');
  });

  it('refuses at AAA what it accepts at AA', () => {
    // `#0d9460` is 5.11:1: fine at AA, short of AAA's 7:1.
    expect(contrast('#0d9460', ground)).toBeGreaterThanOrEqual(AA.TEXT);
    expect(contrast('#0d9460', ground)).toBeLessThan(AAA.TEXT);
    expect(() => fly({ ok: '#0d9460' }, truecolor)).not.toThrow();
    expect(() => fly({ ok: '#0d9460', conformance: 'AAA' }, truecolor)).toThrow(/below 7:1 \(WCAG AAA\)/);
  });

  /**
   * The half that would rot first. Raising the floor has to raise the *search* too, or AAA
   * would accept a hex at 7:1 and then hand the terminal a 256-colour entry at 5:1.
   */
  it('picks a 256-colour substitute that clears the level it was asked for', () => {
    for (const conformance of ['AA', 'AAA'] as const) {
      const floor = conformance === 'AAA' ? AAA.TEXT : AA.TEXT;
      // `#eeeeee` clears both at truecolor, so the only question is what the cube returns.
      fly({ ok: '#eeeeee', conformance }, { ...truecolor, env: { TERM: 'xterm-256color' } });
      const index = (flown.paint.ok as { sgr: number[] }).sgr[2] as number;
      expect(contrast(rgb256(index), ground), `${conformance}: entry ${String(index)}`).toBeGreaterThanOrEqual(floor);
    }
  });

  /**
   * And AAA is not the default for a measurable reason rather than a cautious one: at 7:1 the
   * cube runs out of room. Counted over the sRGB sweep so the README can say it.
   */
  it('AAA leaves materially fewer usable palette entries, which is why it is opt-in', () => {
    const usable = (floor: number): number => {
      let n = 0;
      for (let i = 16; i <= 255; i++) if (contrast(rgb256(i), ground) >= floor) n++;
      return n;
    };
    expect(usable(AA.TEXT)).toBeGreaterThan(usable(AAA.TEXT));
    // The actual numbers, pinned: if the palette maths changes these move and somebody looks.
    // On near-black: AAA costs 49 of the 179 entries AA can use, a 27% narrower palette.
    expect(usable(AA.TEXT)).toBe(179);
    expect(usable(AAA.TEXT)).toBe(130);
  });
});

/**
 * `audit()` — the answer to "is my colouring WCAG AA?", asked without an exception.
 *
 * `fly()` refuses at startup, which is right there and useless while somebody is choosing
 * colours: knowing should not require catching. And because `fly()` is now a filter over
 * `audit()`, the two cannot disagree — which is the property worth testing, not the formatting.
 */
describe('audit: the verdict as data', () => {
  it('reports two rows per hex token, truecolor and 256, and none for sixteen', () => {
    const rows = audit();
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.at))).toEqual(new Set(['truecolor', '256']));
    // One row per level per hex token, so the count is even and the levels are balanced.
    expect(rows.filter((r) => r.at === 'truecolor')).toHaveLength(rows.filter((r) => r.at === '256').length);
  });

  it('does not throw on a theme fly() would refuse — that is the whole point', () => {
    expect(() => fly({ ok: '#0a6b47' }, truecolor)).toThrow();
    const rows = audit({ ok: '#0a6b47' });
    expect(rows.some((r) => !r.passes)).toBe(true);
    expect(rows.find((r) => r.token === 'ok' && r.at === 'truecolor')?.ratio).toBe(3.02);
  });

  /**
   * The invariant, and the reason `fly()` was rewritten rather than left alongside: a theme
   * refused by one and reported clean by the other is the bug that makes an audit worthless.
   */
  it.each<Theme>([{}, { ok: '#0a6b47' }, { error: '#2f7d52' }, { ok: '#7e7e7e' }, { ok: '#0d9460', conformance: 'AAA' }])(
    'fly() refuses exactly when audit() finds a failure: %j',
    (theme) => {
      const clean = audit(theme).every((r) => r.passes);
      let threw = false;
      try {
        fly(theme, truecolor);
      } catch {
        threw = true;
      }
      expect(threw).toBe(!clean);
    },
  );

  it('follows the conformance level it was given', () => {
    // 5.11:1 — clean at AA, a failure at AAA, from the same colour and the same ground.
    expect(audit({ ok: '#0d9460' }).every((r) => r.passes)).toBe(true);
    expect(audit({ ok: '#0d9460', conformance: 'AAA' }).some((r) => !r.passes)).toBe(true);
    expect(audit({ conformance: 'AAA' }).every((r) => r.required === AAA.TEXT)).toBe(true);
  });

  it('says nothing about a token given format names, because there is nothing to measure', () => {
    expect(audit({ ok: ['bold', 'green'] }).some((r) => r.token === 'ok')).toBe(false);
  });
});

describe('reportTheme', () => {
  it('prints the passing rows too, so silence is not mistaken for a clean bill', () => {
    const text = reportTheme(audit({ ok: '#0a6b47' }));
    expect(text).toContain('pass');
    expect(text).toContain('FAIL');
    expect(text).toMatch(/FAIL\s+ok\s+truecolor\s+#0a6b47 on #0a0a0a\s+3\.02:1 \(needs 4\.5:1\)/);
  });

  it('says so when there is nothing to check rather than printing an empty report', () => {
    // An all-format-name theme has no ratios. An empty string would read as "all clear".
    expect(reportTheme([])).toContain('no hex tokens to check');
  });
});
