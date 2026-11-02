/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `discard()` for the docs apps' tests: a copy of the one in the root's `scripts/scratch-dir.ts`,
 * read there for the why. A hook or a `finally` that removes a tree renames it away and hands it
 * to an `rm` of its own that nobody waits for, because under the pre-push load an unlink from Node
 * took past the hook's 60 s (#1137; `scripts/test-cleanup-delete-lock.test.ts` holds every test
 * file to it). Test scaffolding, exported as `docs-chassis/scratch-dir`; no site module imports it.
 */
import { spawn } from 'node:child_process';
import { renameSync, rm, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

let discarded = 0;

/** Moves `path` out of the way and returns where it went, or `undefined` when there was nothing to move. */
function aside(path: string): string | undefined {
  const name = `burgee-discard-${String(process.pid)}-${String(discarded++)}`;
  // The OS's temporary directory first, so nothing is left beside the original for a later read
  // of its parent to find; beside it when the two are on different volumes (`EXDEV`).
  for (const trash of [join(tmpdir(), name), join(dirname(path), `.${name}`)]) {
    try {
      renameSync(path, trash);
      return trash;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return undefined;
      if (code !== 'EXDEV') break;
    }
  }
  // A rename the OS refused (a Windows handle still open): the slow way, which still keeps the promise.
  rmSync(path, { recursive: true, force: true });
  return undefined;
}

/**
 * Removes each path, file or tree, without waiting for its files to be unlinked.
 *
 * Each is renamed away first — one syscall, so the path is gone when this returns and a test that
 * makes the same path again next cannot meet the old tree — and the renamed trees go to one
 * detached `rm -rf` that this process does not wait for. On Windows, which has no `rm` to spawn,
 * to `fs.rm` with a callback nobody awaits. A path that does not exist is not an error, as with
 * `rmSync`'s `force`. A run killed first leaves `burgee-discard-*` under the temporary directory.
 */
export function discard(...paths: readonly string[]): void {
  const moved = paths.flatMap((path) => aside(path) ?? []);
  if (moved.length === 0) return;
  if (process.platform !== 'win32') spawn('rm', ['-rf', ...moved], { detached: true, stdio: 'ignore' }).unref();
  else for (const at of moved) rm(at, { recursive: true, force: true }, () => undefined);
}
