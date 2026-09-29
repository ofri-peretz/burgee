/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/restore-cursor`, driven in this process against a fake one.
 *
 * `restore-cursor`'s own suite grades this façade in `compat-oracle`, by spawning a child per
 * combination of `isTTY` flags — another process, invisible to a counter here. These cases pin
 * the same decisions where one can see them: stderr before stdout, decided at the call and not
 * at exit, registered once, written in `restore` after every other handler, and nothing at all
 * — no bytes, no listeners — when neither stream is a terminal.
 *
 * The stream choice reads the ambient process at call time, and the exit registration goes
 * through the process-wide instance, which resolves the ambient process at import. Each case
 * mocks `ambientProcess()` and imports fresh copies of both, so the process-wide instance is
 * installed on the fake and never on the process running this suite.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHOW_CURSOR } from './cursor.js';

type Listener = (...args: unknown[]) => void;

interface FakeStream {
  isTTY?: boolean;
  write(chunk: string): boolean;
}

interface FakeProcess {
  stdout?: FakeStream;
  stderr: FakeStream;
  on(event: string, listener: Listener): unknown;
  removeListener(event: string, listener: Listener): unknown;
  listenerCount(event: string): number;
  exit(code?: number): never;
  kill(): boolean;
  pid: number;
  emit(event: string, ...args: unknown[]): void;
}

/** A process whose two streams write into one log, tagged with which of them it was. */
function fakeProcess(tty: { stderr: boolean; stdout?: boolean }, log: string[]): FakeProcess {
  const listeners = new Map<string, Listener[]>();
  const tagged = (name: string, isTTY: boolean): FakeStream => ({
    isTTY,
    write(chunk) {
      log.push(`${name} ${JSON.stringify(chunk)}`);
      return true;
    },
  });
  const self: FakeProcess = {
    stderr: tagged('stderr', tty.stderr),
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return self;
    },
    removeListener(event, listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener));
      return self;
    },
    listenerCount: (event) => (listeners.get(event) ?? []).length,
    exit: (): never => undefined as never,
    kill: () => true,
    pid: 4242,
    emit(event, ...args) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(...args);
    },
  };
  if (tty.stdout !== undefined) self.stdout = tagged('stdout', tty.stdout);
  return self;
}

/** Fresh copies of the façade and the process-wide instance, both seeing `proc`. */
async function load(proc: FakeProcess | undefined): Promise<{ restoreCursor: () => void; onExit: typeof import('./install.js').onExit }> {
  vi.resetModules();
  vi.doMock('./ambient.js', () => ({ ambientProcess: () => proc }));
  // One after the other, not `Promise.all`: imported concurrently, the façade's own copy of
  // `install.js` was the previous case's — installed on the previous case's fake — and five of
  // these cases failed for a reason that had nothing to do with the façade.
  const { default: restoreCursor } = await import('./restore-cursor.js');
  const { onExit } = await import('./install.js');
  return { restoreCursor, onExit };
}

afterEach(() => {
  vi.doUnmock('./ambient.js');
});

const SHOW = JSON.stringify(SHOW_CURSOR);

describe('which stream the cursor comes back on', () => {
  it.each([
    ['stderr when it is a terminal, even when stdout is one too', { stderr: true, stdout: true }, [`stderr ${SHOW}`]],
    ['stdout when only stdout is a terminal', { stderr: false, stdout: true }, [`stdout ${SHOW}`]],
  ])('%s', async (_, tty, expected) => {
    const log: string[] = [];
    const proc = fakeProcess(tty, log);
    const { restoreCursor } = await load(proc);

    restoreCursor();
    expect(log, 'nothing is written at the call; the restore belongs to the exit').toEqual([]);
    proc.emit('exit', 0);
    expect(log).toEqual(expected);
  });

  it.each([
    ['neither stream is a terminal', { stderr: false, stdout: false }],
    ['stderr is not a terminal and there is no stdout', { stderr: false }],
  ])('does nothing at all when %s — no bytes, and no listener on the process', async (_, tty) => {
    const log: string[] = [];
    const proc = fakeProcess(tty, log);
    const { restoreCursor } = await load(proc);

    restoreCursor();
    expect(proc.listenerCount('exit'), 'the process-wide instance was never installed').toBe(0);
    proc.emit('exit', 0);
    expect(log).toEqual([]);
  });

  it('does nothing, and does not throw, in a runtime with no process', async () => {
    const { restoreCursor } = await load(undefined);
    expect(() => restoreCursor()).not.toThrow();
  });
});

describe('when the decision is taken', () => {
  it('at the call: the byte still goes out after isTTY is deleted, as the incumbent’s fixtures do', async () => {
    const log: string[] = [];
    const proc = fakeProcess({ stderr: true }, log);
    const { restoreCursor } = await load(proc);

    restoreCursor();
    delete proc.stderr.isTTY;
    proc.emit('exit', 0);
    expect(log).toEqual([`stderr ${SHOW}`]);
  });

  it('registers once however often it is called — one sequence, not one per call', async () => {
    const log: string[] = [];
    const proc = fakeProcess({ stderr: true }, log);
    const { restoreCursor } = await load(proc);

    restoreCursor();
    restoreCursor();
    restoreCursor();
    proc.emit('exit', 0);
    expect(log).toEqual([`stderr ${SHOW}`]);
  });

  it('a call that found no terminal does not use up the once: a later call on a terminal still registers', async () => {
    const log: string[] = [];
    const proc = fakeProcess({ stderr: false }, log);
    const { restoreCursor } = await load(proc);

    restoreCursor();
    proc.stderr.isTTY = true;
    restoreCursor();
    proc.emit('exit', 0);
    expect(log).toEqual([`stderr ${SHOW}`]);
  });
});

describe('where it runs in the shutdown', () => {
  it('last: after a handler registered later in the default phase, on a signal too', async () => {
    const log: string[] = [];
    const proc = fakeProcess({ stderr: true }, log);
    const { restoreCursor, onExit } = await load(proc);

    // The restore first and the handler second, so registration order would put the cursor
    // back before the handler ran; only the `restore` phase puts it after.
    restoreCursor();
    onExit(() => void log.push('release handler'));

    proc.emit('SIGINT');
    await vi.waitFor(() => expect(log).toEqual(['release handler', `stderr ${SHOW}`]));
  });
});
