/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The process-wide instance — `onExit`, `hideCursor` and friends called with no `install()` —
 * and the ambient lookup it is built on.
 *
 * `global-process.test.ts` calls the entry the way the README does, against the real process.
 * That is the right test of the lookup and the wrong place for anything that *runs*: a
 * shutdown triggered there is this suite's own. So these cases mock `ambientProcess()` and
 * import a fresh `install.js` over a fake, which is the seam the lookup exists to be.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ambientProcess } from './ambient.js';
import { HIDE_CURSOR, SHOW_CURSOR } from './cursor.js';

type Listener = (...args: unknown[]) => void;

interface FakeProcess {
  stderr: { isTTY: boolean; write(chunk: string): boolean };
  on(event: string, listener: Listener): unknown;
  removeListener(event: string, listener: Listener): unknown;
  listenerCount(event: string): number;
  exit(code?: number): never;
  kill(): boolean;
  pid: number;
  emit(event: string, ...args: unknown[]): void;
}

function fakeProcess(): FakeProcess {
  const listeners = new Map<string, Listener[]>();
  const self: FakeProcess = {
    stderr: { isTTY: true, write: () => true },
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
  return self;
}

async function load(proc: FakeProcess | undefined): Promise<typeof import('./install.js')> {
  vi.resetModules();
  vi.doMock('./ambient.js', () => ({ ambientProcess: () => proc }));
  return import('./install.js');
}

afterEach(() => {
  vi.doUnmock('./ambient.js');
});

describe('a runtime with no process', () => {
  it('install() says which option to pass, instead of failing on a name the caller never wrote', async () => {
    const { install } = await load(undefined);
    expect(() => install()).toThrow(
      new TypeError('closeout needs a process to listen on, and this runtime has no global `process`. Pass one: install({ process })'),
    );
  });

  it('install({ process }) still works there — the option is the way out the message names', async () => {
    const { install } = await load(undefined);
    const proc = fakeProcess();
    const closeout = install({ process: proc as never });
    const handler = vi.fn();
    closeout.onExit(handler);

    proc.emit('exit', 0);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('hideCursor on the process-wide instance', () => {
  it('hides now, installs lazily on the ambient process, and shows the cursor again at exit — once', async () => {
    const proc = fakeProcess();
    const { hideCursor } = await load(proc);
    const written: string[] = [];
    const stream = { isTTY: true, write: (chunk: string) => void written.push(chunk) };

    expect(proc.listenerCount('exit'), 'importing closeout attaches nothing').toBe(0);
    hideCursor(stream as never);
    expect(written).toEqual([HIDE_CURSOR]);
    expect(proc.listenerCount('exit'), 'the first use installs, on the ambient process').toBe(1);

    proc.emit('exit', 0);
    proc.emit('exit', 0);
    expect(written).toEqual([HIDE_CURSOR, SHOW_CURSOR]);
  });
});

describe('the ambient lookup', () => {
  const real: unknown = Reflect.get(globalThis, 'process');
  /** Swap the global for one synchronous call, and put it back whatever happens. */
  const lookupWith = (value: unknown): unknown => {
    Reflect.set(globalThis, 'process', value);
    try {
      return ambientProcess();
    } finally {
      Reflect.set(globalThis, 'process', real);
    }
  };

  it('is the real process, when there is one', () => {
    expect(ambientProcess()).toBe(real);
  });

  it('is a process-shaped object whatever else it lacks — `on` is the test', () => {
    const shaped = { on: () => undefined };
    expect(lookupWith(shaped)).toBe(shaped);
  });

  it.each([
    ['absent', undefined],
    ['null', null],
    ['not an object', 'process'],
    ['an object with no `on`', { exit: () => undefined }],
  ])('is undefined when the global is %s', (_, value) => {
    expect(lookupWith(value)).toBeUndefined();
  });
});
