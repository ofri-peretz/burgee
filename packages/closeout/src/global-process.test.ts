/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The entry point in the README, called the way the README calls it.
 *
 * Every other test in this package injects a process, which is right — that is the seam the
 * design asks for. It also meant 39 green tests over an export that threw
 * `ReferenceError: globalProcess is not defined` for anyone who took the documented path,
 * in a version already on npm. A suite that never calls a function the way a user calls it
 * cannot fail for the reason the package is broken.
 */
import { afterEach, expect, it } from 'vitest';

import { onExit } from './index.js';

const undo: (() => void)[] = [];
afterEach(() => {
  for (const f of undo.splice(0)) f();
});

it('registers against the real process when none is injected', () => {
  const off = onExit(() => {});
  undo.push(off);
  expect(typeof off).toBe('function');
});
