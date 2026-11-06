/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The three questions every other module asks a `Runtime`: is this Windows, which key holds
 * `PATH`, and what does it say. Pure functions of their argument, so every platform's answer
 * is asked for here, on whatever machine this runs on.
 */
import { describe, expect, it } from 'vitest';

import { isWindows, pathKey, pathOf, type Runtime } from './runtime.js';

const on = (platform: string, env: Record<string, string | undefined> = {}): Runtime => ({ platform, env, cwd: '/w' });

describe('isWindows', () => {
  it.each([
    ['win32', {}, true],
    ['linux', {}, false],
    // Cygwin and msys run on Windows and say so in OSTYPE, whatever `platform` they report.
    ['linux', { OSTYPE: 'cygwin' }, true],
    ['linux', { OSTYPE: 'msys' }, true],
    ['linux', { OSTYPE: 'linux-gnu' }, false],
  ])('%s with %j is %s', (platform, env, expected) => {
    expect(isWindows(on(platform, env))).toBe(expected);
  });
});

describe('pathKey — whichever spelling of PATH this environment uses', () => {
  it('is always `PATH` off Windows, even when the environment spells it otherwise', () => {
    expect(pathKey(on('linux', { Path: '/opt/bin' }))).toBe('PATH');
    expect(pathOf(on('linux', { Path: '/opt/bin' }))).toBe('');
  });

  it('takes the last spelling on Windows, where a later key overrides an earlier one', () => {
    expect(pathKey(on('win32', { PATH: 'C:\\a', Path: 'C:\\b' }))).toBe('Path');
    expect(pathOf(on('win32', { PATH: 'C:\\a', Path: 'C:\\b' }))).toBe('C:\\b');
  });

  it('is `Path`, Windows’ own spelling, when the environment has none', () => {
    expect(pathKey(on('win32'))).toBe('Path');
    expect(pathOf(on('win32'))).toBe('');
  });
});
