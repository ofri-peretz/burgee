/**
 * The watchdog's evidence for the difference between a mutant that loops and one that hangs
 * (.sdlc/intents/oxmutate/stall.qnt, D-20261101-idle-stall-is-timeout).
 *
 * Two readings, both taken when a run passes its budget:
 *
 * - **The beat.** The test worker writes the time to its server's beat file every HEARTBEAT_MS
 *   from a real interval timer. The beat keeps coming only while the worker's event loop turns. A
 *   synchronous loop stops it, and so does a microtask loop.
 * - **The CPU.** The server reports its process's CPU time (every thread, the worker included)
 *   every CPU_SAMPLE_MS. Over the last CPU_WINDOW_MS, a loop burns about a core.
 *
 * A run whose worker is inside a test body, with a fresh beat and under IDLE_CPU of a core, is
 * **idle**: the test waits on something the mutant never lets happen (a prompt awaiting a
 * keypress). Anything else is **busy**, including a worker still collecting its file: on a loaded
 * machine a short budget can run out while modules load, at low CPU, and that is a slow machine. On a caique
 * subset 18 of 19 stops read 0–2% CPU with a live beat, and the one loop read 72%
 * (sc8-profile.md). An idle stop is a Timeout as it stands, the way Stryker scores it. A busy stop
 * may be a slow test on a loaded machine, so it keeps its re-run at 3x.
 *
 * The beat file is the server's, named by its pid and set in its environment when it starts, so
 * every worker it ever runs inherits it: a path set per unit could reach a worker that started
 * under an earlier unit, and on caique two stops read a beat that never came.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** How often the worker writes its beat. */
export const HEARTBEAT_MS = 250;
/** A beat older than this means the worker's event loop is not turning: a loop, not a wait. */
export const STALE_MS = 1000;
/** How often a server reports its CPU time. */
export const CPU_SAMPLE_MS = 250;
/** The window a stop's CPU share is measured over. */
export const CPU_WINDOW_MS = 1000;
/** The shortest span of samples a CPU share is read from; less, and the stop counts as busy. */
export const MIN_CPU_SPAN_MS = 500;
/** Under this share of one core, with a fresh beat, a stopped run is idle. Measured: idle 0–2%, a loop 72–108%. */
export const IDLE_CPU = 0.25;

/** The environment variable that hands a server's beat file to its test workers. */
export const BEAT_ENV = 'OXMUTATE_BEAT';

/** A server's beat file, in the run's work directory. */
export const beatFile = (workDir: string, pid: number | undefined): string => path.join(workDir, `beat-${String(pid)}`);

// Captured when this module is evaluated, before any test file can install fake timers: a faked
// clock would write a frozen time, and the watchdog would read a live worker as a stale one.
const { setInterval: realSetInterval, clearInterval: realClearInterval } = globalThis;
/**
 * The time, from the clock this module saw when it was evaluated: a test's fake timers cannot move it.
 * Every time the watchdog reads (a mutant's start, a beat) is written from it.
 */
export const realNow = Date.now.bind(Date);
/** The beat this thread runs: one at a time, whatever re-evaluates this module. */
// Stryker disable next-line StringLiteral: any key names one registry symbol on every evaluation of this module, which is all the key is for
const BEAT_KEY = Symbol.for('oxmutate.heartbeat');

/** Whether a test body is running in this worker (the runner marks it); the beat carries it. */
let inTest = false;

/** Mark a test body as running, or done. Only a wait inside a test body can be an idle stall. */
export function markTest(running: boolean): void {
  inTest = running;
}

/** Start this worker's beat into `file`. Does nothing when no beat file is set. */
export function startHeartbeat(file: string | undefined): void {
  if (!file) return;
  const holder = globalThis as { [BEAT_KEY]?: ReturnType<typeof setInterval> };
  realClearInterval(holder[BEAT_KEY]);
  /** One beat; false once the run's directory is gone: the run is over, and nothing reads the beat. */
  const beat = (): boolean => {
    try {
      writeFileSync(file, inTest ? `${String(realNow())} test` : String(realNow()));
    } catch {
      return false;
    }
    return true;
  };
  beat();
  holder[BEAT_KEY] = realSetInterval(() => {
    if (!beat()) realClearInterval(holder[BEAT_KEY]);
  }, HEARTBEAT_MS);
  // Stryker disable next-line CallExpression: unref only lets a process exit while its beat runs; Vitest ends its workers regardless, so no verdict depends on it
  holder[BEAT_KEY].unref();
}

export interface Beat {
  /** How long ago a worker of this server last beat, or Infinity when none has. */
  age: number;
  /** That beat came from inside a test body. */
  inTest: boolean;
}

/** The last beat of this server's workers. */
export function readBeat(file: string, now = Date.now()): Beat {
  let text: string;
  try {
    text = String(readFileSync(file));
  } catch {
    return { age: Number.POSITIVE_INFINITY, inTest: false };
  }
  const [stamp, where] = text.split(' ');
  const at = Number(stamp);
  return { age: Number.isFinite(at) && at > 0 ? now - at : Number.POSITIVE_INFINITY, inTest: where === 'test' };
}

/** One CPU reading of a server: when, and its process's user + system time so far, in µs. */
export interface CpuSample {
  at: number;
  us: number;
}

const US_PER_MS = 1000;

/**
 * The share of one core a server used over the last CPU_WINDOW_MS before `now`, from its samples
 * (oldest first). Undefined when the samples span less than MIN_CPU_SPAN_MS of that window.
 */
export function cpuShare(samples: readonly CpuSample[], now: number): number | undefined {
  const recent = samples.filter((s) => s.at >= now - CPU_WINDOW_MS && s.at <= now);
  const first = recent[0];
  const last = recent.at(-1);
  // Stryker disable next-line LogicalOperator: the first and the last sample are both there or both missing, so `&&` reads the same
  if (!first || !last || last.at - first.at < MIN_CPU_SPAN_MS) return undefined;
  return (last.us - first.us) / US_PER_MS / (last.at - first.at);
}

export type Stall = 'idle' | 'busy';

/** A stopped run is idle when its worker waits inside a test body, its event loop turning, and its server burns almost no CPU. */
export function classifyStall(o: { beat: Beat; cpuShare: number | undefined }): Stall {
  return o.beat.inTest && o.beat.age < STALE_MS && (o.cpuShare ?? IDLE_CPU) < IDLE_CPU ? 'idle' : 'busy';
}
