/**
 * What the terminal projection hands `closeout` as its cursor net, graded in-process.
 *
 * `loop-signal.test.ts` proves the net fires on a real signal, in a child, against `dist/` —
 * the only place a signal can be observed. What it cannot say is *which* stream the restore
 * lands on and *in which phase*, from here, where a v8 counter can see it. So `onExit` is
 * replaced by one that keeps what it was given, and the handler is run by hand.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { frameWriter, hoist, manualClock, type Runtime, type Writer } from './loop.js';
import { HIDE_CURSOR, SHOW_CURSOR } from './projection.js';

interface Registration {
  handler: () => unknown;
  spec: unknown;
  dropped: boolean;
}

const registrations: Registration[] = [];

vi.mock('closeout', async (original) => ({
  ...(await original<typeof import('closeout')>()),
  onExit: (handler: () => unknown, spec?: unknown) => {
    const registration: Registration = { handler, spec, dropped: false };
    registrations.push(registration);
    return () => {
      registration.dropped = true;
    };
  },
}));

function terminal() {
  const out: string[] = [];
  const err: string[] = [];
  const rt: Runtime = { env: {}, isTTY: { stdout: true }, stdout: { write: (s: string) => out.push(s) }, stderr: { write: (s: string) => err.push(s) }, clock: manualClock() };
  return { rt, out, err };
}

const counter = { name: 'counter', static: (s: { n: number }) => `count ${s.n}`, frame: (_t: number, s: { n: number }) => `count ${s.n}…` };

describe('the cursor net a hoisted frame stands up', () => {
  beforeEach(() => {
    registrations.length = 0;
  });

  it('is registered in the restore phase, and shows the cursor on the runtime’s own stdout', () => {
    const w = terminal();
    hoist(counter, w.rt, { n: 0 });
    expect(registrations).toHaveLength(1);
    const [net] = registrations;
    expect(net?.spec).toEqual({ phase: 'restore' });
    expect(w.out.join('')).toBe(`${HIDE_CURSOR}\u001B[?2026hcount 0…\u001B[?2026l`);

    // What an exit mid-frame runs: the cursor back, on the stream that hid it — not stderr.
    w.out.length = 0;
    net?.handler();
    expect(w.out).toEqual([SHOW_CURSOR]);
    expect(w.err).toEqual([]);
  });

  it('comes down with the frame, so an exit after lower() writes no second show', () => {
    const w = terminal();
    const flag = hoist(counter, w.rt, { n: 0 });
    expect(registrations[0]?.dropped).toBe(false);
    flag.lower({ n: 1 });
    expect(registrations[0]?.dropped).toBe(true);
  });
});

const unstyled = (s: string): string => s.replaceAll(/\u001B\[[\d;]*m/g, '');

/** A writer with a height that a test can change between paints. */
function screen(rows: number | undefined) {
  const writes: string[] = [];
  let height = rows;
  const out: Writer = {
    write: (s: string) => writes.push(s),
    columns: 80,
    get rows() {
      return height;
    },
  };
  return { out, writes, resize: (to: number) => void (height = to) };
}

/** The largest climb in one write: a repaint can never reach above the top row. */
const climb = (bytes: string): number => Math.max(0, ...[...bytes.matchAll(/\u001B\[(\d+)A/g)].map((m) => Number(m[1])));

/**
 * frames-fit-the-screen R1–R3, R5. A live frame taller than the terminal is clipped to its
 * tail under one `… N more` line, so the repaint never climbs above the top row; `release`
 * writes it whole; a new height repaints; and a pipe, which never repaints, is never clipped.
 */
describe('a live frame never outgrows the terminal', () => {
  const ESC = '\u001B';
  const fifty = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);

  it('R1, R2 · a 50-line frame on 20 rows paints its last 19 lines under one summary line', () => {
    const { out, writes } = screen(20);
    const frame = frameWriter(out);
    frame.paint(fifty);
    const painted = unstyled(writes.join('')).replace(`${ESC}[?2026h`, '').replace(`${ESC}[?2026l`, '').split('\n');
    expect(painted).toEqual(['… 31 more', ...fifty.slice(31)]);
    frame.paint([...fifty.slice(0, 49), 'line 50 changed']);
    expect(climb(writes.join(''))).toBeLessThan(20);
  });

  it('R1 · the height is read at every paint, so a writer without one is never clipped', () => {
    const { out, writes } = screen(undefined);
    frameWriter(out).paint(fifty);
    expect(writes.join('')).toContain(fifty.join('\n'));
    expect(unstyled(writes.join(''))).not.toContain('more');
  });

  it('R1 · a frame that fits is written as it always was', () => {
    const fits = screen(20);
    const unbounded = screen(undefined);
    frameWriter(fits.out).paint(fifty.slice(0, 20));
    frameWriter(unbounded.out).paint(fifty.slice(0, 20));
    expect(fits.writes).toEqual(unbounded.writes);
  });

  it('R2 · release writes the clipped frame whole, once, from the top of what was shown', () => {
    const { out, writes } = screen(20);
    const frame = frameWriter(out);
    frame.paint(fifty);
    writes.length = 0;
    frame.release();
    expect(writes).toEqual([`${ESC}[?2026h${ESC}[1G${ESC}[19A${ESC}[0J${fifty.join('\n')}${ESC}[?2026l`]);
    frame.release();
    expect(writes).toHaveLength(1);
  });

  it('R2 · release after a frame that fit writes nothing', () => {
    const { out, writes } = screen(20);
    const frame = frameWriter(out);
    frame.paint(fifty.slice(0, 5));
    writes.length = 0;
    frame.release();
    expect(writes).toEqual([]);
  });

  it('R3 · a resize from 20 rows to 60 repaints the whole frame and erases the summary', () => {
    const { out, writes, resize } = screen(20);
    const frame = frameWriter(out);
    frame.paint(fifty);
    resize(60);
    writes.length = 0;
    frame.paint(fifty);
    expect(writes).toEqual([`${ESC}[?2026h${ESC}[1G${ESC}[19A${ESC}[0J${fifty.join('\n')}${ESC}[?2026l`]);
  });

  it('R3 · a resize from 60 rows to 20 clips the next paint', () => {
    const { out, writes, resize } = screen(60);
    const frame = frameWriter(out);
    frame.paint(fifty);
    resize(20);
    writes.length = 0;
    frame.paint(fifty);
    expect(unstyled(writes.join(''))).toContain(['… 31 more', ...fifty.slice(31)].join('\n'));
  });

  it('R2 · a hoisted component taller than the terminal is clipped live and left whole', () => {
    const out: string[] = [];
    const rt: Runtime = { env: {}, isTTY: { stdout: true }, stdout: { write: (s: string) => out.push(s), rows: 20 }, stderr: { write: () => undefined }, clock: manualClock() };
    const tall = { name: 'tall', static: () => fifty.join('\n'), frame: () => fifty.join('\n') };
    const flag = hoist(tall, rt, {});
    expect(unstyled(out.join(''))).toContain('… 31 more');
    expect(climb(out.join(''))).toBeLessThan(20);
    flag.lower({});
    expect(out.join('')).toContain(fifty.join('\n'));
  });

  it('R5 · the static projection of a 50-line frame is every line, byte for byte, whatever the height', () => {
    const out: string[] = [];
    const rt: Runtime = { env: {}, isTTY: { stdout: false }, stdout: { write: (s: string) => out.push(s), rows: 20 }, stderr: { write: () => undefined }, clock: manualClock() };
    const tall = { name: 'tall', static: () => fifty.join('\n'), frame: () => fifty.join('\n') };
    hoist(tall, rt, {}).lower({});
    expect(out).toEqual([`${fifty.join('\n')}\n`]);
  });
});
