/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/exit-hook`, driven in this process against a fake one.
 *
 * `exit-hook`'s own 21-case suite grades this façade in `compat-oracle`, and `signal.test.ts`
 * kills real children through it — both in another process, so neither moves a counter here.
 * This file pins the same contract where a v8 counter can see it: which hooks run on which
 * door, with which code, in what order, exactly once, and that the process always leaves.
 *
 * The façade resolves its process once, at import, through `ambientProcess()`. Each case
 * mocks that one function and imports a fresh copy of the module, so every case gets its own
 * hook sets, its own wiring and its own registry — the module-level state a real process has
 * exactly one of.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Listener = (...args: unknown[]) => void;
type Drain = 'drain' | 'never' | 'error' | 'throw' | 'once-throws';

interface FakeStream {
  writable?: boolean | undefined;
  writableEnded?: boolean;
  destroyed?: boolean;
  writes: number;
  errorListeners: Listener[];
  once?: ((event: string, listener: Listener) => unknown) | undefined;
  off?: ((event: string, listener: Listener) => unknown) | undefined;
  write(chunk: string, callback?: () => void): unknown;
}

/** A stdio stream that drains the way `mode` says, and logs the drain into `log`. */
function stream(name: string, log: string[], mode: Drain = 'drain', state: Partial<FakeStream> = {}): FakeStream {
  const self: FakeStream = {
    writable: true,
    writes: 0,
    errorListeners: [],
    once(event, listener) {
      if (mode === 'once-throws') throw new Error('this stream cannot be listened to');
      if (event === 'error') self.errorListeners.push(listener);
      return self;
    },
    off(event, listener) {
      if (event === 'error') self.errorListeners = self.errorListeners.filter((l) => l !== listener);
      return self;
    },
    write(_chunk, callback) {
      self.writes += 1;
      log.push(`drain ${name}`);
      if (mode === 'throw') throw new Error('EPIPE');
      // Asynchronous, as Node's is: the callback fires once what was queued ahead has gone.
      if (mode === 'drain') void Promise.resolve().then(callback);
      if (mode === 'error') void Promise.resolve().then(() => self.errorListeners.forEach((l) => l(new Error('EPIPE'))));
      return true;
    },
    ...state,
  };
  return self;
}

interface FakeProcess {
  log: string[];
  exits: number[];
  exitCode?: number | string;
  stdout?: FakeStream;
  stderr?: FakeStream;
  on(event: string, listener: Listener): unknown;
  removeListener(event: string, listener: Listener): unknown;
  listenerCount(event: string): number;
  exit(code?: number): never;
  kill(): boolean;
  pid: number;
  emit(event: string, ...args: unknown[]): void;
}

/** A process that records rather than acts: `exit` is a line in the log, not a death. */
function fakeProcess(streams: { stdout?: FakeStream | null; stderr?: FakeStream | null } = {}): FakeProcess {
  const listeners = new Map<string, Listener[]>();
  const log: string[] = [];
  const self: FakeProcess = {
    log,
    exits: [],
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return self;
    },
    removeListener(event, listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener));
      return self;
    },
    listenerCount: (event) => (listeners.get(event) ?? []).length,
    exit(code?: number): never {
      self.exits.push(code as number);
      log.push(`exit ${String(code)}`);
      return undefined as never;
    },
    kill: () => true,
    pid: 4242,
    emit(event, ...args) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
    },
  };
  if (streams.stdout !== null) self.stdout = streams.stdout ?? stream('stdout', log);
  if (streams.stderr !== null) self.stderr = streams.stderr ?? stream('stderr', log);
  return self;
}

/** A fresh copy of the façade, wired to `proc` — or to no process at all. */
async function load(proc: FakeProcess | undefined): Promise<typeof import('./exit-hook.js')> {
  vi.resetModules();
  vi.doMock('./ambient.js', () => ({ ambientProcess: () => proc }));
  return import('./exit-hook.js');
}

/** Long enough for a promise chain with no timers in it to run out: one macrotask. */
const ticks = async (): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

afterEach(() => {
  vi.doUnmock('./ambient.js');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const EVENTS = ['beforeExit', 'SIGINT', 'SIGTERM', 'exit', 'message'] as const;

describe('registration', () => {
  it('refuses a hook that is not a function, on both kinds', async () => {
    const { default: exitHook, asyncExitHook } = await load(fakeProcess());
    expect(() => exitHook(42 as never)).toThrow(new TypeError('onExit must be a function'));
    expect(() => asyncExitHook('later' as never, { wait: 10 })).toThrow(new TypeError('onExit must be a function'));
  });

  it.each([
    ['no options at all', undefined],
    ['no wait', {}],
    ['a zero wait', { wait: 0 }],
    ['a negative wait', { wait: -1 }],
    ['a numeric string', { wait: '5' }],
  ])('asyncExitHook refuses %s', async (_, options) => {
    const { asyncExitHook } = await load(fakeProcess());
    expect(() => asyncExitHook(() => undefined, options as never)).toThrow(new TypeError('wait must be set to a positive numeric value'));
  });

  it('attaches nothing at import, and one listener per event at the first hook, forever', async () => {
    const proc = fakeProcess();
    const { default: exitHook, asyncExitHook } = await load(proc);
    expect(EVENTS.map((e) => proc.listenerCount(e)), 'importing the façade costs a process nothing').toEqual([0, 0, 0, 0, 0]);

    const offs = [exitHook(() => undefined), asyncExitHook(() => undefined, { wait: 10 }), exitHook(() => undefined)];
    expect(EVENTS.map((e) => proc.listenerCount(e))).toEqual([1, 1, 1, 1, 1]);
    // exit-hook@5.1.0 registers nothing on SIGHUP, and neither does its drop-in.
    expect(proc.listenerCount('SIGHUP')).toBe(0);

    for (const off of offs) off();
    // `listener count`, upstream's own case: unsubscribing removes a hook, not the wiring.
    expect(EVENTS.map((e) => proc.listenerCount(e))).toEqual([1, 1, 1, 1, 1]);
  });

  it('an unsubscribed hook does not run, of either kind', async () => {
    const proc = fakeProcess();
    const { default: exitHook, asyncExitHook } = await load(proc);
    const ran: string[] = [];
    exitHook(() => void ran.push('kept'))
    const offSync = exitHook(() => void ran.push('sync-gone'));
    const offAsync = asyncExitHook(() => void ran.push('async-gone'), { wait: 10 });
    offSync();
    offAsync();

    proc.emit('SIGINT');
    await vi.waitFor(() => expect(proc.exits).toEqual([130]));
    expect(ran).toEqual(['kept']);
  });
});

describe('the explicit exit — process.exit() or falling off the end', () => {
  it('runs the synchronous hooks with process.exitCode, abandons the asynchronous ones, and does not exit again', async () => {
    const proc = fakeProcess();
    const { default: exitHook, asyncExitHook } = await load(proc);
    const notice = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: unknown[] = [];
    exitHook((code) => void seen.push(['sync', code]));
    asyncExitHook((code) => void seen.push(['async', code]), { wait: 50 });
    proc.exitCode = 3;

    proc.emit('exit', 3);
    await ticks();

    expect(seen).toEqual([['sync', 3]]);
    expect(proc.exits, "'exit' is already the way out; calling exit() inside it would be re-entrant").toEqual([]);
    expect(notice).toHaveBeenCalledTimes(1);
    expect(notice.mock.calls[0]?.[0]).toMatch(/^SYNCHRONOUS TERMINATION NOTICE: When explicitly exiting the process via process\.exit or via a parent process, asynchronous tasks in your exitHooks will not run\./);
  });

  it('prints no notice when there is no asynchronous work to throw away', async () => {
    const proc = fakeProcess();
    const { default: exitHook } = await load(proc);
    const notice = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    exitHook(() => undefined);

    proc.emit('exit', 0);
    expect(notice).not.toHaveBeenCalled();
  });

  it.each([
    ['unset', undefined, 0],
    ['a string, as Node allows', '4', '4'],
  ])('hands the hook process.exitCode when it is %s', async (_, exitCode, expected) => {
    const proc = fakeProcess();
    const { default: exitHook } = await load(proc);
    const seen: unknown[] = [];
    exitHook((code) => void seen.push(code));
    if (exitCode !== undefined) proc.exitCode = exitCode;

    proc.emit('exit');
    expect(seen).toEqual([expected]);
  });
});

describe('a signal', () => {
  it('runs every sync hook, then every async hook to completion, then drains stdio, then exits 130', async () => {
    const proc = fakeProcess();
    const { default: exitHook, asyncExitHook } = await load(proc);
    // Registered async-first, so only the phase — not registration order — can put sync ahead.
    asyncExitHook(async (code) => {
      proc.log.push(`async start ${String(code)}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      proc.log.push('async end');
    }, { wait: 1000 });
    exitHook((code) => void proc.log.push(`sync ${String(code)}`));
    // `SIGINT causes process.exitCode to be ignored`, upstream's case: a signal overrules it.
    proc.exitCode = 1;

    proc.emit('SIGINT');
    await vi.waitFor(() => expect(proc.exits).toEqual([130]));
    expect(proc.log).toEqual(['sync 130', 'async start 130', 'async end', 'drain stdout', 'drain stderr', 'exit 130']);
  });

  it('SIGTERM leaves with 143', async () => {
    const proc = fakeProcess();
    const { default: exitHook } = await load(proc);
    const seen: unknown[] = [];
    exitHook((code) => void seen.push(code));

    proc.emit('SIGTERM');
    await vi.waitFor(() => expect(proc.exits).toEqual([143]));
    expect(seen).toEqual([143]);
  });

  it('runs once and leaves once, whatever arrives after the first trigger', async () => {
    const proc = fakeProcess();
    const { default: exitHook, asyncExitHook } = await load(proc);
    let sync = 0;
    let async = 0;
    exitHook(() => void (sync += 1));
    asyncExitHook(() => void (async += 1), { wait: 50 });

    proc.emit('SIGINT');
    proc.emit('SIGINT');
    proc.emit('SIGTERM');
    proc.emit('beforeExit');
    proc.emit('exit', 0);
    proc.emit('message', 'shutdown');
    await vi.waitFor(() => expect(proc.exits).toEqual([130]));
    await ticks();

    expect({ sync, async }).toEqual({ sync: 1, async: 1 });
    expect(proc.exits, 'the first trigger decides the code; nothing after it leaves again').toEqual([130]);
  });

  it('waits max(wait) for the async hooks — the incumbent’s bound, not closeout’s 2 000 ms — then leaves anyway', async () => {
    vi.useFakeTimers();
    const proc = fakeProcess();
    const { asyncExitHook } = await load(proc);
    const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    asyncExitHook(() => new Promise<void>(() => undefined), { wait: 100 });
    asyncExitHook(() => undefined, { wait: 300 });

    proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(299);
    expect(proc.exits, 'max(100, 300) is 300; min would already have left').toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(proc.exits).toEqual([130]);
    expect(report).toHaveBeenCalledWith('closeout: shutdown deadline of 300ms expired; exiting anyway. Handlers that had not returned: (anonymous)');
  });
});

describe('beforeExit — the loop emptied on its own', () => {
  it.each([
    ['a number', 2, 2],
    ['a string, coerced for exit()', '5', 5],
    ['unset', undefined, 0],
  ])('leaves with process.exitCode when it is %s, after the hooks', async (_, exitCode, expected) => {
    const proc = fakeProcess();
    const { default: exitHook, asyncExitHook } = await load(proc);
    const seen: unknown[] = [];
    exitHook((code) => void seen.push(code));
    asyncExitHook((code) => void seen.push(code), { wait: 50 });
    if (exitCode !== undefined) proc.exitCode = exitCode;

    proc.emit('beforeExit', 0);
    await vi.waitFor(() => expect(proc.exits).toEqual([expected]));
    expect(seen).toEqual([exitCode ?? 0, exitCode ?? 0]);
  });
});

describe('PM2’s shutdown message', () => {
  it('is a synchronous exit: sync hooks, the notice, and exit(code) before anything is awaited', async () => {
    const proc = fakeProcess();
    const { default: exitHook, asyncExitHook } = await load(proc);
    const notice = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const seen: unknown[] = [];
    exitHook((code) => void seen.push(['sync', code]));
    asyncExitHook((code) => void seen.push(['async', code]), { wait: 50 });
    proc.exitCode = 6;

    proc.emit('message', 'shutdown');
    // No await: `process.exit()` is what PM2's path ends in, and nothing after it runs.
    expect(seen).toEqual([['sync', 6]]);
    expect(proc.exits).toEqual([6]);
    expect(notice).toHaveBeenCalledTimes(1);
  });

  it('ignores every other message', async () => {
    const proc = fakeProcess();
    const { default: exitHook } = await load(proc);
    let ran = 0;
    exitHook(() => void (ran += 1));

    proc.emit('message', 'reload');
    proc.emit('message', { type: 'shutdown' });
    await ticks();
    expect({ ran, exits: proc.exits }).toEqual({ ran: 0, exits: [] });
  });
});

describe('gracefulExit', () => {
  it('sets the code, runs the async hooks to completion, drains, and leaves with it', async () => {
    const proc = fakeProcess();
    const { asyncExitHook, gracefulExit } = await load(proc);
    asyncExitHook(async (code) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      proc.log.push(`async ${String(code)}`);
    }, { wait: 1000 });

    gracefulExit(3);
    expect(proc.exitCode).toBe(3);
    await vi.waitFor(() => expect(proc.exits).toEqual([3]));
    expect(proc.log).toEqual(['async 3', 'drain stdout', 'drain stderr', 'exit 3']);
  });

  it('with no argument, leaves with the code already set', async () => {
    const proc = fakeProcess();
    const { gracefulExit, default: exitHook } = await load(proc);
    exitHook(() => undefined);
    proc.exitCode = 7;

    gracefulExit();
    expect(proc.exitCode).toBe(7);
    await vi.waitFor(() => expect(proc.exits).toEqual([7]));
  });

  it('with no hooks registered at all still leaves — the bound falls back to closeout’s own', async () => {
    const proc = fakeProcess();
    const { gracefulExit } = await load(proc);
    // max() over no waits is -Infinity, which the registry refuses: the fallback is what
    // keeps this call from throwing instead of leaving.
    expect(() => gracefulExit()).not.toThrow();
    await vi.waitFor(() => expect(proc.exits).toEqual([0]));
  });
});

describe('draining stdio before leaving', () => {
  it.each([
    ['not writable', { writable: false }],
    ['with no writability flag at all', { writable: undefined }],
    ['already ended', { writableEnded: true }],
    ['destroyed', { destroyed: true }],
  ])('skips a stream that is %s, and leaves without waiting on it', async (_, state) => {
    vi.useFakeTimers();
    const log: string[] = [];
    const stdout = stream('stdout', log, 'never', state);
    const proc = fakeProcess({ stdout, stderr: null });
    const { gracefulExit } = await load(proc);

    gracefulExit(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(stdout.writes).toBe(0);
    expect(proc.exits).toEqual([0]);
  });

  it('leaves at once when a stream errors mid-drain, and takes its error listener back off', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const stdout = stream('stdout', log, 'error');
    const proc = fakeProcess({ stdout, stderr: null });
    const { gracefulExit } = await load(proc);

    gracefulExit(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.exits, 'a closed pipe has stopped being drainable; it is not a reason to wait').toEqual([0]);
    expect(stdout.errorListeners).toEqual([]);
  });

  it('leaves at once when the drain write throws', async () => {
    vi.useFakeTimers();
    const proc = fakeProcess({ stdout: stream('stdout', [], 'throw'), stderr: null });
    const { gracefulExit } = await load(proc);

    gracefulExit(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.exits).toEqual([0]);
  });

  it('drains a stream that has no listener methods, through the write callback alone', async () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const proc = fakeProcess({ stdout: stream('stdout', log, 'drain', { once: undefined, off: undefined }), stderr: null });
    const { gracefulExit } = await load(proc);

    gracefulExit(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['drain stdout']);
    expect(proc.exits).toEqual([0]);
  });

  it('gives up on a stream that never drains after exactly one second, and leaves', async () => {
    vi.useFakeTimers();
    const proc = fakeProcess({ stdout: stream('stdout', [], 'never'), stderr: null });
    const { gracefulExit } = await load(proc);

    gracefulExit(0);
    await vi.advanceTimersByTimeAsync(999);
    expect(proc.exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(proc.exits).toEqual([0]);
  });

  it('still leaves when draining itself fails — a stream that cannot even be listened to', async () => {
    vi.useFakeTimers();
    const proc = fakeProcess({ stdout: stream('stdout', [], 'once-throws'), stderr: null });
    const { gracefulExit } = await load(proc);

    gracefulExit(4);
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.exits, 'the flush rejected, and the rejection arm leaves too').toEqual([4]);
  });
});

describe('a runtime with no process', () => {
  it('registers without throwing, and gracefulExit still runs every hook — with 0, having nowhere to keep a code', async () => {
    const { default: exitHook, asyncExitHook, gracefulExit } = await load(undefined);
    const seen: unknown[] = [];
    const off = exitHook((code) => void seen.push(['sync', code]));
    asyncExitHook((code) => void seen.push(['async', code]), { wait: 50 });
    expect(typeof off).toBe('function');

    expect(() => gracefulExit(3)).not.toThrow();
    await vi.waitFor(() => expect(seen).toEqual([['sync', 0], ['async', 0]]));
  });
});
