import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { BEAT_ENV, beatFile, classifyStall, CPU_SAMPLE_MS, CPU_WINDOW_MS, cpuShare, HEARTBEAT_MS, IDLE_CPU, markTest, MIN_CPU_SPAN_MS, readBeat, STALE_MS, startHeartbeat } from './heartbeat.js';

/** A beat of this age, from inside a test body unless said otherwise. */
const beat = (age: number, inTest = true): { age: number; inTest: boolean } => ({ age, inTest });
const beatAge = (file: string, now?: number): number => readBeat(file, now).age;

const realNow = Date.now.bind(Date);
const dir = mkdtempSync(path.join(tmpdir(), 'oxmutate-heartbeat-'));
afterAll(() => discard(dir));

describe('classifyStall: idle is a live beat inside a test body and under IDLE_CPU of a core; anything else is busy', () => {
  // On a loaded machine a short budget can run out while the worker still collects its file, its
  // CPU low while it waits for modules: that is a slow machine, not a hang (sc8-profile.md).
  it('reads a worker outside a test body as busy, however idle', () => {
    expect(classifyStall({ beat: beat(100, false), cpuShare: 0 })).toBe('busy');
  });
  it('reads a prompt awaiting a keypress (live beat, 0–2% CPU) as idle', () => {
    expect(classifyStall({ beat: beat(100), cpuShare: 0 })).toBe('idle');
    expect(classifyStall({ beat: beat(STALE_MS - 1), cpuShare: 0.02 })).toBe('idle');
  });
  it('reads a loop (stale beat, about a core) as busy', () => {
    expect(classifyStall({ beat: beat(9000), cpuShare: 0.72 })).toBe('busy');
  });
  it('reads a live beat that burns CPU (a slow test on a loaded machine) as busy', () => {
    expect(classifyStall({ beat: beat(100), cpuShare: IDLE_CPU })).toBe('busy');
  });
  it('reads a stale beat at 0% CPU (a worker blocked in a synchronous wait) as busy', () => {
    expect(classifyStall({ beat: beat(STALE_MS), cpuShare: 0 })).toBe('busy');
  });
  it('reads a stop with no CPU reading as busy: the re-run decides it, as before', () => {
    expect(classifyStall({ beat: beat(0), cpuShare: undefined })).toBe('busy');
  });
  // The thresholds as measured on caique (sc8-profile.md): idle stops read 0–2% of a core, the loop
  // read 72%. A beat a full second old is stale.
  it('holds the measured thresholds: 2% with a live beat is idle, 72% is busy, a 1 s old beat is stale', () => {
    expect(classifyStall({ beat: beat(100), cpuShare: 0.02 })).toBe('idle');
    expect(classifyStall({ beat: beat(100), cpuShare: 0.72 })).toBe('busy');
    expect(classifyStall({ beat: beat(999), cpuShare: 0 })).toBe('idle');
    expect(classifyStall({ beat: beat(1000), cpuShare: 0 })).toBe('busy');
  });
  it('beats four times per stale window, and samples the CPU four times per window', () => {
    expect(STALE_MS / HEARTBEAT_MS).toBe(4);
    expect(CPU_WINDOW_MS / CPU_SAMPLE_MS).toBe(4);
    expect(CPU_WINDOW_MS).toBe(1000);
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
  it('gives no reading from samples spanning less than half a second, and one from half a second', () => {
    expect(cpuShare([{ at: now - MIN_CPU_SPAN_MS + 1, us: 0 }, { at: now, us: 0 }], now)).toBeUndefined();
    expect(cpuShare([{ at: now - 500, us: 0 }, { at: now, us: 0 }], now)).toBe(0);
    expect(cpuShare([], now)).toBeUndefined();
  });
  it('starts the window a second before now, takes the latest sample, and ignores samples after now', () => {
    expect(cpuShare([{ at: now - 1001, us: 0 }, { at: now - 500, us: 1_000_000 }, { at: now, us: 1_000_000 }], now)).toBe(0);
    expect(cpuShare([{ at: now - 1000, us: 0 }, { at: now - 500, us: 0 }, { at: now, us: 1_000_000 }], now)).toBe(1);
    expect(cpuShare([{ at: now - 1000, us: 0 }, { at: now, us: 0 }, { at: now + 500, us: 1_000_000 }], now)).toBe(0);
  });
});

describe('the beat', () => {
  afterEach(() => vi.useRealTimers());

  it('names a server\'s beat by its pid, in the work directory, and hands it over in OXMUTATE_BEAT', () => {
    expect(beatFile(dir, 42)).toBe(path.join(dir, 'beat-42'));
    expect(BEAT_ENV).toBe('OXMUTATE_BEAT');
  });

  it('says whether a beat came from inside a test body', async () => {
    const realSetTimeout = globalThis.setTimeout;
    const file = beatFile(dir, 8);
    startHeartbeat(file);
    expect(readBeat(file).inTest).toBe(false);
    markTest(true);
    await new Promise((resolve) => realSetTimeout(resolve, HEARTBEAT_MS + 50));
    expect(readBeat(file).inTest).toBe(true);
    expect(readBeat(file).age).toBeLessThan(STALE_MS);
    markTest(false);
    await new Promise((resolve) => realSetTimeout(resolve, HEARTBEAT_MS + 50));
    expect(readBeat(file).inTest).toBe(false);
    expect(readBeat(file).age).toBeLessThan(STALE_MS);
    writeFileSync(file, '1000 test');
    expect(readBeat(file, 1250)).toEqual({ age: 250, inTest: true });
  });

  it('reads as never when nothing beat, and as fresh just after a beat', () => {
    const file = beatFile(dir, 1);
    expect(readBeat(file)).toEqual({ age: Number.POSITIVE_INFINITY, inTest: false });
    writeFileSync(file, String(1000));
    expect(beatAge(file, 1250)).toBe(250);
    writeFileSync(file, 'garbage');
    expect(beatAge(file)).toBe(Number.POSITIVE_INFINITY);
    // An empty or zero beat is no beat; the first millisecond of the epoch is one.
    writeFileSync(file, '');
    expect(beatAge(file, 5000)).toBe(Number.POSITIVE_INFINITY);
    writeFileSync(file, '0');
    expect(beatAge(file, 5000)).toBe(Number.POSITIVE_INFINITY);
    writeFileSync(file, '1');
    expect(beatAge(file, 5000)).toBe(4999);
  });

  it('stops beating once its run\'s directory is gone, and does not come back', async () => {
    const realSetTimeout = globalThis.setTimeout;
    const run = path.join(dir, 'run');
    mkdirSync(run);
    const file = beatFile(run, 7);
    startHeartbeat(file);
    rmSync(run, { recursive: true, force: true });
    await new Promise((resolve) => realSetTimeout(resolve, HEARTBEAT_MS + 50));
    mkdirSync(run);
    await new Promise((resolve) => realSetTimeout(resolve, 2 * HEARTBEAT_MS + 50));
    expect(existsSync(file)).toBe(false);
  });

  it('beats at once, not a beat later', () => {
    const file = beatFile(dir, 5);
    startHeartbeat(file);
    expect(beatAge(file, realNow())).toBeLessThan(HEARTBEAT_MS);
  });

  it('starts nothing without a beat file, and leaves a running beat alone', async () => {
    const realSetTimeout = globalThis.setTimeout;
    const file = beatFile(dir, 6);
    startHeartbeat(file);
    expect(() => startHeartbeat(undefined)).not.toThrow();
    writeFileSync(file, String(realNow() - 10 * STALE_MS));
    await new Promise((resolve) => realSetTimeout(resolve, 2 * HEARTBEAT_MS + 50));
    expect(beatAge(file, realNow())).toBeLessThan(STALE_MS);
  });

  // A test that installs fake timers must not silence or freeze the beat: the watchdog would read the
  // wait it is in as a loop, and stop it. The interval and the clock are the real ones, taken before
  // any test file ran.
  it('keeps beating while a test runs under fake timers', async () => {
    const realSetTimeout = globalThis.setTimeout;
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
    const file = beatFile(dir, 2);
    startHeartbeat(file);
    const staleThenWait = async (): Promise<number> => {
      writeFileSync(file, String(realNow() - 10 * STALE_MS)); // stale, until the next beat
      await new Promise((resolve) => realSetTimeout(resolve, HEARTBEAT_MS + 100));
      return beatAge(file, realNow());
    };
    // Stale twice over: the beat must keep coming, not come once.
    expect(await staleThenWait()).toBeLessThan(STALE_MS);
    expect(await staleThenWait()).toBeLessThan(STALE_MS);
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
