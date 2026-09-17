/**
 * R6 — a vendor run reads the checkout it is writing into.
 *
 * `scripts/vendor-suite.ts` imports its host registry by bare specifier, so Node walks upward
 * from the module's directory until it finds a `node_modules/compat-oracle`. From a worktree
 * with none of its own, that walk **leaves the worktree** and lands in the parent checkout —
 * and the run then writes into its own `vendor/` while reading another tree's definition of
 * what to vendor. The output looks entirely normal.
 *
 * It bit two lane agents on 2026-09-17, independently, in one session; one had written two
 * wrong manifests before noticing. Both found it by accident.
 *
 * **The case that matters runs from a directory with no `node_modules`.** A test that only
 * runs in a fully installed checkout cannot see this bug — which is exactly how it survived.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { checkResolvedTree } from './vendor-suite.js';

const REPO_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

describe('vendor-suite refuses to read one tree and write another', () => {
  it('accepts a registry resolved inside its own repository', () => {
    expect(() => checkResolvedTree(join(REPO_ROOT, 'packages/compat-oracle/dist/hosts.js'), REPO_ROOT)).not.toThrow();
  });

  it('accepts a `file:` URL, which is what a resolver returns', () => {
    expect(() => checkResolvedTree(`file://${join(REPO_ROOT, 'packages/compat-oracle/dist/hosts.js')}`, REPO_ROOT)).not.toThrow();
  });

  /**
   * The reproduction. A worktree lives *inside* the parent checkout, so the wrong resolution
   * is not some unrelated path — it is a sibling that differs only in prefix, which is why it
   * is invisible in a log. Both absolute paths must appear in the message for the reader to
   * see which two trees disagreed.
   */
  it('refuses a registry resolved out of a different checkout, and names both trees', () => {
    const worktree = join(REPO_ROOT, '.claude/worktrees/agent-example');
    let message = '';
    try {
      checkResolvedTree(join(REPO_ROOT, 'packages/compat-oracle/dist/hosts.js'), worktree);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message, 'names the tree it would write into').toContain(worktree);
    expect(message, 'and the tree it read from').toContain(REPO_ROOT);
    expect(message, 'and the remedy').toMatch(/npm ci/);
  });

  it('is not fooled by a sibling whose path merely starts with the same characters', () => {
    const root = mkdtempSync(join(tmpdir(), 'vendor-root-'));
    try {
      // `<root>-other` shares a prefix with `<root>` and is a different directory. A naive
      // `startsWith(root)` accepts it; the separator is what makes the check a path check.
      expect(() => checkResolvedTree(join(`${root}-other`, 'hosts.js'), root)).toThrow(/different checkout/);
      expect(() => checkResolvedTree(join(root, 'hosts.js'), root)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
