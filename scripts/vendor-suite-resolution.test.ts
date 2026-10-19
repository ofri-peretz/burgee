/**
 * R6 — a vendor run reads the checkout it is writing into (`vendor-resolves-its-own-tree`).
 *
 * `scripts/vendor-suite.ts` once imported its host registry by bare specifier, so Node walked
 * upward until it found a `node_modules/compat-oracle`. From a worktree with none of its own,
 * that walk **left the worktree** and landed in the parent checkout — and the run wrote into its
 * own `vendor/` while reading another tree's definition of what to vendor. It bit two lane agents
 * on 2026-09-17, independently, in one session. The registry is now imported by path
 * (`oracle-import-lock.test.ts` refuses a bare one).
 *
 * **Every case runs the real script from a directory with no `node_modules`**, because that is
 * the only place the bug is visible: a copy of the script and the oracle's sources, in a temp
 * tree, run through `tsx` reached by absolute path. A test that only runs in an installed
 * checkout cannot see this bug — which is exactly how it survived.
 *
 * The usage message lists every host the registry the run loaded declares, so which registry
 * was read is in the output.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TSX = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'vendor-resolution-')));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

/** A checkout with the script and the oracle's sources and nothing installed, at `<parent>/worktree`. */
function worktree(parent: string): string {
  const tree = join(parent, 'worktree');
  mkdirSync(join(tree, 'scripts'), { recursive: true });
  cpSync(join(REPO_ROOT, 'package.json'), join(tree, 'package.json'));
  cpSync(join(REPO_ROOT, 'scripts', 'vendor-suite.ts'), join(tree, 'scripts', 'vendor-suite.ts'));
  cpSync(join(REPO_ROOT, 'packages', 'compat-oracle', 'package.json'), join(tree, 'packages', 'compat-oracle', 'package.json'));
  cpSync(join(REPO_ROOT, 'packages', 'compat-oracle', 'src'), join(tree, 'packages', 'compat-oracle', 'src'), { recursive: true, filter: (from) => !from.endsWith('.test.ts') && !from.includes('__fixtures__') });
  return tree;
}

/** The parent checkout's installed `compat-oracle`, declaring one host the real registry does not. */
function decoy(parent: string): void {
  const at = join(parent, 'node_modules', 'compat-oracle');
  mkdirSync(at, { recursive: true });
  writeFileSync(join(at, 'package.json'), JSON.stringify({ name: 'compat-oracle', type: 'module', exports: { './hosts': './hosts.js' } }));
  writeFileSync(join(at, 'hosts.js'), "export const HOSTS = [{ name: 'decoy-host' }];\nexport const PREVIOUS_MAJORS = [];\nexport const hostNamed = () => undefined;\n");
}

/** `vendor-suite.ts` with no arguments, from inside the worktree: its usage message, and how it exited. */
function usage(tree: string): { status: number | null; stderr: string } {
  const env = { ...process.env, NODE_PATH: '' };
  const run = spawnSync(process.execPath, ['--import', TSX, join(tree, 'scripts', 'vendor-suite.ts')], { cwd: tree, encoding: 'utf8', env });
  return { status: run.status, stderr: run.stderr };
}

describe('vendor-suite reads the registry of the tree it writes to', () => {
  it('from a worktree with no node_modules inside a checkout that has a different compat-oracle installed', () => {
    const parent = mkdtempSync(join(scratch, 'parent-'));
    decoy(parent);
    const { status, stderr } = usage(worktree(parent));
    // The usage exit, with this tree's hosts listed: not a refusal, and not the parent's registry.
    expect(status).toBe(1);
    expect(stderr).toMatch(/^hosts: commander, /m);
    expect(stderr).toContain('yargs-17');
    expect(stderr).not.toContain('decoy-host');
  });

  it('from a tree with no node_modules anywhere above it', () => {
    const { status, stderr } = usage(worktree(mkdtempSync(join(scratch, 'bare-'))));
    expect(stderr).not.toMatch(/Cannot find (module|package)/);
    expect(status).toBe(1);
    expect(stderr).toMatch(/^hosts: commander, /m);
  });
});
