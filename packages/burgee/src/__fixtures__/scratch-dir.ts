/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Scratch directories a test file makes under the OS's temporary directory, and their removal.
 *
 * The package's copy of the root's `scripts/scratch-dir.ts` (#1144), which `rootDir: src` keeps
 * this package from importing; read that file for the why. `scratchDirs()` at a test file's top
 * level registers one `afterAll` that hands every directory the file made to a single `rm` of its
 * own that the hook does not wait for — under the pre-push load an unlink from Node took 64.9 s
 * (#1137). Not on Windows, whose CI runners are thrown away and have no `rm` to spawn.
 *
 * Test scaffolding: `__fixtures__` is outside coverage, mutation and the build.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll } from 'vitest';

/** Returns a `mkdtempSync` under `tmpdir()` whose directories are removed after the file's last test. */
export function scratchDirs(): (prefix: string) => string {
  const made: string[] = [];
  afterAll(() => {
    if (made.length > 0 && process.platform !== 'win32') spawn('rm', ['-rf', ...made], { detached: true, stdio: 'ignore' }).unref();
  });
  return (prefix) => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    made.push(dir);
    return dir;
  };
}
