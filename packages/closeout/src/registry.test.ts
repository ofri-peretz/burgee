/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The four promises closeout makes, each as a case that fails without the line that keeps
 * it: exactly once, on every path, one handler's failure is its own, and shutdown is
 * bounded.
 *
 * None of these need a real signal. The registry is the half where the bugs live, and it
 * is pure — which is why it is a separate module from the process wiring.
 */
import { describe, expect, it, vi } from 'vitest';

import { createRegistry } from './registry.js';

const EXITED = { code: 0, signal: null };
const INTERRUPTED = { code: null, signal: 'SIGINT' };

describe('exactly once', () => {
  it('runs a handler once however many times shutdown is asked for', async () => {
    const handler = vi.fn();
    const registry = createRegistry();
    registry.add(handler);

    // Ctrl-C twice, then the 'exit' event behind it — one real shutdown, three arrivals.
    await registry.run(INTERRUPTED);
    await registry.run(INTERRUPTED);
    registry.runSync(EXITED);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not run a handler the caller unregistered', async () => {
    const handler = vi.fn();
    const registry = createRegistry();
    const off = registry.add(handler);
    off();

    await registry.run(EXITED);
    expect(handler).not.toHaveBeenCalled();
    expect(registry.size).toBe(0);
  });

  it('reports whether shutdown has happened', async () => {
    const registry = createRegistry();
    expect(registry.settled).toBe(false);
    await registry.run(EXITED);
    expect(registry.settled).toBe(true);
  });
});

describe('every path', () => {
  it('tells a handler which door the program left by', async () => {
    const seen: unknown[] = [];
    const registry = createRegistry();
    registry.add((info) => {
      seen.push(info);
    });

    await registry.run(INTERRUPTED);
    expect(seen).toEqual([{ code: null, signal: 'SIGINT' }]);
  });

  it('passes the exit code on the synchronous path', () => {
    const seen: unknown[] = [];
    const registry = createRegistry();
    registry.add((info) => {
      seen.push(info);
    });

    registry.runSync({ code: 3, signal: null });
    expect(seen).toEqual([{ code: 3, signal: null }]);
  });
});

describe("one handler's failure is its own", () => {
  it('runs the rest after one throws, and reports it', async () => {
    const after = vi.fn();
    const onError = vi.fn();
    const registry = createRegistry({ onError });
    registry.add(() => {
      throw new Error('the first one blew up');
    });
    registry.add(after);

    await registry.run(EXITED);

    /*
     * The handlers that restore the terminal are usually registered LAST, so a throw that
     * short-circuits the loop is the one that strands a hidden cursor.
     */
    expect(after).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('reports a rejected async handler without failing the shutdown', async () => {
    const onError = vi.fn();
    const after = vi.fn();
    const registry = createRegistry({ onError });
    registry.add(async () => {
      await Promise.reject(new Error('never mind'));
    });
    registry.add(after);

    await expect(registry.run(EXITED)).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('survives a throw on the synchronous path too', () => {
    const after = vi.fn();
    const onError = vi.fn();
    const registry = createRegistry({ onError });
    registry.add(() => {
      throw new Error('boom');
    });
    registry.add(after);

    registry.runSync(EXITED);
    expect(after).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe('bounded', () => {
  it('stops waiting for a handler that never settles', async () => {
    const registry = createRegistry({ deadline: 10 });
    // A socket that will not close. Without the deadline this await never returns, and
    // Ctrl-C becomes a process the user has to kill twice — the second time with SIGKILL,
    // which runs no handlers at all.
    registry.add(() => new Promise<void>(() => undefined));

    await expect(registry.run(INTERRUPTED)).resolves.toBeUndefined();
  });

  it('does not wait out the deadline when every handler has settled', async () => {
    const registry = createRegistry({ deadline: 10_000 });
    registry.add(async () => {
      await Promise.resolve();
    });

    const started = Date.now();
    await registry.run(EXITED);
    // Returns on the handlers, not on the clock.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('returns immediately when no handler is async', async () => {
    const registry = createRegistry({ deadline: 10_000 });
    registry.add(() => undefined);

    const started = Date.now();
    await registry.run(EXITED);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
