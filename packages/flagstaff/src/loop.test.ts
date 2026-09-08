/**
 * R1 — one component, five modes, one answer each; R5 — nothing but text off a terminal;
 * R9 — the same bytes every run. The runtime is a literal and the clock is manual, so every
 * assertion here is exact.
 */
import { describe, expect, it } from 'vitest';

import { hoist, manualClock, type Runtime } from './loop.js';
import { type Component } from './plugin.js';
import { HIDE_CURSOR, SHOW_CURSOR } from './projection.js';

const ESC = '\u001B';
/** What one repaint writes before the next frame: column 1, clear to the end of the screen. */
const ERASE_ONE = `${ESC}[1G${ESC}[0J`;

interface Count {
  n: number;
}
const INTERVAL = 100;
const counter: Component<Count> = {
  name: 'counter',
  interval: INTERVAL,
  static: (s) => `count ${s.n}`,
  frame: (t, s) => `count ${s.n} @${t}`,
};

type Mode = 'tty' | 'pipe' | 'ci' | 'json' | 'accessible';
const ENV: Record<Mode, Record<string, string>> = { tty: {}, pipe: {}, ci: { CI: 'true' }, json: {}, accessible: { CLI_ACCESSIBLE: '1' } };

function world(mode: Mode) {
  const out: string[] = [];
  const err: string[] = [];
  const clock = manualClock();
  const rt: Runtime = { env: ENV[mode], isTTY: { stdout: mode === 'tty' }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, clock };
  return { rt, clock, json: mode === 'json', stdout: () => out.join(''), stderr: () => err.join('') };
}

/** Hoist at 0, let two frames pass, change once, one more frame, lower with a final state. */
function transcript(mode: Mode) {
  const w = world(mode);
  const flag = hoist(counter, w.rt, { n: 0 }, { json: w.json });
  w.clock.tick(INTERVAL * 2 + INTERVAL / 2);
  flag.update({ n: 1 });
  w.clock.tick(INTERVAL);
  flag.lower({ n: 2 });
  return { mode: flag.mode, stdout: w.stdout(), stderr: w.stderr() };
}

describe('R1 · one component, five modes', () => {
  it('tty: repaints in place on the clock, and leaves the static line behind', () => {
    const { mode, stdout, stderr } = transcript('tty');
    expect(mode).toBe('tty');
    expect(stdout).toBe(
      [HIDE_CURSOR, 'count 0 @0', ERASE_ONE, 'count 0 @100', ERASE_ONE, 'count 0 @200', ERASE_ONE, 'count 1 @250', ERASE_ONE, 'count 1 @300', ERASE_ONE, 'count 2\n', SHOW_CURSOR].join(''),
    );
    expect(stderr).toBe('');
  });

  it.each<Mode>(['pipe', 'ci', 'accessible'])('%s: the static projection once per state change, no repaint', (mode) => {
    const t = transcript(mode);
    expect(t.mode).toBe(mode);
    expect(t.stdout).toBe('count 0\ncount 1\ncount 2\n');
    expect(t.stderr).toBe('');
  });

  it('json: one NDJSON event per transition on stderr, stdout untouched', () => {
    const { mode, stdout, stderr } = transcript('json');
    expect(mode).toBe('json');
    expect(stdout).toBe('');
    expect(stderr.trimEnd().split('\n').map((l) => JSON.parse(l) as unknown)).toEqual([
      { event: 'counter', state: { n: 0 } },
      { event: 'counter', state: { n: 1 } },
      { event: 'counter', state: { n: 2 } },
    ]);
  });

  it('a change that leaves the static text the same prints nothing off a terminal', () => {
    const w = world('pipe');
    const flag = hoist(counter, w.rt, { n: 0 });
    flag.update({ n: 0 });
    flag.update({ n: 0 });
    flag.lower();
    expect(w.stdout()).toBe('count 0\n');
  });

  it('a component with no frame still hoists on a terminal: its static text, repainted on change only', () => {
    const w = world('tty');
    const flag = hoist({ name: 'plain', static: (s: Count) => `n=${s.n}` }, w.rt, { n: 1 });
    w.clock.tick(INTERVAL * 5);
    flag.update({ n: 2 });
    flag.lower();
    expect(w.stdout()).toBe(`${HIDE_CURSOR}n=1${ERASE_ONE}n=2${ERASE_ONE}n=2\n${SHOW_CURSOR}`);
  });

  it('a multi-line frame is erased from its first line', () => {
    const w = world('tty');
    const flag = hoist({ name: 'two', static: () => 'a\nb' }, w.rt, undefined);
    flag.lower();
    expect(w.stdout()).toBe(`${HIDE_CURSOR}a\nb${ESC}[1G${ESC}[1A${ESC}[0Ja\nb\n${SHOW_CURSOR}`);
  });

  it('after lower, update and lower are no-ops and the clock is released', () => {
    const w = world('tty');
    const flag = hoist(counter, w.rt, { n: 0 });
    flag.lower();
    const after = w.stdout();
    flag.update({ n: 9 });
    flag.lower({ n: 9 });
    w.clock.tick(INTERVAL * 10);
    expect(w.stdout()).toBe(after);
  });
});

describe('R5 · off a terminal, nothing but text', () => {
  it.each<Mode>(['pipe', 'ci', 'json', 'accessible'])('%s output carries no carriage return and no escape', (mode) => {
    const { stdout, stderr } = transcript(mode);
    expect(stdout + stderr).not.toMatch(/[\r\u001B]/);
  });
});

describe('R9 · deterministic', () => {
  it('the tty transcript is the same bytes twenty runs over', () => {
    const first = transcript('tty').stdout;
    for (let i = 0; i < 20; i += 1) expect(transcript('tty').stdout).toBe(first);
  });
});

describe('manualClock', () => {
  it('runs callbacks earliest first, in scheduling order among ties, and only up to the tick', () => {
    const clock = manualClock();
    const ran: string[] = [];
    clock.schedule(() => ran.push('b'), 20);
    clock.schedule(() => ran.push('a'), 10);
    clock.schedule(() => ran.push('a2'), 10);
    clock.schedule(() => ran.push('late'), 100);
    clock.tick(50);
    expect(ran).toEqual(['a', 'a2', 'b']);
    expect(clock.now()).toBe(50);
  });

  it('a cancelled callback never runs', () => {
    const clock = manualClock();
    let ran = false;
    const cancel = clock.schedule(() => {
      ran = true;
    }, 5);
    cancel();
    clock.tick(10);
    expect(ran).toBe(false);
  });

  it('a callback that reschedules itself at 0 ms hits the ceiling instead of hanging the test', () => {
    const clock = manualClock();
    const again = (): void => {
      clock.schedule(again, 0);
    };
    clock.schedule(again, 0);
    expect(() => clock.tick(1)).toThrow(/1000 callbacks/);
  });
});
