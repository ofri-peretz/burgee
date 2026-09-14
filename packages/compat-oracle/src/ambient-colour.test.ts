/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The grade must not depend on whose shell produced it.
 *
 * `chalk` read 57/58 on one machine and 58/58 on another for a day, and PLAN 0.4 carried it
 * as a regression. It was neither: `level › disable colors if they are not supported` spawns
 * a child, the child inherited the operator's `FORCE_COLOR=1`, and the fixture emitted
 * colour. A pass rate this repository ratchets on and publishes in its README was reading
 * the laptop.
 *
 * This grades chalk with the polluting variables deliberately set. Reverting `neutralEnv()`
 * in `run.ts` takes it back to 57, which is the assertion's whole point.
 */
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

it('grades chalk the same under a shell that forces colour', () => {
  // `vitest-colour-setup.ts` puts `NO_COLOR=1` in this worker, and chalk gives NO_COLOR
  // precedence over FORCE_COLOR — inheriting it made the first version of this test pass
  // with the fix reverted, which is to say it tested nothing. Build the polluted shell, do
  // not merely add to this one.
  const { NO_COLOR: _drop, ...clean } = process.env;
  const out = execFileSync('npm', ['run', 'compat', '--silent', '--', 'chalk'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...clean, FORCE_COLOR: '1', COLORTERM: 'truecolor', TERM: 'xterm-256color' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  expect(out, 'the operator’s terminal is not an input to a published number').toContain('58 / 58');
}, 120_000);
