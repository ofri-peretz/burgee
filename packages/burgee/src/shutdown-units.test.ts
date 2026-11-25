/**
 * `shutdown.ts` piece by piece: what the flush writes, what each handler is called, and the
 * code a run hands its handlers. `shutdown.test.ts` holds the composition end to end; these are
 * the parts a whole run cannot tell apart.
 */
import { describe, expect, it } from 'vitest';

import { detachedTeardown, type Drainable } from './shutdown.js';

/** A stream with bytes in it that come out a tick after somebody asks, recording what was written. */
function backedUp(): Drainable & { readonly chunks: string[] } {
  const chunks: string[] = [];
  const self = {
    writableLength: 8,
    chunks,
    write(chunk: string, callback?: () => void): boolean {
      chunks.push(chunk);
      setTimeout(() => {
        self.writableLength = 0;
        callback?.();
      }, 0);
      return false;
    },
  };
  return self;
}

/** A handler that never returns, so the report names it. */
const hangs = (): Promise<void> => new Promise<void>(() => undefined);

/** The same, under a name of its own. */
async function releaseTheLock(): Promise<void> {
  await hangs();
}

describe('detachedTeardown', () => {
  it('waits for a backed-up stream with an empty write, adding nothing to it', async () => {
    const stream = backedUp();
    const teardown = detachedTeardown([stream]);
    await teardown.run(0);
    expect(stream.chunks).toEqual(['']);
    expect(teardown.registry.report?.timedOut).toBe(false);
  });

  it('runs with the code the run leaves with, and no signal', async () => {
    const teardown = detachedTeardown();
    await teardown.run(3);
    expect(teardown.registry.report).toMatchObject({ code: 3, signal: null });
  });

  it('names the flush burgee:flush, a labelled handler by its label, and any other by its name', () => {
    const teardown = detachedTeardown([backedUp()]);
    teardown.add(hangs, 'the lock');
    teardown.add(releaseTheLock);
    expect(teardown.registry.count('flush')).toBe(1);
    expect(teardown.registry.count('release')).toBe(2);
    expect(teardown.registry.runSync({ code: 0, signal: null }).unfinished).toEqual(['burgee:flush', 'the lock', 'releaseTheLock']);
  });
});
