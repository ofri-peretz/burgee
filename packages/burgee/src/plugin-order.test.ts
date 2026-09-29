/**
 * `enforce` orders hooks — `'pre'`, then unordered, then `'post'` — whatever order the plugins
 * were registered in. Registered here in every position relative to one another, so the
 * comparator meets an unordered plugin on either side of it.
 */
import { describe, expect, it } from 'vitest';

import { Manifest } from './manifest.js';
import { definePlugin } from './plugin.js';

const hooked = (name: string, seen: string[], enforce?: 'pre' | 'post'): ReturnType<typeof definePlugin> =>
  definePlugin({ name, ...(enforce === undefined ? {} : { enforce }), hooks: { preRun: { handler: () => void seen.push(name) } } });

describe('hook order (enforce)', () => {
  it.each([
    [['pre', 'mid', 'post']],
    [['post', 'mid', 'pre']],
    [['mid', 'pre', 'post']],
    [['mid', 'post', 'pre']],
    [['pre', 'post', 'mid']],
  ])('fires pre, then unordered, then post, registered as %j', async (order) => {
    const seen: string[] = [];
    const m = new Manifest();
    for (const name of order) m.use(hooked(name, seen, name === 'mid' ? undefined : (name as 'pre' | 'post')));
    await m.fire('preRun', 'x', {});
    expect(seen).toEqual(['pre', 'mid', 'post']);
  });

  it('keeps registration order among unordered plugins', async () => {
    const seen: string[] = [];
    const m = new Manifest();
    for (const name of ['b', 'a', 'c']) m.use(hooked(name, seen));
    await m.fire('preRun', 'x', {});
    expect(seen).toEqual(['b', 'a', 'c']);
  });
});
