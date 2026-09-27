/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Design R4, all three thirds of it: raw mode off, cursor shown, alternate screen left —
 * **last**, and on every door out of the program, including the two it exists for: a handler
 * that threw and a deadline that fired.
 *
 * Until 2026-09-27 R4 was one third built. `hideCursor` paired a change with its undo; raw
 * mode and the alternate screen had no pairing at all, and the README said "still to come".
 * A program that died on the alternate screen left its user staring at a frozen frame, and
 * one that died in raw mode left a shell that echoes nothing.
 *
 * Every case drives `install({ process })` with a fake process and a fake terminal, so a
 * signal is a function call and the terminal is one array: the order the undos land in is
 * read straight off it. `terminal-restore.test.ts` asserts the same bytes on real children.
 *
 * **Why a release handler is registered after the terminal is changed, in every cell.** A
 * handler registered *before* would run first under any implementation, including one that
 * put the undos in the default phase — so a cell written that way passes on the bug. Here
 * registration order and phase order disagree, and only the phase can produce the result.
 */
import { describe, expect, it } from 'vitest';

import { install, SIGNALS, type InputStream, type OutputStream, type ProcessLike } from './index.js';

type Listener = (...args: never[]) => void;

interface FakeProcess extends ProcessLike {
  raise(event: string, ...args: unknown[]): void;
}

/** A process that records rather than acts — the same shape `matrix.test.ts` uses. */
function fakeProcess(): FakeProcess {
  const listeners = new Map<string, Listener[]>();
  const self: FakeProcess = {
    on(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return self;
    },
    removeListener(event: string, listener: Listener) {
      listeners.set(event, (listeners.get(event) ?? []).filter((known) => known !== listener));
      return self;
    },
    listenerCount: (event: string) => (listeners.get(event) ?? []).length,
    // Recorded nowhere: these cells are about what the terminal is left as, and
    // `matrix.test.ts` / `signal.test.ts` already grade how the process leaves.
    exit: (): never => undefined as never,
    kill: () => true,
    pid: 4242,
    stderr: { write: () => true, isTTY: false },
    raise(event: string, ...args: unknown[]): void {
      for (const listener of [...(listeners.get(event) ?? [])]) (listener as (...a: unknown[]) => void)(...args);
    },
  };
  return self;
}

const NAMES: Record<string, string> = {
  '\u001B[?1049h': 'enter-alt',
  '\u001B[?1049l': 'leave-alt',
  '\u001B[?25l': 'hide',
  '\u001B[?25h': 'show',
};

/** One terminal — an output and a keyboard — writing into one log, with handlers beside it. */
function terminal(log: string[], options: { isTTY?: boolean | undefined; alreadyRaw?: boolean | undefined } = {}): { out: OutputStream; keys: InputStream } {
  const { isTTY = true, alreadyRaw = false } = options;
  const keys: InputStream = {
    isTTY,
    isRaw: alreadyRaw,
    setRawMode(mode: boolean) {
      log.push(mode ? 'raw-on' : 'raw-off');
      keys.isRaw = mode;
      return keys;
    },
  };
  const out: OutputStream = {
    isTTY,
    write(chunk: string) {
      log.push(NAMES[chunk] ?? chunk);
      return true;
    },
  };
  return { out, keys };
}

/** What a full-screen program does on its way in: keyboard, screen, cursor. */
const ENTERED = ['raw-on', 'enter-alt', 'hide'];
/** What it must be left as, in `restore`, after every other handler: the same three, undone. */
const RESTORED = ['raw-off', 'leave-alt', 'show'];

/** Long enough for a 10 ms deadline to fire and for the promise chain behind it to settle. */
const pastTheDeadline = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 40));
};

/** Take the terminal over the way a full-screen program does, then register a cleanup of its own. */
function fullScreenProgram(options: Parameters<typeof install>[0] & { isTTY?: boolean; alreadyRaw?: boolean } = {}): {
  proc: FakeProcess;
  log: string[];
  closeout: ReturnType<typeof install>;
} {
  const { isTTY, alreadyRaw, ...installOptions } = options;
  const proc = fakeProcess();
  const log: string[] = [];
  const closeout = install({ process: proc, onError: () => undefined, onTimeout: () => undefined, ...installOptions });
  const { out, keys } = terminal(log, { isTTY, alreadyRaw });
  closeout.rawMode(keys);
  closeout.alternateScreen(out);
  closeout.hideCursor(out);
  // Registered after the terminal was taken, in the default phase — see the header.
  closeout.onExit(() => {
    log.push('release');
  });
  return { proc, log, closeout };
}

describe('every door out leaves the terminal as it was found, last', () => {
  it.each([...SIGNALS])('%s', async (signal) => {
    const { proc, log } = fullScreenProgram();

    proc.raise(signal);
    await pastTheDeadline();

    expect(log).toEqual([...ENTERED, 'release', ...RESTORED]);
  });

  it("'exit' — process.exit() or falling off the end, where nothing can be awaited", () => {
    const { proc, log } = fullScreenProgram();

    proc.raise('exit', 0);

    expect(log).toEqual([...ENTERED, 'release', ...RESTORED]);
  });

  it("'beforeExit'", async () => {
    const { proc, log } = fullScreenProgram();

    proc.raise('beforeExit', 0);
    await pastTheDeadline();

    expect(log).toEqual([...ENTERED, 'release', ...RESTORED]);
  });

  it.each([
    ['uncaughtException', new Error('mid-render')],
    ['unhandledRejection', 'a string nobody caught'],
  ])('%s', async (event, error) => {
    const { proc, log } = fullScreenProgram();

    proc.raise(event, error);
    await pastTheDeadline();

    expect(log).toEqual([...ENTERED, 'release', ...RESTORED]);
  });
});

describe('the two paths R4 names by name', () => {
  it('a handler that threw does not keep the terminal', async () => {
    const { proc, log, closeout } = fullScreenProgram();
    closeout.onExit(() => {
      throw new Error('the lock file was already gone');
    }, 'flush');

    proc.raise('SIGTERM');
    await pastTheDeadline();

    expect(log).toEqual([...ENTERED, 'release', ...RESTORED]);
  });

  it('a handler that threw on the synchronous exit path does not keep it either', () => {
    const { proc, log, closeout } = fullScreenProgram();
    closeout.onExit(() => {
      throw new Error('the lock file was already gone');
    }, 'release');

    proc.raise('exit', 1);

    expect(log).toEqual([...ENTERED, 'release', ...RESTORED]);
  });

  it('a deadline that fired does not keep it: the restore is run, just not waited for', async () => {
    const { proc, log, closeout } = fullScreenProgram({ deadline: 10 });
    closeout.onExit(() => new Promise<void>(() => undefined), { phase: 'flush', label: 'the-socket-that-will-not-close' });

    proc.raise('SIGINT');
    await pastTheDeadline();

    // `release` never ran because `flush` never returned, and it is not what this cell is
    // about. What is: the terminal came back anyway, past the deadline.
    expect(log.slice(0, ENTERED.length)).toEqual(ENTERED);
    expect(log.slice(-RESTORED.length)).toEqual(RESTORED);
    expect(closeout.registry.report).toMatchObject({ timedOut: true, unfinished: ['the-socket-that-will-not-close'] });
  });

  it("'exit' arriving before the deadline, while the shutdown still waits on flush", async () => {
    // The real-process shape of a hang that holds nothing in the loop: the deadline's timer
    // is unref'd, so the loop drains and Node leaves through 'exit' first. The run is still
    // parked on `flush`; the phases it has not reached must be invoked now or never.
    const { proc, log, closeout } = fullScreenProgram();
    closeout.onExit(() => new Promise<void>(() => undefined), 'flush');

    proc.raise('SIGTERM');
    await Promise.resolve();
    proc.raise('exit', 0);

    expect(log).toEqual([...ENTERED, 'release', ...RESTORED]);
  });
});

describe('idempotent, and only what closeout turned on', () => {
  it('a second door does not undo anything twice', async () => {
    const { proc, log } = fullScreenProgram();

    proc.raise('SIGINT');
    proc.raise('SIGTERM');
    await pastTheDeadline();
    proc.raise('exit', 130);

    expect(log).toEqual([...ENTERED, 'release', ...RESTORED]);
  });

  it('a program that put the terminal back itself leaves nothing for exit to do', async () => {
    const proc = fakeProcess();
    const log: string[] = [];
    const closeout = install({ process: proc });
    const { out, keys } = terminal(log);
    const undo = [closeout.rawMode(keys), closeout.alternateScreen(out), closeout.hideCursor(out)];

    for (const back of undo) back();
    expect(closeout.registry.size, 'each undo came off the registry as it ran').toBe(0);
    proc.raise('SIGTERM');
    await pastTheDeadline();

    expect(log).toEqual([...ENTERED, ...RESTORED]);
  });

  it('raw mode somebody else turned on is still on after exit', async () => {
    const { proc, log } = fullScreenProgram({ alreadyRaw: true });

    proc.raise('SIGINT');
    await pastTheDeadline();

    expect(log).toEqual(['enter-alt', 'hide', 'release', 'leave-alt', 'show']);
  });

  it('a terminal that is not a terminal gets no escape and no mode change, on any path', async () => {
    const { proc, log } = fullScreenProgram({ isTTY: false });

    proc.raise('SIGINT');
    await pastTheDeadline();
    proc.raise('exit', 130);

    expect(log).toEqual(['release']);
  });
});
