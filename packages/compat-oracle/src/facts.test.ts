/**
 * Telling a *citation* from a *mention* — the derived half of R6.
 *
 * Every case here is a real line from this repo. The line-level rule the declaration lock
 * uses ("a figure somewhere on a line that names the competitor") is right for asking "is
 * this competitor watched at all" and too loose for building a checklist: applied to
 * commander it produced twelve items from `burgee/src/weight.test.ts`, three of them claims
 * about commander and the rest our own budgets that happened to name it.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { citationsFor } from './facts.js';

function packageWith(weightTest: string): { dir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'facts-'));
  const dir = join(root, 'packages', 'burgee');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'weight.test.ts'), weightTest);
  return { dir, root };
}

const linesOf = (source: string, name: string): number[] => {
  const { dir, root } = packageWith(source);
  return citationsFor(dir, root, name).map((c) => c.line ?? 0);
};

describe('a figure beside the competitor is a citation', () => {
  it('catches a byte figure attached to the name', () => {
    expect(linesOf("// against commander's 126 KB lib/.\n", 'commander')).toEqual([1]);
  });

  it('catches the name attached to a figure the other way round', () => {
    expect(linesOf('// 12 KB against commander 232 KB installed.\n', 'commander')).toEqual([1]);
  });

  it('catches a version', () => {
    expect(linesOf('// the front-end is commander 15, ported method for method\n', 'commander')).toEqual([1]);
  });
});

describe('a figure elsewhere on the line is not', () => {
  it('ignores our own budget that merely names the competitor far away', () => {
    // Real line: the 32,000 is burgee's own budget, and `commander-env` is our intent.
    const line = '// Raised from 32,000 on 2026-09-08 for the V family (commander-env): precedence, its\n';
    expect(linesOf(line, 'commander')).toEqual([]);
  });

  it('ignores a longer hyphenated name that merely starts with the competitor', () => {
    expect(linesOf('// commander-schema adds 5,000 B of validation\n', 'commander')).toEqual([]);
  });

  it('ignores our own subpath, which is a slash away from the name', () => {
    expect(linesOf("// roundel/chalk is a further 9,311 B\n", 'chalk')).toEqual([]);
  });

  it('ignores prose with no figure at all', () => {
    expect(linesOf('// chalk and ora disagree about the same terminal\n', 'chalk')).toEqual([]);
  });
});

describe('what it reports', () => {
  it('gives a POSIX path whatever the platform separator is', () => {
    // These paths are rendered into a GitHub issue as checklist items and citations. On a
    // Windows runner `relative()` returns `packages\\burgee\\src\\weight.test.ts`, which is
    // not a path GitHub links and not what the repo calls the file.
    const { dir, root } = packageWith('  // ora 9.4.1 is 113,577 B\n');
    const [citation] = citationsFor(dir, root, 'ora');
    expect(citation?.file).not.toContain('\\');
    expect(citation?.file).toBe('packages/burgee/src/weight.test.ts');
  });

  it('gives a repo-relative path, the line number, and the text as written', () => {
    const { dir, root } = packageWith("  // ora 9.4.1 is 113,577 B across seventeen packages\n");
    expect(citationsFor(dir, root, 'ora')).toEqual([
      { file: 'packages/burgee/src/weight.test.ts', line: 1, text: 'ora 9.4.1 is 113,577 B across seventeen packages' },
    ]);
  });
});
