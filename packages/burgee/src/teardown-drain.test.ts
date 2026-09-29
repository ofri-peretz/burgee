/**
 * The drain before the exit (O5): a stream with bytes still buffered is waited on, and a
 * writer that cannot say how much it holds — the `{ write }` a harness or a caller injects —
 * is not written to at all, since an empty write is only a way to ask a real stream to flush.
 */
import { describe, expect, it } from 'vitest';

import { detachedTeardown } from './shutdown.js';

describe('the flush phase', () => {
  it('writes nothing to a writer with no writableLength, and does not wait on it', async () => {
    const writes: string[] = [];
    await detachedTeardown([{ write: (chunk) => void writes.push(chunk) }]).run(0);
    expect(writes).toEqual([]);
  });

  it('waits on a stream that still holds bytes, until its empty write is flushed', async () => {
    let flush: (() => void) | undefined;
    const events: string[] = [];
    const stream = { writableLength: 12, write: (_chunk: string, callback?: () => void) => void (flush = callback) };
    const teardown = detachedTeardown([stream]);
    teardown.add(() => void events.push('release'));
    const done = teardown.run(0).then(() => events.push('done'));
    await new Promise((r) => setTimeout(r, 10));
    expect(events).toEqual([]);
    flush?.();
    await done;
    expect(events).toEqual(['release', 'done']);
  });

  it('does not wait on a stream that holds nothing', async () => {
    const writes: string[] = [];
    await detachedTeardown([{ writableLength: 0, write: (chunk) => void writes.push(chunk) }]).run(0);
    expect(writes).toEqual([]);
  });
});
