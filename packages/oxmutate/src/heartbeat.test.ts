import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { beatAge, beatFile, classifyStall, cpuShare, HEARTBEAT_MS, IDLE_CPU, MIN_CPU_SPAN_MS, STALE_MS, startHeartbeat } from './heartbeat.js';

const realNow = Date.now.bind(Date);
const dir = mkdtempSync(path.join(tmpdir(), 'oxmutate-heartbeat-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('classifyStall: idle is a live beat and under IDLE_CPU of a core; anything else is busy', () => {
  it('reads a prompt awaiting a keypress (live beat, 0–2% CPU) as idle', () => {
    expect(classifyStall({ beatAge: 100, cpuShare: 0 })).toBe('idle');
    expect(classifyStall({ beatAge: STALE_MS - 1, cpuShare: 0.02 })).toBe('idle');
  });
  it('reads a loop (stale beat, about a core) as busy', () => {
    expect(classifyStall({ beatAge: 9000, cpuShare: 0.72 })).toBe('busy');
  });
  it('reads a live beat that burns CPU (a slow test on a loaded machine) as busy', () => {
    expect(classifyStall({ beatAge: 100, cpuShare: IDLE_CPU })).toBe('busy');
  });
  it('reads a stale beat at 0% CPU (a worker blocked in a synchronous wait) as busy', () => {
    expect(classifyStall({ beatAge: STALE_MS, cpuShare: 0 })).toBe('busy');
  });
  it('reads a stop with no CPU reading as busy: the re-run decides it, as before', () => {
    expect(classifyStall({ beatAge: 0, cpuShare: undefined })).toBe('busy');
  });
});

describe('cpuShare: one core is 1, over the last CPU_WINDOW_MS', () => {
  const now = 10_000;
  it('reads a core\'s worth of CPU time as 1 and none as 0', () => {
    expect(cpuShare([{ at: now - 1000, us: 0 }, { at: now, us: 1_000_000 }], now)).toBe(1);
    expect(cpuShare([{ at: now - 750, us: 5 }, { at: now, us: 5 }], now)).toBe(0);
  });
  it('reads only the window: an earlier burst does not count', () => {
    expect(cpuShare([{ at: now - 5000, us: 0 }, { at: now - 1000, us: 4_000_000 }, { at: now, us: 4_000_000 }], now)).toBe(0);
  });
  it('gives no reading from samples spanning less than MIN_CPU_SPAN_MS', () => {
    expect(cpuShare([{ at: now - MIN_CPU_SPAN_MS + 1, us: 0 }, { at: now, us: 0 }], now)).toBeUndefined();
    expect(cpuShare([], now)).toBeUndefined();
  });
});

describe('the beat', () => {
  afterEach(() => vi.useRealTimers());

  it('names a server\'s beat by its pid, in the work directory', () => {
    expect(beatFile(dir, 42)).toBe(path.join(dir, 'beat-42'));
  });

  it('reads as never when nothing beat, and as fresh just after a beat', () => {
    const file = beatFile(dir, 1);
    expect(beatAge(file)).toBe(Number.POSITIVE_INFINITY);
    writeFileSync(file, String(1000));
    expect(beatAge(file, 1250)).toBe(250);
    writeFileSync(file, 'garbage');
    expect(beatAge(file)).toBe(Number.POSITIVE_INFINITY);
  });

  it('starts nothing without a beat file', () => {
    expect(() => startHeartbeat(undefined)).not.toThrow();
  });

  // A test that installs fake timers must not silence or freeze the beat: the watchdog would read the
  // wait it is in as a loop, and stop it. The interval and the clock are the real ones, taken before
  // any test file ran.
  it('keeps beating while a test runs under fake timers', async () => {
    const realSetTimeout = globalThis.setTimeout;
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
    const file = beatFile(dir, 2);
    startHeartbeat(file);
    writeFileSync(file, String(realNow() - 10 * STALE_MS)); // stale, until the next beat
    await new Promise((resolve) => realSetTimeout(resolve, 2 * HEARTBEAT_MS + 50));
    expect(beatAge(file, realNow())).toBeLessThan(STALE_MS);
  });

  // A module evaluated again in the same thread (a new test file) restarts the beat, not adds one:
  // the old beat would go on writing after this one's thread stopped turning.
  it('keeps one beat per thread however often it is started', async () => {
    const realSetTimeout = globalThis.setTimeout;
    const first = beatFile(dir, 3);
    const second = beatFile(dir, 4);
    startHeartbeat(first);
    startHeartbeat(second);
    writeFileSync(first, String(realNow() - 10 * STALE_MS));
    await new Promise((resolve) => realSetTimeout(resolve, 2 * HEARTBEAT_MS + 50));
    expect(beatAge(first, realNow())).toBeGreaterThan(STALE_MS);
    expect(beatAge(second, realNow())).toBeLessThan(STALE_MS);
  });
});
