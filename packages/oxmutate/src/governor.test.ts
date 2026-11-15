import os from 'node:os';

import { describe, expect, it } from 'vitest';

import { cpuTimes, createGovernor, holds, loadReader, MAX_LOAD_PER_CORE, RESUME_SHARE } from './governor.js';

describe('holds', () => {
  it('begins a hold only past maxLoad, counting only load oxmutate does not account for', () => {
    expect(holds({ load: 11, own: 0, maxLoad: 10, holding: false })).toBe(true);
    expect(holds({ load: 10, own: 0, maxLoad: 10, holding: false })).toBe(false);
    // Its own 4 busy servers are not held against it.
    expect(holds({ load: 13, own: 4, maxLoad: 10, holding: false })).toBe(false);
    expect(holds({ load: 15, own: 4, maxLoad: 10, holding: false })).toBe(true);
  });
  it('keeps a hold until the load is under RESUME_SHARE of maxLoad, so the pool does not flap', () => {
    expect(RESUME_SHARE).toBe(0.8);
    expect(MAX_LOAD_PER_CORE).toBe(1.5);
    expect(holds({ load: 9, own: 0, maxLoad: 10, holding: true })).toBe(true);
    expect(holds({ load: 8, own: 0, maxLoad: 10, holding: true })).toBe(false);
    expect(holds({ load: 9, own: 0, maxLoad: 10, holding: false })).toBe(false);
  });
});

const sum = (cpus: os.CpuInfo[], f: (c: os.CpuInfo['times']) => number): number => cpus.reduce((n, c) => n + f(c.times), 0);
const all = (c: os.CpuInfo['times']): number => c.user + c.nice + c.sys + c.idle + c.irq;

describe('cpuTimes', () => {
  it('sums idle time, and every kind of time, over all cores', () => {
    const before = os.cpus();
    const t = cpuTimes();
    const after = os.cpus();
    expect(t.idle).toBeGreaterThanOrEqual(sum(before, (c) => c.idle));
    expect(t.idle).toBeLessThanOrEqual(sum(after, (c) => c.idle));
    expect(t.total).toBeGreaterThanOrEqual(sum(before, all));
    expect(t.total).toBeLessThanOrEqual(sum(after, all));
  });
});

describe('loadReader', () => {
  it('reads a load average under 1 as it is, and an empty reading as none', () => {
    expect(loadReader(() => [0.5], () => ({ idle: 0, total: 0 }), 8)()).toBe(0.5);
    let i = 0;
    const samples = [{ idle: 0, total: 0 }, { idle: 0, total: 1 }];
    // One unit of time passed, none of it idle: every core busy.
    expect(loadReader(() => [], () => samples[Math.min(i++, 1)] ?? { idle: 0, total: 0 }, 8)()).toBe(8);
  });
  it('reads the CPU of this machine by default', () => {
    const read = loadReader(() => [0, 0, 0]);
    const load = read();
    expect(load).toBeGreaterThanOrEqual(0);
    expect(load).toBeLessThanOrEqual(os.availableParallelism());
  });
  it('reads the 1-minute load average where the OS has one', () => {
    expect(loadReader(() => [7.5, 1, 1], () => ({ idle: 0, total: 0 }), 8)()).toBe(7.5);
  });
  it('reads busy cores from CPU time where the load average is 0 (Windows)', () => {
    const samples = [
      { idle: 100, total: 200 },
      { idle: 150, total: 400 },
    ];
    let i = 0;
    const read = loadReader(() => [0, 0, 0], () => samples[Math.min(i++, 1)] ?? { idle: 0, total: 0 }, 8);
    // 200 of time passed, 50 of it idle: 75% busy, of 8 cores.
    expect(read()).toBe(6);
  });
  it('reads 0 when no CPU time has passed', () => {
    expect(loadReader(() => [0, 0, 0], () => ({ idle: 5, total: 10 }), 8)()).toBe(0);
  });
});

describe('createGovernor', () => {
  it('never holds the only busy server, and holds while the load stays past maxLoad', async () => {
    const loads = [50, 50, 7];
    let reads = 0;
    const g = createGovernor(10, () => loads[Math.min(reads++, loads.length - 1)] ?? 0, 1);
    await g.hold(() => 0);
    expect(reads).toBe(0);
    expect(g.heldMs).toBe(0);
    await g.hold(() => 1);
    expect(reads).toBe(3);
    expect(g.heldMs).toBeGreaterThan(0);
  });
  it('ends a hold when its last busy server finishes', async () => {
    let busy = 1;
    const g = createGovernor(10, () => 100, 1);
    const held = g.hold(() => busy);
    busy = 0;
    await held;
    expect(g.heldMs).toBeGreaterThan(0);
  });
  it('begins a hold only past maxLoad, and keeps it while past RESUME_SHARE of it', async () => {
    let reads = 0;
    // 9 is under maxLoad 10: no hold begins.
    const g = createGovernor(10, () => (reads++, 9), 1);
    await g.hold(() => 1);
    expect(reads).toBe(1);
    expect(g.heldMs).toBe(0);
    // Once held, 10 less its one busy server is 9, still past 8 (RESUME_SHARE of 10): the hold goes on until 7.
    const loads = [50, 10, 7];
    let n = 0;
    const h = createGovernor(10, () => loads[Math.min(n++, 2)] ?? 0, 1);
    await h.hold(() => 1);
    expect(n).toBe(3);
  });
  it('waits a sample between readings, and counts the time held', async () => {
    const loads = [50, 50, 0];
    let n = 0;
    const g = createGovernor(10, () => loads[Math.min(n++, 2)] ?? 0, 20);
    await g.hold(() => 1);
    expect(g.heldMs).toBeGreaterThanOrEqual(30);
    expect(g.heldMs).toBeLessThan(10_000);
  });
  it('does not hold below maxLoad', async () => {
    const g = createGovernor(10, () => 5, 1);
    await g.hold(() => 3);
    expect(g.heldMs).toBe(0);
  });
});
