import { describe, expect, it } from 'vitest';

import { git } from './git.js';

describe('git', () => {
  it('returns what git writes to stdout', async () => {
    expect(await git(['--version'])).toMatch(/^git version/);
  });

  it('rejects with git’s own words when git says no', async () => {
    await expect(git(['no-such-command'])).rejects.toThrow(/git no-such-command failed: .*not a git command/);
  });
});
