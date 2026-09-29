/**
 * What the terminal projection hands `closeout` as its cursor net, graded in-process.
 *
 * `loop-signal.test.ts` proves the net fires on a real signal, in a child, against `dist/` —
 * the only place a signal can be observed. What it cannot say is *which* stream the restore
 * lands on and *in which phase*, from here, where a v8 counter can see it. So `onExit` is
 * replaced by one that keeps what it was given, and the handler is run by hand.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hoist, manualClock, type Runtime } from './loop.js';
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
    expect(w.out.join('')).toBe(`${HIDE_CURSOR}count 0…`);

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
