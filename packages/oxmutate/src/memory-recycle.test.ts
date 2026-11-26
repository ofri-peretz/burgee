/**
 * The proof that the memory ceiling gives memory back: real server processes, through the real pool,
 * each unit leaking 64 MiB as a warm Vitest server's module graph grows. Without a ceiling the server
 * ends holding every unit's leak; with one, it is recycled once past it, and what the pool holds after
 * the run is back at a fresh server's (the baseline), not the sum of every unit.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { vmRss } from './memory.js';
import { createPool, overCeiling, type Pool } from './scheduler.js';

/** A unit, as the pool takes it: child.ts's own module starts a server when imported, so its type is reached through the pool's. */
type Unit = Parameters<Pool['drain']>[0][number];

const MIB = 1024 ** 2;
const LEAK_MB = 64;
const UNITS = 5;
const leaky = fileURLToPath(new URL('__fixtures__/leaky-server.mjs', import.meta.url));
const scratch = scratchDirs();

/** The resident memory of each process, from /proc. */
const rssOf = (pids: readonly number[]): number[] => pids.map((pid) => vmRss(readFileSync(`/proc/${String(pid)}/status`, 'utf8')));

/** Runs UNITS leaking units through a one-slot warm pool; answers the pool's stats and what its live servers hold after. */
async function drained(memoryCeiling: number | undefined): Promise<{ recycled: number; rssPeak: number; held: number[] }> {
  const workDir = scratch('oxmutate-recycle-');
  process.env['LEAK_MB'] = String(LEAK_MB);
  const pool = createPool({ root: workDir, workers: 1, instrumentedMap: path.join(workDir, 'map.json') }, 1, { workDir, tag: 'leak', lifecycle: { warm: true, idleTimeoutMs: 0, memoryCeiling }, script: leaky });
  try {
    const units: Unit[] = Array.from({ length: UNITS }, (_, i) => ({ mode: 'mutant', files: [], results: path.join(workDir, `r${String(i)}`), progress: path.join(workDir, `p${String(i)}`) }));
    await pool.drain(units, () => 60_000, () => []);
    return { recycled: pool.stats.recycled, rssPeak: pool.stats.rssPeak, held: rssOf(pool.pids()) };
  } finally {
    pool.close();
  }
}

describe('the memory ceiling', () => {
  it('is passed only past the ceiling, and never without a ceiling or a reading', () => {
    expect(overCeiling(100, 101)).toBe(true);
    expect(overCeiling(100, 100)).toBe(false);
    expect(overCeiling(undefined, 101)).toBe(false);
    expect(overCeiling(100, undefined)).toBe(false);
  });

  // /proc is Linux's; the pool and the stand-in run anywhere, the reading of what they hold does not.
  it.skipIf(process.platform !== 'linux')('recycles a leaking warm server past it, and the pool ends holding a fresh server’s memory, not every unit’s', async () => {
    const off = await drained(undefined);
    // No ceiling: one server ran every unit and holds every leak.
    expect(off.recycled).toBe(0);
    const baseline = off.rssPeak - UNITS * LEAK_MB * MIB;
    expect(Math.max(...off.held)).toBeGreaterThan(baseline + (UNITS - 1) * LEAK_MB * MIB);

    // A ceiling a leak and a half above a fresh server: past it after every second unit, so recycled twice in five.
    const ceiling = baseline + 1.5 * LEAK_MB * MIB;
    const on = await drained(ceiling);
    expect(on.recycled).toBeGreaterThanOrEqual(2);
    // Each unit's reading is taken after its leak; a recycled server's next unit starts fresh, so no server ever reads past two leaks.
    expect(on.rssPeak).toBeLessThan(baseline + 2 * LEAK_MB * MIB + 32 * MIB);
    // What is left alive is under the ceiling: the memory went back to the machine.
    for (const rss of on.held) expect(rss).toBeLessThan(ceiling);
    expect(Math.max(...on.held)).toBeLessThan(Math.max(...off.held) - 2 * LEAK_MB * MIB);
  }, 20_000);
});
