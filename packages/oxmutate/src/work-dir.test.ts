import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { removeWorkDir } from './work-dir.js';

// A run of compat-oracle finished after an hour and reported only "ENOTEMPTY, Directory not empty":
// removing the work directory threw out of the coordinator's `finally` and replaced the result.
describe('removing a run’s work directory', () => {
  it('removes it, files and all, and says nothing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'oxmutate-work-'));
    writeFileSync(path.join(dir, 'beat-1'), '1');
    expect(removeWorkDir(dir)).toBeUndefined();
    expect(existsSync(dir)).toBe(false);
  });

  it('says so and does not throw when the directory cannot be removed', () => {
    const message = removeWorkDir('/tmp/oxmutate-x', () => {
      throw new Error("ENOTEMPTY, Directory not empty: '/tmp/oxmutate-x'");
    });
    expect(message).toBe("oxmutate: the work directory /tmp/oxmutate-x could not be removed (ENOTEMPTY, Directory not empty: '/tmp/oxmutate-x'). The run's results are not affected. fix: remove it by hand\n");
  });

  it('reports a failure that is not an Error as it was thrown', () => {
    expect(
      removeWorkDir('/tmp/oxmutate-y', () => {
        throw 'busy';
      }),
    ).toContain('could not be removed (busy)');
  });

  it('tries again while the directory is busy, and removes everything under it', () => {
    let seen: unknown;
    removeWorkDir('/tmp/oxmutate-z', (_, options) => {
      seen = options;
    });
    expect(seen).toEqual({ recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
});
