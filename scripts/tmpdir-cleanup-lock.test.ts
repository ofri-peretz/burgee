/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a test that makes a temporary directory removes it.
 *
 * Suites that called `mkdtempSync` and never removed what it made left ~102k entries in the
 * macOS `$TMPDIR` by 2026-10-19 (#1144 fixed the root's, the packages' followed), and on a
 * machine whose endpoint security scans each new file every leaked entry slows everything else.
 *
 * Presence, not proof: a test file that calls `mkdtemp` has to name some way of removing it —
 * `scratchDirs()` (`scripts/scratch-dir.ts`, its copy in `benchmarks/` and each package's
 * `src/__fixtures__/scratch-dir.ts`), an `rm`/`rmSync`, or a helper such as `discard`. What it
 * catches is the shape every one of those leaks had: a `mkdtemp` and no cleanup at all.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tracked = (...patterns: string[]): string[] =>
  execFileSync('git', ['ls-files', '-z', '--', ...patterns], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);

const MAKES = /\bmkdtemp(?:Sync)?\(/;
const REMOVES = /\bscratchDirs\(|\brmSync\(|\brm\(|spawn\(\s*'rm'|\bdiscard\(/;

describe('temporary directories made by tests are removed', () => {
  it('every test file that calls mkdtemp names a cleanup', () => {
    const files = tracked('*.test.ts', '*.test.mts', '*.test.mjs');
    const makers = files.filter((file) => MAKES.test(readFileSync(resolve(ROOT, file), 'utf8')));
    expect(makers.length, 'the scan found the files it is about').toBeGreaterThan(50);
    const leaking = makers.filter((file) => !REMOVES.test(readFileSync(resolve(ROOT, file), 'utf8')));
    expect(leaking, 'use scratchDirs() from scratch-dir.ts (a package has its own in src/__fixtures__/)').toEqual([]);
  });

  it('each package’s copy of scratch-dir.ts is the same file', () => {
    const copies = tracked('packages/*/src/__fixtures__/scratch-dir.ts');
    expect(copies.length).toBeGreaterThan(0);
    const bodies = new Set(copies.map((file) => readFileSync(resolve(ROOT, file), 'utf8')));
    expect(bodies.size, copies.join(', ')).toBe(1);
  });
});
