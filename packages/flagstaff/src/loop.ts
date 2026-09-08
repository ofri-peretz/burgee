/**
 * The frame loop (R1). `hoist()` raises a component, `update()` changes its state, `lower()`
 * takes it down and leaves the static line behind. Which of the four projections runs is the
 * output policy's decision (`roundel/policy`), read once from the runtime; this file never
 * looks at a stream's `isTTY` or an environment variable itself (U2).
 */
import { outputMode, type ModeOptions, type OutputMode, type Runtime as PolicyRuntime } from 'roundel/policy';

import { type Component } from './plugin.js';
import { type Clock, jsonProjection, type Projection, staticProjection, ttyProjection, type Writer } from './projection.js';

/** What the loop needs from the world: the policy's slice plus the two streams and a clock. */
export interface Runtime extends PolicyRuntime {
  stdout: Writer;
  stderr: Writer;
  clock: Clock;
}

export interface Hoisted<S> {
  readonly mode: OutputMode;
  update(state: S): void;
  /** Lower the flag: the final state's static projection is what stays on screen. */
  lower(state?: S): void;
}

function projectionFor<S>(mode: OutputMode, component: Component<S>, rt: Runtime): Projection<S> {
  if (mode === 'tty') return ttyProjection(component, rt.stdout, rt.clock);
  if (mode === 'json') return jsonProjection(component, rt.stderr);
  return staticProjection(component, rt.stdout);
}

/** Hoist a component in its initial state. Pass `{ json: true }` when the run was asked for `--json`. */
export function hoist<S>(component: Component<S>, rt: Runtime, initial: S, opts: ModeOptions = {}): Hoisted<S> {
  const mode = outputMode(rt, opts);
  const projection = projectionFor(mode, component, rt);
  let state = initial;
  let lowered = false;
  projection.open(state);
  return {
    mode,
    update(next) {
      if (lowered) return;
      state = next;
      projection.change(state);
    },
    lower(final = state) {
      if (lowered) return;
      lowered = true;
      state = final;
      projection.close(state);
    },
  };
}

export interface ManualClock extends Clock {
  /** Advance by `ms`, running every callback that falls due, earliest first. */
  tick(ms: number): void;
}

interface Timer {
  id: number;
  at: number;
  fn: () => void;
}

/** A callback that reschedules itself at 0 ms would never leave `tick`; this is the ceiling. */
const TICK_CAP = 1000;

/** The earliest timer due by `until`; ties keep the order they were scheduled in. */
function nextDue(timers: Timer[], until: number): Timer | undefined {
  return timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at || a.id - b.id)[0];
}

/** A clock that moves only when told (R9): the same frames every run, so a spinner snapshots. */
export function manualClock(start = 0): ManualClock {
  let now = start;
  let nextId = 0;
  let timers: Timer[] = [];
  return {
    now: () => now,
    schedule(fn, ms) {
      const id = nextId++;
      timers.push({ id, at: now + Math.max(0, ms), fn });
      return () => {
        timers = timers.filter((t) => t.id !== id);
      };
    },
    tick(ms) {
      const until = now + ms;
      let ran = 0;
      let due = nextDue(timers, until);
      while (due !== undefined && ran < TICK_CAP) {
        const { id, at, fn } = due;
        timers = timers.filter((t) => t.id !== id);
        now = Math.max(now, at);
        fn();
        ran += 1;
        due = nextDue(timers, until);
      }
      if (due !== undefined) throw new Error(`manualClock: ${TICK_CAP} callbacks in one tick; something reschedules itself at 0 ms`);
      now = until;
    },
  };
}

export type { Clock, Writer } from './projection.js';
