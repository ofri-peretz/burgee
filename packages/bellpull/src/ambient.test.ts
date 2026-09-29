/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `ambientRuntime()` where the ambient world says less than node's does.
 *
 * The file's header promises a truthful "I know nothing" rather than a `ReferenceError` when
 * there is no `process`, and `undefined` ownership where the platform has no uid — which is
 * what tells `executable.ts` to skip that half of the check on Windows. `ambient.ts` reads the
 * global on every call, so each case swaps it for the length of one synchronous call.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ambientRuntime } from './ambient.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** `ambientRuntime()` with `globalThis.process` replaced for exactly that call. */
function under(stand: unknown): ReturnType<typeof ambientRuntime> {
  vi.stubGlobal('process', stand);
  try {
    return ambientRuntime();
  } finally {
    vi.unstubAllGlobals();
  }
}

describe('ambientRuntime', () => {
  it('reads this process when there is one', () => {
    expect(ambientRuntime()).toEqual({ platform: process.platform, env: process.env, cwd: process.cwd(), uid: process.getuid?.(), gid: process.getgid?.() });
  });

  it('admits it knows nothing when there is no process — a worker, a browser bundle', () => {
    expect(under(undefined)).toEqual({ platform: '', env: {}, cwd: '.', uid: undefined, gid: undefined });
  });

  it('treats a `process` that is not an object as no process — even one carrying the right fields', () => {
    const impostor = Object.assign(() => undefined, { platform: 'win32', env: { PATH: 'C:\\evil' }, cwd: () => 'C:\\' });
    expect(under(impostor)).toEqual({ platform: '', env: {}, cwd: '.', uid: undefined, gid: undefined });
    expect(under(null)).toEqual({ platform: '', env: {}, cwd: '.', uid: undefined, gid: undefined });
    expect(under('win32')).toEqual({ platform: '', env: {}, cwd: '.', uid: undefined, gid: undefined });
  });

  it('leaves ownership undefined where the platform has no getuid, as Windows does not', () => {
    const windows = { platform: 'win32', env: { Path: 'C:\\tools' }, cwd: () => 'C:\\work' };
    expect(under(windows)).toEqual({ platform: 'win32', env: { Path: 'C:\\tools' }, cwd: 'C:\\work', uid: undefined, gid: undefined });
  });

  it('reads the ownership a POSIX process reports', () => {
    expect(under({ platform: 'linux', env: {}, cwd: () => '/w', getuid: () => 1000, getgid: () => 100 })).toEqual({ platform: 'linux', env: {}, cwd: '/w', uid: 1000, gid: 100 });
  });

  it('does not take a field that is there but the wrong shape', () => {
    expect(under({ platform: 32, cwd: '/not-a-function', getuid: 0, getgid: 0 })).toEqual({ platform: '', env: {}, cwd: '.', uid: undefined, gid: undefined });
  });
});
