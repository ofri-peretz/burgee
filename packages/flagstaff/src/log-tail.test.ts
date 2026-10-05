/**
 * controlroom R3 — `logTail`. The assertion that matters most is the pipe's: a stream that
 * grows prints each line once and repaints nothing, which holds only because the static
 * projection is the whole stream rather than the window. The rest is the window on a
 * terminal (the last `height` rows, with the step in progress kept in view), the registry
 * glyphs a plugin restyles it with, and the built-in that reaches the registry through the
 * public `register()`.
 */
import { flown } from 'roundel/policy';
import { afterEach, describe, expect, it } from 'vitest';

import { type LogLine, logTail, type LogTailState } from './log-tail.js';
import { hoist, manualClock, type Runtime } from './loop.js';
import { register, registered } from './plugin.js';

function world(tty: boolean) {
  const out: string[] = [];
  const rt: Runtime = { env: {}, isTTY: { stdout: tty }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: () => undefined }, clock: manualClock() };
  return { rt, out };
}

const stream: LogLine[] = [{ step: 'Installing packages' }, 'npm install', 'added 12 packages', { step: 'Building' }, 'tsc -p .', 'emitted 40 files', 'done in 2.1s'];
const upTo = (n: number): LogTailState => ({ lines: stream.slice(0, n) });

describe('controlroom R3 · logTail', () => {
  it('the static projection is the whole stream: `┊` before a line, `◆` before a step', () => {
    expect(logTail().static(upTo(3))).toBe('◆ Installing packages\n┊ npm install\n┊ added 12 packages');
    expect(logTail().static({ lines: [] })).toBe('');
  });

  it('hoisted on a pipe, a growing stream prints each line once and repaints nothing', () => {
    const w = world(false);
    const flag = hoist(logTail({ height: 2 }), w.rt, upTo(0));
    for (let n = 1; n <= stream.length; n += 1) flag.update(upTo(n));
    flag.lower();
    const printed = w.out.join('');
    expect(printed).toBe(`${logTail().static(upTo(stream.length))}\n`);
    // A static of the window would slide and print rows again; every row here is unique.
    const rows = printed.trimEnd().split('\n');
    expect(rows).toHaveLength(stream.length);
    expect(new Set(rows).size).toBe(rows.length);
    expect(printed).not.toMatch(/[\r\u001B]/);
    // One write per entry: the stream is appended to, never rewritten.
    expect(w.out).toHaveLength(stream.length);
  });

  it('on a terminal, the frame is the last `height` rows', () => {
    const frame = logTail({ height: 3 }).frame?.(0, { lines: ['a', 'b', 'c', 'd'] });
    expect(frame).toBe('┊ b\n┊ c\n┊ d');
    expect(logTail().frame?.(0, { lines: ['1', '2', '3', '4', '5', '6', '7'] })?.split('\n')).toHaveLength(5);
  });

  it('keeps the step in progress in view, pinned above the tail once it scrolls out', () => {
    // `Building` is the current step; three rows of output have pushed it out of a 3-row window.
    expect(logTail({ height: 3 }).frame?.(0, upTo(7))).toBe('◆ Building\n┊ emitted 40 files\n┊ done in 2.1s');
    // In view, it is drawn where it is and not repeated.
    expect(logTail({ height: 4 }).frame?.(0, upTo(6))).toBe('┊ added 12 packages\n◆ Building\n┊ tsc -p .\n┊ emitted 40 files');
    // Only the latest step is pinned; an earlier one scrolls away like any line.
    expect(logTail({ height: 2 }).frame?.(0, upTo(3))).toBe('◆ Installing packages\n┊ added 12 packages');
  });

  it('a window of one row shows the step in progress, and a height below one is one', () => {
    expect(logTail({ height: 1 }).frame?.(0, upTo(7))).toBe('◆ Building');
    expect(logTail({ height: 0 }).frame?.(0, { lines: ['a', 'b'] })).toBe('┊ b');
  });

  it('a multi-line entry is a row per line, each prefixed; a step continues with `┊`', () => {
    const lines: LogLine[] = [{ step: 'Deploy\nto production' }, 'line one\nline two'];
    expect(logTail().static({ lines })).toBe('◆ Deploy\n┊ to production\n┊ line one\n┊ line two');
    // The step's `◆` row is pinned even when only its continuation is left in the window.
    expect(logTail({ height: 3 }).frame?.(0, { lines })).toBe('◆ Deploy\n┊ line one\n┊ line two');
  });

  it('marks the step in progress with the `heading` token when colour is on, and no other step', () => {
    flown.level = 1;
    flown.paint = { heading: ['bold'], muted: ['dim'] };
    try {
      const frame = logTail({ height: 7 }).frame?.(0, upTo(7)) ?? '';
      expect(frame).toContain('\u001B[1m◆\u001B[22m \u001B[1mBuilding\u001B[22m');
      expect(frame).toContain('\u001B[2m◆\u001B[22m Installing packages');
      expect(frame).toContain('\u001B[2m┊\u001B[22m npm install');
    } finally {
      flown.level = 0;
      flown.paint = {};
    }
  });

  it('is registered as a built-in through register(), with a sample `flagstaff check` can show', () => {
    const builtin = registered().components.get('log-tail');
    expect(builtin?.name).toBe('log-tail');
    expect(builtin?.static(builtin.sample?.running)).toBe('◆ Installing packages\n┊ npm install\n┊ added 12 packages');
    expect(builtin?.frame?.(0, upTo(3))).toBe(logTail().frame?.(0, upTo(3)));
    expect(registered().plugins).toContain('flagstaff');
  });
});

describe('the marks are registry glyphs a plugin replaces', () => {
  afterEach(() => register({ name: 'flagstaff', glyphs: { tail: '┊', step: '◆' } }));

  it('a plugin that ships `tail` and `step` restyles the tail, in both projections', () => {
    register({ name: 'ascii', glyphs: { tail: '|', step: '>' } });
    expect(logTail().static(upTo(2))).toBe('> Installing packages\n| npm install');
    expect(logTail().frame?.(0, upTo(2))).toBe('> Installing packages\n| npm install');
  });
});
