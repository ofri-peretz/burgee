import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ExitCode } from 'burgee';
import { runBurgee } from 'burgee/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';

import type { Machine } from './budget.js';
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

describe('truepass diff', () => {
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

  it('names the default base once in --help', async () => {
    const r = await runBurgee(createProgram(fakeGit({})), { argv: ['diff', '--help'] });
    expect(r.stdout.match(/origin\/main\)/g)).toEqual(['origin/main)']);
    expect(r.stdout).toContain('(default: origin/main)');
  });

  it('quotes the first git command that fails, however fast the later ones fail', async () => {
    // The range diff fails slowest and the log fastest: run together, the log's error would win.
    const calls: string[] = [];
    const slowFirst: Git = async (args) => {
      const command = `git ${args.join(' ')}`;
      calls.push(command);
      if (args[1] === '--unified=0') await new Promise((next) => setImmediate(next));
      throw new Error(`${command} failed: bad revision`);
    };
    const r = await runBurgee(createProgram(slowFirst), { argv: ['diff', '--base', 'nope'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('git diff --unified=0 --no-color --no-ext-diff nope...HEAD failed');
    expect(r.stderr).not.toContain('git log');
    expect(calls).toHaveLength(1);
  });

  it('exits with the usage code and a fix line when git cannot compare', async () => {
    const r = await runBurgee(createProgram(failingGit), { argv: ['diff', '--base', 'nope'] });
    expect(r.code).toBe(ExitCode.USAGE);
    expect(r.stderr).toContain('could not compare against nope');
    expect(r.stderr).toContain('fetch nope first');
  });
});

const scratch = scratchDirs();

/** A machine whose every alone reading is `alone`. */
const machine = (alone: number, env: NodeJS.ProcessEnv = { CI: 'true' }): Machine => ({ env, measure: async () => alone, overloaded: () => false, now: () => 0, write: () => undefined, cores: 1 });

/** A directory holding one candidate, as a deferred run leaves it. */
function deferred(budget?: number): string {
  const dir = scratch('truepass-cli-budget-');
  writeFileSync(join(dir, '1.json'), JSON.stringify([{ file: 'src/a.test.ts', path: '/r/src/a.test.ts', name: 's > slow', title: 'slow', duration: 6000, cwd: '/r', config: undefined, budget }]));
  return dir;
}

describe('truepass budget', () => {
  it('passes when every candidate is fast alone, and empties the directory', async () => {
    const dir = deferred();
    const r = await runBurgee(createProgram(fakeGit({}), machine(10)), { argv: ['budget', dir] });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('no test case over the 5000 ms budget (1 re-measured alone)');
    expect(existsSync(dir)).toBe(false);
  });

  it('exits 1 when a candidate is still over the budget alone', async () => {
    const r = await runBurgee(createProgram(fakeGit({}), machine(9000)), { argv: ['budget', deferred(), '--json'] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(JSON.stringify(r.json)).toContain('"passed":false');
  });

  it('passes a battery that left no candidates', async () => {
    const r = await runBurgee(createProgram(fakeGit({}), machine(9000)), { argv: ['budget', join(tmpdir(), 'truepass-budget-no-battery')] });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('(0 re-measured alone)');
  });

  it('judges by the budget the run held the cases to', async () => {
    const r = await runBurgee(createProgram(fakeGit({}), machine(1500)), { argv: ['budget', deferred(1000)] });
    expect(r.code).toBe(ExitCode.RUNTIME);
    expect(r.stdout).toContain('over the 1000 ms budget');
  });

  it('passes with the gate off, measuring nothing', async () => {
    const r = await runBurgee(createProgram(fakeGit({}), machine(9000, { TRUEPASS_BUDGET_MS: '0' })), { argv: ['budget', deferred()] });
    expect(r.code).toBe(0);
  });
});
