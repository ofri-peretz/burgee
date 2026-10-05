/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Hiding the cursor is a side effect on somebody else's terminal, and the bug this module
 * exists to prevent is leaving it hidden. Every case below is a way that happens.
 */
import { describe, expect, it, vi } from 'vitest';

import { alternateScreen, bracketedPaste, hideCursor, rawMode, showCursor, type InputStream, type OutputStream } from './cursor.js';
import { createRegistry } from './registry.js';

const unregister = (): void => undefined;

const HIDE = '\u001B[?25l';
const SHOW = '\u001B[?25h';

function recorder(isTTY = true): OutputStream & { written: string } {
  const chunks: string[] = [];
  return {
    isTTY,
    write(chunk: string) {
      chunks.push(chunk);
      return true;
    },
    get written() {
      return chunks.join('');
    },
  };
}

describe('hideCursor', () => {
  it('shows the cursor again when the program exits without cleaning up', async () => {
    const stream = recorder();
    const registry = createRegistry();
    hideCursor(stream, (handler) => registry.add(handler));

    expect(stream.written).toBe(HIDE);

    // Ctrl-C. Nobody called the returned function; the exit path has to.
    await registry.run({ code: null, signal: 'SIGINT' });
    expect(stream.written).toBe(HIDE + SHOW);
  });

  it('leaves nothing for exit to do when the caller cleans up itself', async () => {
    const stream = recorder();
    const registry = createRegistry();
    const restore = hideCursor(stream, (handler) => registry.add(handler));

    restore();
    expect(stream.written).toBe(HIDE + SHOW);
    // Unregistered, so the exit path is not holding a reference to a finished prompt.
    expect(registry.size).toBe(0);

    await registry.run({ code: 0, signal: null });
    expect(stream.written).toBe(HIDE + SHOW);
  });

  it('shows the cursor once even if both the caller and exit ask', async () => {
    const stream = recorder();
    const registry = createRegistry();
    const restore = hideCursor(stream, (handler) => registry.add(handler));

    restore();
    restore();
    await registry.run({ code: 0, signal: null });

    expect(stream.written.match(/\[\?25h/g)).toHaveLength(1);
  });

  it('writes nothing to a pipe', async () => {
    const stream = recorder(false);
    const registry = createRegistry();
    const restore = hideCursor(stream, (handler) => registry.add(handler));

    // Escape sequences in a pipe corrupt the output the pipe exists to carry.
    expect(stream.written).toBe('');
    expect(registry.size).toBe(0);
    restore();
    await registry.run({ code: 0, signal: null });
    expect(stream.written).toBe('');
  });
});

describe('showCursor', () => {
  it('is safe when the cursor was never hidden', () => {
    const stream = recorder();
    showCursor(stream);
    expect(stream.written).toBe(SHOW);
  });

  it('is a no-op on a non-TTY', () => {
    const stream = recorder(false);
    showCursor(stream);
    expect(stream.written).toBe('');
  });

  it('does not throw when the stream is already closed', () => {
    const closed: OutputStream = {
      isTTY: true,
      write() {
        throw new Error('EPIPE');
      },
    };
    // The caller's `finally` may well run after the pipe went away; that is the caller's
    // problem to catch, and this documents that the module does not swallow it silently.
    expect(() => showCursor(closed)).toThrow('EPIPE');
  });
});

describe('the pairing', () => {
  it('registers the restore at the same moment it hides', () => {
    const stream = recorder();
    const add = vi.fn(() => unregister);

    hideCursor(stream, add);

    // The whole reason this lives here rather than in each renderer: the hide and the
    // restore cannot drift apart if one call does both.
    expect(add).toHaveBeenCalledTimes(1);
    expect(stream.written).toBe(HIDE);
  });
});

const ENTER = '\u001B[?1049h';
const LEAVE = '\u001B[?1049l';

/** A terminal input that records every mode change, and keeps `isRaw` the way node does. */
function keyboard(options: { isTTY?: boolean; isRaw?: boolean; settable?: boolean } = {}): InputStream & { modes: boolean[] } {
  const { isTTY = true, isRaw = false, settable = true } = options;
  const self: InputStream & { modes: boolean[] } = { isTTY, isRaw, modes: [] };
  if (settable) {
    self.setRawMode = (mode: boolean) => {
      self.modes.push(mode);
      self.isRaw = mode;
      return self;
    };
  }
  return self;
}

describe('alternateScreen', () => {
  it('leaves the alternate screen when the program exits without leaving it', async () => {
    const stream = recorder();
    const registry = createRegistry();
    alternateScreen(stream, (handler) => registry.add(handler));

    expect(stream.written).toBe(ENTER);
    await registry.run({ code: null, signal: 'SIGTERM' });
    expect(stream.written).toBe(ENTER + LEAVE);
  });

  it('leaves once, however many times the caller and exit ask, and unregisters itself', async () => {
    const stream = recorder();
    const registry = createRegistry();
    const leave = alternateScreen(stream, (handler) => registry.add(handler));

    leave();
    leave();
    expect(registry.size).toBe(0);
    await registry.run({ code: 0, signal: null });

    expect(stream.written).toBe(ENTER + LEAVE);
  });

  it('writes nothing to a pipe, in either direction', async () => {
    const stream = recorder(false);
    const registry = createRegistry();
    const leave = alternateScreen(stream, (handler) => registry.add(handler));

    expect(registry.size).toBe(0);
    leave();
    await registry.run({ code: 0, signal: null });
    expect(stream.written).toBe('');
  });
});

describe('bracketedPaste', () => {
  const ON = '\u001B[?2004h';
  const OFF = '\u001B[?2004l';

  it('turns bracketed paste off when the program exits without turning it off', async () => {
    const stream = recorder();
    const registry = createRegistry();
    bracketedPaste(stream, (handler) => registry.add(handler));
    expect(stream.written).toBe(ON);
    await registry.run({ code: null, signal: 'SIGINT' });
    expect(stream.written).toBe(ON + OFF);
  });

  it('turns it off once, however many times it is asked, and unregisters itself', async () => {
    const stream = recorder();
    const registry = createRegistry();
    const off = bracketedPaste(stream, (handler) => registry.add(handler));
    off();
    off();
    expect(registry.size).toBe(0);
    await registry.run({ code: 0, signal: null });
    expect(stream.written).toBe(ON + OFF);
  });

  it('writes nothing to a pipe, in either direction', () => {
    const stream = recorder(false);
    const registry = createRegistry();
    bracketedPaste(stream, (handler) => registry.add(handler))();
    expect(registry.size).toBe(0);
    expect(stream.written).toBe('');
  });
});

describe('rawMode', () => {
  it('turns raw mode off when the program exits without turning it off', async () => {
    const input = keyboard();
    const registry = createRegistry();
    rawMode(input, (handler) => registry.add(handler));

    expect(input.modes).toEqual([true]);
    await registry.run({ code: null, signal: 'SIGINT' });
    expect(input.modes).toEqual([true, false]);
    expect(input.isRaw).toBe(false);
  });

  it('turns it off once, however many times the caller and exit ask', async () => {
    const input = keyboard();
    const registry = createRegistry();
    const off = rawMode(input, (handler) => registry.add(handler));

    off();
    off();
    expect(registry.size).toBe(0);
    await registry.run({ code: 0, signal: null });

    expect(input.modes).toEqual([true, false]);
  });

  it('leaves a mode it did not turn on alone — now and at exit', async () => {
    // A prompt library already owns raw mode. Switching it off at exit would take the
    // keyboard from its owner; the "on" would be a no-op that then registered exactly that.
    const input = keyboard({ isRaw: true });
    const registry = createRegistry();
    const off = rawMode(input, (handler) => registry.add(handler));

    expect(registry.size).toBe(0);
    off();
    await registry.run({ code: 0, signal: null });
    expect(input.modes, 'no mode change in either direction').toEqual([]);
    expect(input.isRaw).toBe(true);
  });

  it('does nothing to an input that is not a terminal, or has no raw mode to set', async () => {
    const registry = createRegistry();
    const piped = keyboard({ isTTY: false });
    const bare = keyboard({ settable: false });

    rawMode(piped, (handler) => registry.add(handler))();
    rawMode(bare, (handler) => registry.add(handler))();
    await registry.run({ code: 0, signal: null });

    expect(piped.modes).toEqual([]);
    expect(registry.size).toBe(0);
  });
});
