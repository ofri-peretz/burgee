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

import { hideCursor, showCursor, type OutputStream } from './cursor.js';
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
