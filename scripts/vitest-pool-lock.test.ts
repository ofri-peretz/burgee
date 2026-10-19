/**
 * windows-lane-holds R3c — a test file that drives a real shell runs after the parallel pool,
 * one file at a time, never inside it.
 *
 * The same `pwsh` completion call took 13.7–59.7 s (median 22.0 s, n = 15) on the full
 * `windows-latest` cells of 2026-10-18, and 0.9–2.3 s (n = 22) on the lighter "published suites"
 * cells: same image, same pwsh, same script, different load. Its 120 s failures (#1092, #1094)
 * were the tail of that distribution. So `packages/burgee/vitest.config.ts` splits one run into
 * two groups, `pool` then `shells`, and this lock holds the split: the `shells` project exists,
 * runs after `pool` with file parallelism off, and lists every file that spawns a shell.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

const PACKAGE = fileURLToPath(new URL('../packages/burgee/', import.meta.url));

/** A test file that hands a shell's name to a spawn, directly or as a call's `file`. */
const SPAWNS_A_SHELL = /(?:spawn|exec)[A-Za-z]*\(\s*'(?:bash|zsh|fish|pwsh|sh)'|\bfile: '(?:bash|zsh|fish|pwsh|sh)'/;

/** Every `src/*.test.ts` of the package that spawns a shell, as the config spells a path. */
export function shellDriving(dir: string): string[] {
  return readdirSync(join(dir, 'src'))
    .filter((name) => name.endsWith('.test.ts'))
    .filter((name) => SPAWNS_A_SHELL.test(readFileSync(join(dir, 'src', name), 'utf8')))
    .map((name) => `src/${name}`)
    .sort();
}

interface Project {
  extends?: boolean;
  test?: { name?: string; include?: string[]; exclude?: string[]; fileParallelism?: boolean; sequence?: { groupOrder?: number } };
}

async function projects(): Promise<Project[]> {
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- importing is the assertion: the evaluated config is what vitest reads, and the path is a fixed file in this repo
  const mod = (await import(pathToFileURL(join(PACKAGE, 'vitest.config.ts')).href)) as { default: { test?: { projects?: Project[] } } };
  return mod.default.test?.projects ?? [];
}

describe('windows-lane-holds R3c — shell-driving files run outside the parallel pool', () => {
  it('finds the shell-driving files, so this cannot pass by reading nothing', () => {
    expect(shellDriving(PACKAGE)).toEqual(expect.arrayContaining(['src/completions-shells.test.ts', 'src/completions-dynamic.test.ts']));
  });

  it('R3 — shell-driving cases run outside the parallel pool', async () => {
    const all = await projects();
    const pool = all.find((p) => p.test?.name === 'pool');
    const shells = all.find((p) => p.test?.name === 'shells');
    expect(pool, 'packages/burgee/vitest.config.ts needs a `pool` project').toBeDefined();
    expect(shells, 'packages/burgee/vitest.config.ts needs a `shells` project').toBeDefined();
    // After the pool, never beside it, and one file at a time.
    expect(shells?.test?.sequence?.groupOrder ?? 0).toBeGreaterThan(pool?.test?.sequence?.groupOrder ?? 0);
    expect(shells?.test?.fileParallelism).toBe(false);
    // Every file that spawns a shell is in the `shells` group and out of the pool.
    const driving = shellDriving(PACKAGE);
    expect([...(shells?.test?.include ?? [])].sort(), 'a test file spawns a shell and is not in SHELL_DRIVING').toEqual(driving);
    expect(pool?.test?.exclude ?? []).toEqual(expect.arrayContaining(driving));
  });
});
