/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Scratch directories a test file makes under the OS's temporary directory, and their removal.
 *
 * Why. Suites that called `mkdtempSync` and never removed what it made left ~102k entries in the
 * macOS `$TMPDIR` (2026-10-19: `release-window-root-*` alone 28.7k, `deploy-lock-*` 17.9k), and on
 * a machine whose endpoint security scans each new file, every leaked entry slows everything else.
 *
 * How. `scratchDirs()` at a test file's top level registers one `afterAll` that hands every
 * directory the file made to a single `rm` of its own that the hook does not wait for — the
 * pattern of #1137: under the pre-push load, unlinking a scratch directory from Node took 64.9 s
 * and 152 s, past the hook's timeout. A run killed first leaves its directories behind.
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
    if (made.length > 0) spawn('rm', ['-rf', ...made], { detached: true, stdio: 'ignore' }).unref();
  });
  return (prefix) => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    made.push(dir);
    return dir;
  };
}
