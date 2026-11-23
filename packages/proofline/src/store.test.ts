import { execFileSync } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { appendLines, branchOf, readLines, runnable, runShell, storeDir } from './store.js';

const scratch = scratchDirs();
const withoutGit = (): NodeJS.ProcessEnv => Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const temp = (): string => realpathSync(scratch('proofline-store-'));
const repo = (): string => {
  const dir = temp();
  execFileSync('git', ['init', '-q', '-b', 'feat/x', dir], { env: withoutGit() });
  return dir;
};

describe('branchOf', () => {
  it('names the branch checked out', async () => {
    expect(await branchOf(repo())).toBe('feat/x');
  });

  it('is HEAD outside a repository', async () => {
    expect(await branchOf(temp())).toBe('HEAD');
  });
});

describe('storeDir', () => {
  it('is proofline/ under the common git directory, from a subdirectory too', async () => {
    const dir = repo();
    mkdirSync(join(dir, 'sub'));
    expect(await storeDir(dir)).toBe(join(dir, '.git', 'proofline'));
    expect(await storeDir(join(dir, 'sub'))).toBe(join(dir, '.git', 'proofline'));
  });

  it('is .proofline/ under the root outside a repository', async () => {
    const dir = temp();
    expect(await storeDir(dir)).toBe(join(dir, '.proofline'));
  });
});

describe('readLines and appendLines', () => {
  it('appends JSON lines, making the directory, and reads them back skipping blank lines', () => {
    const file = join(temp(), 'a', 'b.jsonl');
    expect(readLines(file)).toEqual([]);
    appendLines(file, [{ a: 1 }, { b: 2 }]);
    appendLines(file, [{ c: 3 }]);
    writeFileSync(file, `${'\n'}  \n${JSON.stringify({ d: 4 })}\n`, {
      flag: 'a',
    });
    expect(readLines(file)).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }, { d: 4 }]);
  });
});

describe('runShell', () => {
  it('runs through the shell at the root, stdout then stderr, with the exit code', async () => {
    const dir = temp();
    const ran = await runShell(`node -e "console.log(process.cwd());console.error('err');process.exit(3)"`, dir, 10_000);
    expect(ran.exit).toBe(3);
    expect(ran.output).toMatch(new RegExp(`${basename(dir)}\n+err\n$`, 'u'));
  });

  it('passes the command to the shell alone', async () => {
    expect(await runShell('node -e "console.log(process.argv.length)"', temp(), 10_000)).toEqual({ exit: 0, output: '1\n' });
  });

  it('is exit 1 when the command is killed by its timeout', async () => {
    expect((await runShell('node -e "setTimeout(() => 0, 1500)"', temp(), 50)).exit).toBe(1);
  });
});

describe('runnable', () => {
  it('is true for a program that is not a file here, a directory, and a script', () => {
    const dir = temp();
    writeFileSync(join(dir, 'run.sh'), '#!/bin/sh\n');
    expect(runnable('npm test', dir)).toBe(true);
    expect(runnable('  run.sh --flag', dir)).toBe(true);
    mkdirSync(join(dir, 'tools'));
    expect(runnable('tools', dir)).toBe(true);
  });

  it('is false for a document named as the command', () => {
    const dir = temp();
    mkdirSync(join(dir, 'notes'));
    writeFileSync(join(dir, 'notes', 'one.md'), 'status: closed\n');
    expect(runnable('notes/one.md', dir)).toBe(false);
    expect(runnable('  notes/one.md  x', dir)).toBe(false);
  });
});
