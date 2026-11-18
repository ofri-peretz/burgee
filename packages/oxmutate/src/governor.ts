/**
 * The governor's load hold (spec `M2`, `R12`, `R16`, `R17`): asked by the pool before a unit starts,
 * it holds the start while the machine is past `resources.maxLoad`. It acts only between units, never
 * on one that runs, never on a budget and never on the order of units. One server always runs.
 *
 * Only load oxmutate does not account for counts: the reading minus its own busy servers, so a run at
 * `concurrency: 8` on 8 cores does not hold itself back. Resuming at 0.8 × `maxLoad` keeps the pool
 * from flapping. A run at a load of 55 to 92 was stopped by hand, and at 45 to 120 tests timed out
 * and were scored Killed (roadmap `4.1`).
 */
import os from 'node:os';

/** How often a held start reads the load again. */
export const GOVERNOR_SAMPLE_MS = 2000;
/** A hold ends below this share of `maxLoad`. */
export const RESUME_SHARE = 0.8;
/** The default `maxLoad`, per core. */
export const MAX_LOAD_PER_CORE = 1.5;

/** Whether to hold a start: past `maxLoad` to begin a hold, still past RESUME_SHARE of it to keep one. */
export function holds(o: { load: number; own: number; maxLoad: number; holding: boolean }): boolean {
  const theirs = o.load - o.own;
  return theirs > (o.holding ? RESUME_SHARE * o.maxLoad : o.maxLoad);
}

type Times = { idle: number; total: number };
export const cpuTimes = (cpus: os.CpuInfo[] = os.cpus()): Times =>
  cpus.reduce((t, c) => ({ idle: t.idle + c.times.idle, total: t.total + c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq }), { idle: 0, total: 0 });

/**
 * The 1-minute load average, or where the OS reports none (Windows reads 0, `R17`) the cores busy
 * since the last reading, from `os.cpus()`.
 */
export function loadReader(loadavg = os.loadavg, times = cpuTimes, cores = os.availableParallelism()): () => number {
  let last = times();
  return () => {
    const [one = 0] = loadavg();
    if (one > 0) return one;
    const now = times();
    const total = now.total - last.total;
    const busy = total > 0 ? (total - (now.idle - last.idle)) / total : 0;
    last = now;
    return busy * cores;
  };
}

export interface Governor {
  /** Wait while a new start must be held; `busy` reads how many of this run's servers are in a unit. */
  hold(busy: () => number): Promise<void>;
  /** Milliseconds starts were held, all together. */
  readonly heldMs: number;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function createGovernor(maxLoad: number, read: () => number = loadReader(), sampleMs = GOVERNOR_SAMPLE_MS): Governor {
  let heldMs = 0;
  return {
    async hold(busy) {
      // One server always runs: a hold ends when the last busy one finishes.
      const past = (holding: boolean): boolean => busy() > 0 && holds({ load: read(), own: busy(), maxLoad, holding });
      if (!past(false)) return;
      const start = performance.now();
      // One reading per sample until the hold ends: sequential by design.
      const wait = async (): Promise<void> => {
        await sleep(sampleMs);
        if (past(true)) await wait();
      };
      await wait();
      heldMs += performance.now() - start;
    },
    get heldMs() {
      return heldMs;
    },
  };
}
