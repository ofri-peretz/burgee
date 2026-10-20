/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The machine behind both doors of `closeout/signal-exit` (design R6, Y3).
 *
 * Graded by `signal-exit`'s own suite in `compat-oracle`. Unlike `closeout/exit-hook`, this
 * façade has never run through `registry.ts`, and that is a finding rather than a shortcut:
 * `signal-exit`'s contract is not "run these handlers once" but a set of facts about the
 * process, and the suite asserts each one by spawning a child and reading how it died.
 *
 * - **A fatal signal still kills.** When the only listeners for a signal are this module's,
 *   the handlers run and the signal is re-raised, so the parent sees `signal: 'SIGHUP'`, not
 *   an exit code. A handler returning `true` claims the signal and the process lives on.
 * - **Every exit path is seen**, including `process.exit()` and `process.reallyExit()`, which
 *   is why `emit` and `reallyExit` are wrapped while loaded and restored on `unload()`.
 * - **One emitter per process**, published under `Symbol.for('signal-exit emitter')`. That is
 *   the key `signal-exit` itself uses, so a program with this façade and a transitive copy of
 *   the real package runs every handler once, in registration order, and re-raises once. The
 *   two doors of this package share it the same way: a program that `import`s the ES entry and
 *   `require()`s the CommonJS one has two wirings and one emitter, which is exactly what
 *   `signal-exit`'s own `dist/mjs` and `dist/cjs` give it.
 * - **No process, no-op.** A runtime without a usable `process` gets functions that do
 *   nothing and an unsubscribe that works.
 *
 * ## Why the machine is an ES module and the doors are two
 *
 * State lives in the wiring each call to {@link signalExit} returns and in the shared emitter,
 * never in this module, so one evaluation of it can serve every evaluation of a door. The
 * CommonJS door (`signal-exit.cts`) is what `require()` reaches and what the suite re-evaluates
 * under a changed `process`; it calls `signalExit` again each time. The ES door
 * (`signal-exit.ts`) is what `import` reaches, and it exists for weight: a bundler that
 * imports the CommonJS file wraps it, and its `require()` of this module, in interop helpers
 * that cost more than the whole of `signal-exit`'s own ES build (B4, 2026-10-20: 3,634 B
 * against 2,856 B before the ES door, `.sdlc/intents/closeout-at-incumbent-weight/`).
 */

/** A handler gets the exit code, or the signal that is killing the process. `true` claims a signal. */
export type Handler = (code: number | null | undefined, signal: string | null) => true | void;

export interface Options {
  /** Run after every handler registered without it. */
  alwaysLast?: boolean;
}

type Event = 'exit' | 'afterExit';

/** The shape `signal-exit` publishes under the shared symbol — kept identical so two copies agree. */
interface Emitter {
  emitted: Record<Event, boolean>;
  listeners: Record<Event, Handler[]>;
  /** How many loaded copies have a listener on each signal. */
  count: number;
  id: number;
}

interface Proc {
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
  emit(event: string, ...args: unknown[]): boolean;
  reallyExit(code?: number): unknown;
  listeners(event: string): unknown[];
  kill(pid: number, signal: string): unknown;
  pid: number;
  platform?: string;
  exitCode?: number | string | null;
  /** signal-exit 3's emitter, whose loaded copies also count as "ours". */
  __signal_exit_emitter__?: { count?: unknown };
}

/** `signal-exit`'s own test of a usable process, member for member. */
function usable(p: unknown): p is Proc {
  if (typeof p !== 'object' || p === null) return false;
  const q = p as Record<string, unknown>;
  return (
    typeof q['removeListener'] === 'function' &&
    typeof q['emit'] === 'function' &&
    typeof q['reallyExit'] === 'function' &&
    typeof q['listeners'] === 'function' &&
    typeof q['kill'] === 'function' &&
    typeof q['pid'] === 'number' &&
    typeof q['on'] === 'function'
  );
}

const KEY = Symbol.for('signal-exit emitter');

function sharedEmitter(): Emitter {
  const holder = globalThis as { [KEY]?: Emitter };
  const existing = holder[KEY];
  if (existing !== undefined) return existing;
  const created: Emitter = { emitted: { exit: false, afterExit: false }, listeners: { exit: [], afterExit: [] }, count: 0, id: Math.random() };
  Object.defineProperty(holder, KEY, { value: created, writable: false, enumerable: false, configurable: false });
  return created;
}

/** Run one event's handlers, once per process. `exit` chains into `afterExit`. */
function emit(emitter: Emitter, event: Event, code: number | null | undefined, signal: string | null): boolean {
  if (emitter.emitted[event]) return false;
  // eslint-disable-next-line secure-coding/detect-object-injection -- `event` is the two-member `Event` union, and the record's shape is signal-exit's shared one
  emitter.emitted[event] = true;
  let claimed = false;
  for (const handler of emitter.listeners[event]) claimed = handler(code, signal) === true || claimed;
  if (event === 'exit') claimed = emit(emitter, 'afterExit', code, signal) || claimed;
  return claimed;
}

export interface SignalExit {
  onExit(handler: Handler, options?: Options): () => void;
  load(): void;
  unload(): void;
}

/** One wired process: what was there before we patched it, and what we attached. */
interface Wired {
  proc: Proc;
  /** The fatal signals this wiring listens for: the door's list, read at its load. */
  signals: readonly string[];
  emitter: Emitter;
  originalEmit: Proc['emit'];
  originalReallyExit: Proc['reallyExit'];
  /** The signals whose listener `proc.on` accepted — the ones there is anything to detach. */
  attached: Map<string, () => void>;
  loaded: boolean;
}

/** How many signal listeners on this process are signal-exit's, across every loaded copy. */
function ours(w: Wired): number {
  const legacy = w.proc.__signal_exit_emitter__?.count;
  return w.emitter.count + (typeof legacy === 'number' ? legacy : 0);
}

function onSignal(w: Wired, sig: string): void {
  // Someone else is listening: the signal is theirs to handle, and killing would take it away.
  if (w.proc.listeners(sig).length !== ours(w)) return;
  unload(w);
  if (emit(w.emitter, 'exit', null, sig)) return;
  // Windows has no SIGHUP to re-raise; upstream sends SIGINT in its place.
  w.proc.kill(w.proc.pid, sig === 'SIGHUP' && w.proc.platform === 'win32' ? 'SIGINT' : sig);
}

function load(w: Wired): void {
  if (w.loaded) return;
  w.loaded = true;
  w.emitter.count += 1;
  for (const sig of w.signals) {
    const listener = (): void => onSignal(w, sig);
    try {
      w.proc.on(sig, listener);
      w.attached.set(sig, listener);
    } catch (error: unknown) {
      // A signal this platform refuses a listener for is one this process cannot see. Upstream
      // swallows it too; recording it is what lets `unload` detach only what was attached.
      w.attached.delete(sig);
      void error;
    }
  }
  w.proc.emit = (event: string, ...args: unknown[]): boolean => {
    if (event !== 'exit') return w.originalEmit.call(w.proc, event, ...args);
    if (typeof args[0] === 'number') w.proc.exitCode = args[0];
    const result = w.originalEmit.call(w.proc, event, ...args);
    emit(w.emitter, 'exit', w.proc.exitCode as number | null | undefined, null);
    return result;
  };
  w.proc.reallyExit = (code?: number): unknown => {
    w.proc.exitCode = code ?? 0;
    emit(w.emitter, 'exit', w.proc.exitCode, null);
    return w.originalReallyExit.call(w.proc, w.proc.exitCode);
  };
}

function unload(w: Wired): void {
  if (!w.loaded) return;
  w.loaded = false;
  for (const [sig, listener] of w.attached) w.proc.removeListener(sig, listener);
  w.attached.clear();
  w.proc.emit = w.originalEmit;
  w.proc.reallyExit = w.originalReallyExit;
  w.emitter.count -= 1;
}

function onExit(w: Wired, handler: Handler, options?: Options): () => void {
  load(w);
  const event: Event = options?.alwaysLast === true ? 'afterExit' : 'exit';
  const list = w.emitter.listeners[event];
  list.push(handler);
  return () => {
    const at = list.indexOf(handler);
    if (at !== -1) list.splice(at, 1);
    if (w.emitter.listeners.exit.length === 0 && w.emitter.listeners.afterExit.length === 0) unload(w);
  };
}

function wire(proc: Proc, signals: readonly string[]): SignalExit {
  const w: Wired = { proc, signals, emitter: sharedEmitter(), originalEmit: proc.emit, originalReallyExit: proc.reallyExit, attached: new Map(), loaded: false };
  return { onExit: (handler, options) => onExit(w, handler, options), load: () => load(w), unload: () => unload(w) };
}

const nothing = (): void => undefined;
const noop: SignalExit = { onExit: () => nothing, load: nothing, unload: nothing };

/**
 * Wire `found` if it is a usable process, or hand back the no-op set if it is not.
 *
 * `found` is read by each door at its own load, as upstream reads it:
 * `process-deleted-after-load.js` deletes the global after the door loaded and still expects
 * its handler to run. `signals` is the door's list, read at the same moment.
 */
export function signalExit(found: unknown, signals: readonly string[]): SignalExit {
  return usable(found) ? wire(found, signals) : noop;
}
