/**
 * The guard that fails a package's test run when a test writes into `dist/`
 * (`vitest-dist-guard.ts`, burgee's `globalSetup`). Red on a run that adds, removes or rewrites
 * a file there; silent on one that only reads it.
 */
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { changes, listing, refusal, setup } from '../vitest-dist-guard.js';

import { scratchDirs } from './scratch-dir.js';

const scratchDir = scratchDirs();

/** A package root with a built `dist/` holding two files, one nested. */
function built(): string {
  const root = scratchDir('dist-guard-');
  mkdirSync(join(root, 'dist', 'commander'), { recursive: true });
  writeFileSync(join(root, 'dist', 'index.js'), 'export {};\n');
  writeFileSync(join(root, 'dist', 'commander', 'command.js'), 'export {};\n');
  return root;
}

describe('a test run leaves dist/ as the build left it', () => {
  it('lists every file, nested ones included, by a path that reads the same on Windows', () => {
    expect([...listing(join(built(), 'dist')).keys()].toSorted()).toEqual(['commander/command.js', 'index.js']);
  });

  it('lists nothing for a package that has not been built, rather than throwing', () => {
    expect(listing(join(scratchDir('dist-guard-'), 'dist')).size).toBe(0);
  });

  it('lists files only: a directory is not a file a test wrote', () => {
    const root = built();
    mkdirSync(join(root, 'dist', 'empty'));
    expect([...listing(join(root, 'dist')).keys()]).not.toContain('empty');
  });

  it('names a file added, a file removed and a file rewritten, sorted by path', () => {
    const root = built();
    const before = listing(join(root, 'dist'));
    writeFileSync(join(root, 'dist', 'a-stray.js'), '');
    rmSync(join(root, 'dist', 'commander', 'command.js'));
    writeFileSync(join(root, 'dist', 'index.js'), 'export const x = 1;\n');
    expect(changes(before, listing(join(root, 'dist')))).toEqual(['+ a-stray.js', '- commander/command.js', '~ index.js']);
  });

  it('sees a rewrite that keeps the size, by its modification time', () => {
    const root = built();
    const file = join(root, 'dist', 'index.js');
    const before = listing(join(root, 'dist'));
    utimesSync(file, new Date(0), new Date(0));
    expect(changes(before, listing(join(root, 'dist')))).toEqual(['~ index.js']);
  });

  it('says nothing about a run that only read dist/', () => {
    const root = built();
    const before = listing(join(root, 'dist'));
    expect(changes(before, listing(join(root, 'dist')))).toEqual([]);
  });

  it('refuses in words that name the directory, the count and each file', () => {
    expect(refusal(join(process.cwd(), 'packages/burgee/dist'), ['+ a.js'])).toBe(
      'the test run changed packages/burgee/dist (1 file) — a test wrote into the build output. Point it at a scratch directory (scripts/scratch-dir.ts):\n  + a.js',
    );
    expect(refusal(process.cwd(), ['+ a.js', '- b.js'])).toContain(`${process.cwd().replaceAll('\\', '/')} (2 files)`);
    // A Windows path prints with `/`, as the weight lock's walk does since #1152.
    expect(refusal('packages\\burgee\\dist', ['+ a.js'])).toContain('changed packages/burgee/dist (1 file)');
  });

  it('as a globalSetup, passes a run that wrote nothing and fails one that wrote a stray, naming it', () => {
    const root = built();
    setup({ config: { root } })();
    const teardown = setup({ config: { root } });
    writeFileSync(join(root, 'dist', 'stray.d.ts'), '');
    expect(teardown).toThrow(/a test wrote into the build output[\s\S]*\+ stray\.d\.ts/);
  });

  it('reads the project root vitest hands it, and the working directory when it hands none', () => {
    const root = built();
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const teardown = setup();
      writeFileSync(join(root, 'dist', 'stray.js'), '');
      expect(teardown).toThrow(/\+ stray\.js/);
    } finally {
      process.chdir(cwd);
    }
  });
});
