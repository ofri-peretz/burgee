/**
 * A test worker that can tell, from its own event loop, that the test it runs can never resume
 * (.sdlc/intents/oxmutate/stall.qnt; staged spec oxmutate-load-robust, L1).
 *
 * The watchdog (scheduler.ts) only reads a stop once a wall-clock budget has run out: on caique 706
 * of 708 stops were waits nothing could end (a prompt awaiting a keypress, a hook awaiting a promise
 * the mutant never settles), and each held its worker 10–12 s, then cost a server respawn. Here the
 * worker samples itself every SAMPLE_MS and calls a wait **deadlocked** once, for a whole confirm
 * window, all of these hold:
 *
 * - its own thread burns no CPU (`process.threadCpuUsage`: a loop that runs, even one stepping
 *   through promises, burns some; event-loop utilisation is not used, because a test's fake timers
 *   move the clock Node computes it from, and it read 5.8e9 under them, 2026-11-03);
 * - the process's other threads (Vitest's main thread, which transforms modules the test may be
 *   importing) burn under QUIET_OTHER_SHARE of a core;
 * - no call to Vitest's main thread is in flight (`trackRpc`), and no timer is pending, ref'd or
 *   not (`trackTimers`);
 * - it holds no ref'd native resource beyond the floor it had before any test file was imported: a
 *   pending real timer, a child process, a socket or an fs request each add one, and each can end
 *   the wait. Unref'd timers (the heartbeat, this sampler) never count (Node lists only ref'd ones).
 *
 * Measured in a Vitest-style worker thread, Node 24.12 (2026-11-03): a promise that never settles and
 * a stream nobody feeds read ELU 0.00, ~0 ms CPU and nothing over the floor; a real timer adds a
 * `Timeout`, a child `PipeWrap` + `ProcessWrap`; a busy loop and a blocking `execFileSync` stop the
 * sampler itself (ELU 1.00), so they stay with the wall-clock watchdog, as before.
 */
import { performance } from 'node:perf_hooks';

/** How often the worker samples itself. */
export const SAMPLE_MS = 100;
/** Under this share of a sample in this thread's CPU, the thread did nothing. */
export const QUIET_SELF_SHARE = 0.05;
/** Under this share of one core in the process's other threads, nobody else is working for the test. */
export const QUIET_OTHER_SHARE = 0.25;
/** The shortest confirm window: a deadlock must hold this long before it is called. */
export const MIN_CONFIRM_MS = 500;

/** Thrown into the pending test or hook when its wait is a deadlock; the verdict is a Timeout. */
export class DeadlockError extends Error {
  constructor(readonly quietMs: number) {
    super(`oxmutate: deadlocked for ${String(Math.round(quietMs))} ms: nothing left in this worker could resume the test`);
    this.name = 'DeadlockError';
  }
}

export const isDeadlock = (e: unknown): e is DeadlockError => e instanceof DeadlockError;

type Usage = { user: number; system: number };
type ThreadCpu = (previous?: Usage) => Usage;
const threadCpuUsage = (process as unknown as { threadCpuUsage?: ThreadCpu }).threadCpuUsage?.bind(process);
// Captured when this module is evaluated, before a test can install fake timers.
const { setInterval: realSetInterval, clearInterval: realClearInterval } = globalThis;
const realNow = performance.now.bind(performance);
const US_PER_MS = 1000;

/** Native resources by kind, ref'd ones only (as Node lists them). */
function resources(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of process.getActiveResourcesInfo()) counts.set(r, (counts.get(r) ?? 0) + 1);
  return counts;
}

/** Whether `now` holds nothing the floor did not. */
const withinFloor = (now: Map<string, number>, floor: Map<string, number>): boolean => [...now].every(([kind, n]) => n <= (floor.get(kind) ?? 0));

/** One sample's reading, exported for the tests. */
export interface Reading {
  selfShare: number;
  otherShare: number;
  rpcInFlight: number;
  pendingTimers: number;
  withinFloor: boolean;
}

/** Whether a reading is a quiet one: every condition of a deadlock holds for this sample. */
export const quiet = (r: Reading): boolean =>
  r.selfShare < QUIET_SELF_SHARE && r.otherShare < QUIET_OTHER_SHARE && r.rpcInFlight === 0 && r.pendingTimers === 0 && r.withinFloor;

let rpcInFlight = 0;

/**
 * Timers that will still fire, ref'd or not. Node lists only ref'd timers as resources, and a
 * library may await an unref'd one (a CLI that must not hold its process open): that wait ends by
 * itself, so it is never a deadlock. Counted through the global functions, `node:timers` and
 * `node:timers/promises`, wrapped before any test file is imported. A test's fake timers replace the
 * globals and are not counted: with nothing advancing them, a wait on one is a deadlock.
 */
let pendingTimers = 0;
const live = new Map<number, true>();
const done = (id: number): void => {
  if (live.delete(id)) pendingTimers--;
};

type TimerFn = (cb: (...a: unknown[]) => unknown, ms?: number, ...args: unknown[]) => { [Symbol.toPrimitive](): number };
type ClearFn = (handle?: unknown) => void;

/** Wrap `setTimeout`/`setImmediate`/`setInterval` and their clears on `target` so pending timers are counted. */
function wrapTimers(target: Record<string, unknown>): void {
  const once = (name: 'setTimeout' | 'setImmediate', clear: 'clearTimeout' | 'clearImmediate'): void => {
    const set = target[name] as TimerFn | undefined;
    const unset = target[clear] as ClearFn | undefined;
    if (!set || !unset || (set as { __oxmutate?: true }).__oxmutate) return;
    const wrapped = (cb: (...a: unknown[]) => unknown, ...rest: unknown[]): unknown => {
      let id = 0;
      const handle = set((...a: unknown[]) => {
        done(id);
        return cb(...a);
      }, ...(rest as [number | undefined]));
      id = Number(handle);
      live.set(id, true);
      pendingTimers++;
      return handle;
    };
    target[name] = Object.assign(wrapped, set, { __oxmutate: true });
    target[clear] = (handle?: unknown): void => {
      if (handle !== undefined && handle !== null) done(Number(handle));
      unset(handle);
    };
  };
  once('setTimeout', 'clearTimeout');
  once('setImmediate', 'clearImmediate');
  const every = target['setInterval'] as TimerFn | undefined;
  const stopEvery = target['clearInterval'] as ClearFn | undefined;
  if (every && stopEvery && !(every as { __oxmutate?: true }).__oxmutate) {
    // An interval fires until cleared: pending for as long as it lives.
    target['setInterval'] = Object.assign(
      (cb: (...a: unknown[]) => unknown, ...rest: unknown[]): unknown => {
        const handle = every(cb, ...(rest as [number | undefined]));
        live.set(Number(handle), true);
        pendingTimers++;
        return handle;
      },
      every,
      { __oxmutate: true },
    );
    target['clearInterval'] = (handle?: unknown): void => {
      if (handle !== undefined && handle !== null) done(Number(handle));
      stopEvery(handle);
    };
  }
}

/** `node:timers/promises`: each awaited timer is pending until it settles. */
function wrapPromiseTimers(target: Record<string, unknown>): void {
  for (const name of ['setTimeout', 'setImmediate'] as const) {
    const fn = target[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
    if (!fn || (fn as { __oxmutate?: true }).__oxmutate) continue;
    target[name] = Object.assign(
      (...a: unknown[]): Promise<unknown> => {
        pendingTimers++;
        return fn(...a).finally(() => pendingTimers--);
      },
      { __oxmutate: true },
    );
  }
}

/** Count every timer the test or the code under test creates from here on. Idempotent. */
export async function trackTimers(): Promise<void> {
  wrapTimers(globalThis as unknown as Record<string, unknown>);
  const { createRequire, syncBuiltinESMExports } = await import('node:module');
  const require = createRequire(import.meta.url);
  wrapTimers(require('node:timers') as Record<string, unknown>);
  wrapPromiseTimers(require('node:timers/promises') as Record<string, unknown>);
  syncBuiltinESMExports();
}

/** For the tests: how many timers are pending now. */
export const pendingTimerCount = (): number => pendingTimers;

/**
 * Count Vitest's calls to its main thread while they are in flight: a test awaiting a module
 * transform holds no native resource of its own, and must not read as deadlocked while the main
 * thread works for it. Vitest reads `state.rpc` on every call (`rpc()` in its runtime), so wrapping
 * the property sees them all.
 */
export function trackRpc(state: { rpc?: object } | undefined): void {
  const rpc = state?.rpc;
  if (!rpc || (rpc as { __oxmutateTracked?: true }).__oxmutateTracked) return;
  state.rpc = new Proxy(rpc, {
    get(target, key, receiver) {
      if (key === '__oxmutateTracked') return true;
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== 'function' || typeof key !== 'string' || key.startsWith('$')) return value;
      const call = value as (...args: unknown[]) => unknown;
      const counted = (...args: unknown[]): unknown => {
        const result = call(...args);
        if (!(result instanceof Promise)) return result;
        rpcInFlight++;
        return result.finally(() => rpcInFlight--);
      };
      return Object.assign(counted, value);
    },
  });
}

interface Watch {
  /** Resolves or rejects as `fn` does, or rejects with DeadlockError once its wait is a deadlock. */
  guard<T>(fn: () => T | Promise<T>, confirmMs: number): Promise<T>;
  /** Stop sampling (end of the worker's run). */
  stop(): void;
}

let floor: Map<string, number> | undefined;

/** The resources a worker holds before any test file is imported; later readings are measured against it. */
export function takeFloor(): void {
  floor ??= resources();
}

/**
 * Start the sampler. Without `process.threadCpuUsage` (Node before 23.9) nothing is ever called a
 * deadlock and every wait stays with the wall-clock watchdog, as before this module.
 */
export function watch(): Watch {
  let armed: { reject: (e: unknown) => void; confirmMs: number } | undefined;
  let quietSince: number | undefined;
  let self = threadCpuUsage?.();
  let all = process.cpuUsage();
  let at = realNow();
  const timer = realSetInterval(() => {
    const now = realNow();
    const span = Math.max(1, now - at);
    const selfDelta = threadCpuUsage?.(self);
    const allDelta = process.cpuUsage(all);
    self = threadCpuUsage?.();
    all = process.cpuUsage();
    at = now;
    if (!armed || !selfDelta || !floor) return;
    const selfUs = selfDelta.user + selfDelta.system;
    const reading: Reading = {
      selfShare: selfUs / US_PER_MS / span,
      otherShare: Math.max(0, allDelta.user + allDelta.system - selfUs) / US_PER_MS / span,
      rpcInFlight,
      pendingTimers,
      withinFloor: withinFloor(resources(), floor),
    };
    if (process.env['OXMUTATE_DEBUG_QUIET']) process.stderr.write(`quiet? ${JSON.stringify(reading)} res=${JSON.stringify([...resources()])} floor=${JSON.stringify([...floor])}\n`);
    if (!quiet(reading)) {
      quietSince = undefined;
      return;
    }
    quietSince ??= now - span;
    if (now - quietSince >= armed.confirmMs) {
      const { reject } = armed;
      armed = undefined;
      reject(new DeadlockError(now - quietSince));
    }
  }, SAMPLE_MS);
  timer.unref();
  return {
    async guard<T>(fn: () => T | Promise<T>, confirmMs: number): Promise<T> {
      const pending = Promise.resolve().then(fn);
      if (!threadCpuUsage) return pending;
      const deadlock = new Promise<never>((_, reject) => {
        quietSince = undefined;
        armed = { reject, confirmMs: Math.max(MIN_CONFIRM_MS, confirmMs) };
      });
      try {
        return await Promise.race([pending, deadlock]);
      } finally {
        armed = undefined;
        // A deadlocked `fn` stays pending for ever; nothing must reject it later.
        pending.catch(() => undefined);
      }
    },
    stop() {
      realClearInterval(timer);
    },
  };
}
