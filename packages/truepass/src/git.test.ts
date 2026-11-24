import { describe, expect, it } from 'vitest';

import { git } from './git.js';

describe('git', () => {
  it('returns what git writes to stdout', async () => {
    expect(await git(['--version'])).toMatch(/^git version/);
  });

  it('rejects with git’s own words when git says no', async () => {
    const error = await git(['no-such-command', 'x']).catch((e: unknown) => e as Error);
    expect((error as Error).message).toMatch(/^git no-such-command x failed: git: .*not a git command/);
    // git's stderr ends in a newline; the message does not.
    expect((error as Error).message).not.toMatch(/\s$/);
  });
});
