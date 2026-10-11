/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `closeout/cli-cursor`, driven in this process against a fake one.
 *
 * cli-cursor's own suite grades the façade in `compat-oracle` (`graded-override-targets` R4),
 * in a worker this counter cannot see. These cases hold the same decisions here: the stream is
 * `process.stderr` unless one is given, read at each call; a stream that is not a terminal gets
 * nothing; `toggle` reads one flag for the process; and a hide arranges the show at exit through
 * `closeout/restore-cursor`. Each case imports fresh copies over a mocked `ambientProcess()`, so
 * the process-wide instance is installed on the fake and never on the process running this.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HIDE_CURSOR, SHOW_CURSOR } from './cursor.js';

type Listener = (...args: unknown[]) => void;

interface Recorder {
  isTTY?: boolean;
  written: string[];
  write(chunk: string): boolean;
}

const recorder = (isTTY: boolean): Recorder => {
  const self: Recorder = {
    isTTY,
    written: [],
    write(chunk) {
      self.written.push(chunk);
      return true;
    },
  };
  return self;
};

/** A process with a recording stderr and a listener table `emit` can fire. */
function fakeProcess(stderr: Recorder): { stderr: Recorder; emit: (event: string) => void } & Record<string, unknown> {
  const listeners = new Map<string, Listener[]>();
  const self = {
    stderr,
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return self;
    },
    removeListener(event: string, listener: Listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter((l) => l !== listener));
      return self;
    },
    listenerCount: (event: string) => (listeners.get(event) ?? []).length,
    exit: (): never => undefined as never,
    kill: () => true,
    pid: 4242,
    emit(event: string) {
      for (const listener of [...(listeners.get(event) ?? [])]) listener(0);
    },
  };
  return self;
}

async function load(proc: unknown): Promise<typeof import('./cli-cursor.js').default> {
  vi.resetModules();
  vi.doMock('./ambient.js', () => ({ ambientProcess: () => proc }));
  return (await import('./cli-cursor.js')).default;
}

afterEach(() => {
  vi.doUnmock('./ambient.js');
});

describe('closeout/cli-cursor is cli-cursor 5', () => {
  it('shows and hides on process.stderr by default, read at each call', async () => {
    const proc = fakeProcess(recorder(true));
    const cliCursor = await load(proc);
    cliCursor.hide();
    cliCursor.show();
    expect(proc.stderr.written).toEqual([HIDE_CURSOR, SHOW_CURSOR]);
  });

  it('writes to a stream it is given, and nothing to one that is not a terminal', async () => {
    const proc = fakeProcess(recorder(true));
    const cliCursor = await load(proc);
    const pipe = recorder(false);
    const other = recorder(true);
    cliCursor.hide(pipe);
    cliCursor.show(pipe);
    cliCursor.show(other);
    expect(pipe.written).toEqual([]);
    expect(other.written).toEqual([SHOW_CURSOR]);
  });

  it('toggles on one flag for the process, which force sets first', async () => {
    const proc = fakeProcess(recorder(true));
    const cliCursor = await load(proc);
    cliCursor.toggle();
    cliCursor.toggle();
    cliCursor.toggle(true);
    cliCursor.toggle(false);
    expect(proc.stderr.written).toEqual([HIDE_CURSOR, SHOW_CURSOR, SHOW_CURSOR, HIDE_CURSOR]);
  });

  it('shows the cursor again at exit after a hide, once', async () => {
    const proc = fakeProcess(recorder(true));
    const cliCursor = await load(proc);
    cliCursor.hide();
    cliCursor.hide();
    proc.emit('exit');
    expect(proc.stderr.written).toEqual([HIDE_CURSOR, HIDE_CURSOR, SHOW_CURSOR]);
  });

  it('does nothing, and does not throw, in a runtime with no process', async () => {
    const cliCursor = await load(undefined);
    expect(() => {
      cliCursor.hide();
      cliCursor.show();
      cliCursor.toggle();
    }).not.toThrow();
  });
});
