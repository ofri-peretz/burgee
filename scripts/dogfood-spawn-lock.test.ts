/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * bellpull criterion 4 — the family's own tooling spawns through bellpull.
 *
 * `.sdlc/intents/bellpull/intent.md` names its only internal users honestly as dogfooding:
 * `compat-oracle` spawns to grade and `cli-benchmarks` spawns at least thirty times a row. The
 * criterion is that both spawn through the package, "their suites unchanged". Until this lock the
 * claim had one call site behind it (`benchmarks/axes/weight.ts`'s `npm pack`) while fourteen files
 * imported `node:child_process` directly, and the umbrella sweep of 2026-10-26 found that by
 * reading, not by a check.
 *
 * `inline-implementation-lock.test.ts` already holds `packages/*\/src` to "spawning is
 * bellpull's job", with a `KNOWN` list that may only shrink. It does not read `benchmarks/`, which
 * is not under `packages/`, and it skips `__fixtures__`. This lock is the narrower, stricter
 * statement for the two dogfooding consumers: **no** non-test module in either imports
 * `node:child_process`, in any spelling, with no allow-list to sit in.
 *
 * **What it leaves out, and why.**
 *
 *   - Test files (`*.test.ts`). The criterion is about the tooling. A test that spawns a stub, a
 *     git fixture or the built bin is the harness around the tool, and several of them spawn
 *     with `node:child_process` precisely to be independent of the thing they test.
 *   - `benchmarks/fixtures/`. Those are the measured subjects, not the harness: a fixture is a
 *     program the benchmark runs and times, and a raw-spawn floor is a legitimate thing to time.
 *   - `__fixtures__`: test scaffolding, outside the build, coverage and mutation. Its
 *     `scratch-dir.ts` must stay byte-identical to every other package's copy
 *     (`tmpdir-cleanup-lock.test.ts`), so it cannot move alone.
 *   - Dot-directories, `node_modules`, `results` and `dist`: generated, never authored here.
 *
 * `benchmarks/scratch-dir.ts`, the benchmarks' own copy of the root's, is *in* scope: nothing
 * holds it to another file, and it spawns.
 *
 * Comments are stripped before matching, and string literals are kept: `hosts.ts` quotes an
 * `import … from 'node:child_process'` inside a doc comment, and that is prose, not an import.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The two consumers the intent names, as repository-relative directories. */
const SCANNED = ['packages/compat-oracle/src', 'benchmarks'];

/** Directories never read: generated output, installed trees, test fixtures, and the benchmarks' measured subjects. */
const SKIPPED = new Set(['node_modules', 'results', 'dist', '__fixtures__']);
const SUBJECTS = 'benchmarks/fixtures';

/** Every way a module can reach `child_process`: static, side-effect, re-export, `import()` and `require()`. */
const IMPORTS_CHILD_PROCESS = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"`](?:node:)?child_process['"`]/;

/** Comments removed, string literals kept — the same reading `inline-implementation-lock` uses. */
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Repository-relative with forward slashes, so a name compares equal on Windows too. */
const rel = (file: string): string => relative(ROOT, file).split(sep).join('/');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const at = join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith('.') || SKIPPED.has(e.name) || rel(at) === SUBJECTS ? [] : sources(at);
    return /\.(?:[cm]?ts|[cm]?js)$/.test(e.name) && !/\.test\.[cm]?ts$/.test(e.name) ? [at] : [];
  });
}

const FILES = SCANNED.flatMap((dir) => sources(join(ROOT, dir)));

describe('compat-oracle and the benchmarks spawn through bellpull (bellpull criterion 4)', () => {
  it('reads the files that spawn, so it cannot pass by reading nothing', () => {
    const names = FILES.map(rel);
    for (const expected of ['packages/compat-oracle/src/run.ts', 'packages/compat-oracle/src/vendor.ts', 'packages/compat-oracle/src/upstream.ts', 'benchmarks/axes/perf.ts', 'benchmarks/machine.ts']) {
      expect(names).toContain(expected);
    }
    expect(names.some((n) => n.endsWith('.test.ts')), 'test files are out of scope').toBe(false);
    expect(names.some((n) => n.startsWith(`${SUBJECTS}/`)), 'the measured subjects are out of scope').toBe(false);
  });

  it('no module imports node:child_process', () => {
    const offenders = FILES.filter((file) => IMPORTS_CHILD_PROCESS.test(code(readFileSync(file, 'utf8')))).map(rel);
    expect(offenders, 'spawn through bellpull: `compat-oracle/src/spawn.ts`, or `benchmarks/spawn.ts`').toEqual([]);
  });
});

/**
 * The pattern against every spelling it must find and the prose it must not. A pattern that
 * matched nothing would pass the suite above on any tree.
 */
describe('the import shape finds every spelling and no prose', () => {
  it.each([
    "import { spawnSync } from 'node:child_process';",
    'import { execFileSync } from "child_process";',
    "import cp from 'node:child_process';",
    "import type { ChildProcess } from 'node:child_process';",
    "import 'node:child_process';",
    "export { spawn } from 'node:child_process';",
    "const cp = await import('node:child_process');",
    "const cp = require('child_process');",
    'const cp = require(`node:child_process`);',
  ])('finds %s', (line) => {
    expect(IMPORTS_CHILD_PROCESS.test(code(line))).toBe(true);
  });

  it.each([
    "// import { spawn } from 'node:child_process';",
    "/** `import { spawn } from 'node:child_process'` in prose. */",
    "/**\n * value (`import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process'`) and\n */",
    "import { sync } from 'bellpull/cross-spawn';",
    "const note = 'a raw child_process.spawn is the floor';",
    "spawn(cmd); // from 'node:child_process' once",
  ])('ignores %s', (snippet) => {
    expect(IMPORTS_CHILD_PROCESS.test(code(snippet))).toBe(false);
  });
});
