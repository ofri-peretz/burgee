/**
 * controlroom R3 — `tabBar`. Its static projection is the active tab's label, so a pipe is
 * told which view it is reading once per switch; on a terminal every tab is drawn and the
 * active one is marked — by the `heading` token, or by brackets when that paints nothing.
 */
import { flown } from 'roundel/policy';
import { describe, expect, it } from 'vitest';

import { hoist, manualClock, type Runtime } from './loop.js';
import { registered } from './plugin.js';
import { tabBar } from './tab-bar.js';

const tabs = ['Status', 'Tail logs', 'Visualizer'];

describe('controlroom R3 · tabBar', () => {
  it('the static projection is the active tab’s label and nothing else', () => {
    expect(tabBar().static({ tabs, active: 1 })).toBe('Tail logs');
    expect(tabBar().static({ tabs, active: 3 })).toBe('');
    expect(tabBar().static({ tabs: [], active: 0 })).toBe('');
  });

  it('hoisted on a pipe, it prints a label per switch and nothing while the tab stays', () => {
    const out: string[] = [];
    const rt: Runtime = { env: {}, isTTY: { stdout: false }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => undefined }, clock: manualClock() };
    const flag = hoist(tabBar(), rt, { tabs, active: 0 });
    flag.update({ tabs, active: 0 });
    flag.update({ tabs, active: 2 });
    flag.lower();
    expect(out.join('')).toBe('Status\nVisualizer\n');
  });

  it('on a terminal without colour, every tab is drawn and the active one is bracketed', () => {
    expect(tabBar().frame?.(0, { tabs, active: 1 })).toBe('Status · [Tail logs] · Visualizer');
    expect(tabBar({ separator: ' | ' }).frame?.(0, { tabs, active: 0 })).toBe('[Status] | Tail logs | Visualizer');
    expect(tabBar().frame?.(0, { tabs, active: -1 })).toBe('Status · Tail logs · Visualizer');
  });

  it('with colour, the active tab is styled through roundel’s `heading` token instead', () => {
    flown.level = 1;
    flown.paint = { heading: ['bold'], muted: ['dim'] };
    try {
      expect(tabBar().frame?.(0, { tabs: ['A', 'B'], active: 0 })).toBe('\u001B[1mA\u001B[22m\u001B[2m · \u001B[22m\u001B[2mB\u001B[22m');
    } finally {
      flown.level = 0;
      flown.paint = {};
    }
  });

  it('is registered as a built-in through register(), with a sample `flagstaff check` can show', () => {
    const builtin = registered().components.get('tab-bar');
    expect(builtin?.name).toBe('tab-bar');
    expect(builtin?.static(builtin.sample?.done)).toBe('Tail logs');
    expect(builtin?.frame?.(0, builtin.sample?.running)).toBe('[Status] · Tail logs · Visualizer');
  });
});
