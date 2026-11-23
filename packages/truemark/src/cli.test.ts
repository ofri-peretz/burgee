import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { createProgram } from './cli.js';
import type { Git } from './git.js';

const WEAKENED = `+++ b/src/a.test.ts
@@ -3 +3 @@
-expect(total).toBe(3);
+expect(total).toBeTruthy();
`;

/** A git that answers from a table, keyed by the argument that tells the three calls apart. */
function fakeGit(answers: Record<string, string>): Git & { calls: string[][] } {
  const calls: string[][] = [];
  const git = (async (args: readonly string[]) => {
    calls.push([...args]);
    return answers[args[0] === 'log' ? 'log' : (args[1] ?? '')] ?? '';
  }) as Git & { calls: string[][] };
  git.calls = calls;
  return git;
}

/** A git that refuses every call, as it does for a ref the checkout does not have. */
const failingGit: Git = async () => {
  throw new Error('bad revision');
};

describe('truemark diff', () => {
  // burgee's first run loads its renderers lazily; paying that here keeps each case fast.
  beforeAll(async () => {
    await runBurgee(createProgram(fakeGit({})), { argv: ['--version'] });
  });

  it('diffs against the merge base of origin/main and reads the range’s commit messages', async () => {
    const git = fakeGit({});
    await runBurgee(createProgram(git), { argv: ['diff'] });
    expect(git.calls).toEqual([
      ['diff', '--unified=0', '--no-color', '--no-ext-diff', 'origin/main...HEAD'],
      ['diff', '--name-only', '--diff-filter=d', 'origin/main...HEAD'],
      ['log', '--format=%B', 'origin/main..HEAD'],
    ]);
  });

  it('prints each finding as path:line and exits 1', async () => {
    const git = fakeGit({ '--unified=0': WEAKENED, '--name-only': 'src/a.test.ts\nsrc/__snapshots__/a.snap\n', log: 'fix: x\n' });
    const r = await runBurgee(createProgram(git), { argv: ['diff'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    const lines = r.stdout.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^src\/a\.test\.ts:3 weakened-assertion /);
    expect(lines[1]).toMatch(/^src\/__snapshots__\/a\.snap:1 unexplained-snapshot /);
  });

  it('carries the findings in the --json envelope', async () => {
    const git = fakeGit({ '--unified=0': WEAKENED, log: '' });
    const r = await runBurgee(createProgram(git), { argv: ['diff', '--base', 'main', '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(JSON.stringify(r.json)).toContain('"check":"weakened-assertion"');
    expect(JSON.stringify(r.json)).toContain('"base":"main"');
  });

  it('exits 0 and says so on a clean range', async () => {
    const r = await runBurgee(createProgram(fakeGit({})), { argv: ['diff', '--base', 'main'] });
    expect(r.code).toBe(ExitCode.OK);
    expect(r.stdout).toContain('no findings since main');
  });

  it('exits with the usage code and a fix line when git cannot compare', async () => {
    const r = await runBurgee(createProgram(failingGit), { argv: ['diff', '--base', 'nope'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('could not compare against nope');
    expect(r.stderr).toContain('fetch nope first');
  });
});
