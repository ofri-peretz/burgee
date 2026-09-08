/** The spinner as a component: frames from the style, the static line from the glyphs. */
import { describe, expect, it } from 'vitest';

import { hoist, manualClock, type Runtime } from './loop.js';
import { register } from './plugin.js';
import { spinner } from './spinner.js';

const ESC = '\u001B';

describe('spinner()', () => {
  it('dots by default: the static line is the running glyph, the frame is the style at t', () => {
    const s = spinner();
    expect(s.interval).toBe(80);
    expect(s.static({ text: 'building' })).toBe('… building');
    expect(s.frame?.(0, { text: 'building' })).toBe('⠋ building');
    expect(s.frame?.(80, { text: 'building' })).toBe('⠙ building');
    expect(s.frame?.(800, { text: 'building' })).toBe('⠋ building');
  });

  it("U3 · a style's own static projection is what the static line shows, not the running glyph", () => {
    // Regression: `symbol()` read the registry glyph first, and the built-in plugin always
    // registers a `running` one — so no third-party `static` could ever reach the output,
    // even though `register()` refuses a spinner that omits it.
    register({ name: 'loud', spinners: { loud: { frames: ['x'], interval: 80, static: '!!!DISTINCTIVE!!!' } } });
    expect(spinner('loud').static({ text: 'go' })).toBe('!!!DISTINCTIVE!!! go');
  });

  it('a finished status is the same line in every mode', () => {
    const s = spinner('line');
    expect(s.interval).toBe(130);
    expect(s.static({ text: 'built', status: 'ok' })).toBe('✔ built');
    expect(s.frame?.(999, { text: 'built', status: 'ok' })).toBe('✔ built');
    expect(s.static({ text: 'broke', status: 'fail' })).toBe('✖ broke');
    expect(s.static({ text: 'hm', status: 'warn' })).toBe('⚠ hm');
    expect(s.static({ text: 'fyi', status: 'info' })).toBe('ℹ fyi');
  });

  it('hoisted on a terminal with a manual clock, the frames are exact', () => {
    const out: string[] = [];
    const clock = manualClock();
    const rt: Runtime = { env: {}, isTTY: { stdout: true }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => undefined }, clock };
    const flag = hoist(spinner(), rt, { text: 'x' });
    clock.tick(160);
    flag.lower({ text: 'x', status: 'ok' });
    const frames = out.join('').split(`${ESC}[1G${ESC}[0J`);
    expect(frames).toEqual([`${ESC}[?25l⠋ x`, '⠙ x', '⠹ x', `✔ x\n${ESC}[?25h`]);
  });
});
