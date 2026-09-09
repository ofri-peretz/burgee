/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — E1. `packages/burgee/src/exit-code.ts` opens with a rule:
 *
 *   > E1 — exit codes are a contract. No other literal may reach `process.exitCode`.
 *
 * Nothing enforced it. `isExitCode()` grades a number a caller already has, which is a
 * different question: it cannot see the call site that writes `1` straight to the process
 * and never asks. The rule was a comment, and a comment is not a control.
 *
 * It matters more here than the wording suggests. An exit code is the one thing an agent
 * reads before it decides what to do next — `2` means *rewrite the command*, any other
 * non-zero means *the command was fine and the world was not* — and it is the axis where
 * `benchmarks/axes/reliability.ts` measures us at 100% against 40% for both incumbents.
 * A published number that rests on an unenforced comment is a number waiting to rot.
 *
 * Two things are checked, because the contract has two halves:
 *
 *   1. **No bare literal exits.** A numeric literal at an exit site is refused unless the
 *      file is named below with the reason it is exempt.
 *   2. **Every exit constant a package declares is one of the six.** The layer's packages
 *      are independent products — flagstaff does not depend on burgee and cannot import
 *      `ExitCode` — so each declares its own. That freedom is exactly how a family ends up
 *      with an exit `5` that means something in one package and nothing in the rest.
 *
 * Read as source text, never imported, for the reason `plugin-error-vocabulary-lock.test.ts`
 * gives: a lock that imports across layers builds the coupling it exists to forbid.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = join(ROOT, 'packages');
const CONTRACT = join(PACKAGES, 'burgee/src/exit-code.ts');

/**
 * The six, read out of the file that declares them so there is one definition of E1 in the
 * repository and this lock cannot drift from it by being edited on its own.
 */
function contractCodes(): Set<number> {
  const src = readFileSync(CONTRACT, 'utf-8');
  const body = src.slice(src.indexOf('export const ExitCode'), src.indexOf('} as const'));
  const codes = new Set([...body.matchAll(/^\s*[A-Z_]+:\s*(\d+),/gm)].map((m) => Number(m[1])));
  if (codes.size === 0) throw new Error(`no exit codes parsed out of ${relative(ROOT, CONTRACT)} — the contract moved and this lock did not`);
  return codes;
}

/**
 * A numeric literal handed to something named `exit`, however the receiver is spelled:
 * `process.exit(1)`, `this.exit(0)`, `io.exit(2)`, `exit(1, err)`. A variable is not a
 * literal and is not caught — `process.exit(code)` is how the honest paths are written,
 * and what `code` holds is the first half's job to have decided.
 */
const LITERAL_EXIT_CALL = /\bexit\(\s*(-?\d+)\s*[,)]/;
/** The spelling the contract's own sentence names. */
const LITERAL_EXIT_ASSIGN = /\bprocess\.exitCode\s*=\s*(-?\d+)\b/;

/**
 * The two front-ends, and only those. Each reproduces its host's exit codes on purpose —
 * that contract is what the host's own suite grades (C1), so a code here answers to
 * commander or to yargs, not to E1. `burgee/src/execute.ts` is deliberately absent: the
 * framework's own exits all go through `ExitCode.*` today, and this lock is what keeps
 * the next one from being written as `1`.
 */
const LITERAL_EXITS_ALLOWED = new Set([
  'burgee/src/commander-command.ts',
  'burgee/src/yargs-factory.ts',
  'burgee/src/yargs-usage.ts',
]);

/** `const EXIT_USAGE = 2` — a named exit code, wherever a package chose to declare one. */
const EXIT_CONSTANT = /\bconst\s+(EXIT_[A-Z0-9_]+|[A-Z0-9_]*EXIT_?CODE[A-Z0-9_]*)\s*(?::[^=]+)?=\s*(-?\d+)\b/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      sourceFiles(p, out);
    } else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/** Every package source, POSIX-relative to `packages/`, with its lines and comments stripped. */
function layerSources(): { rel: string; lines: string[] }[] {
  const out: { rel: string; lines: string[] }[] = [];
  for (const pkg of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    let files: string[];
    try {
      files = sourceFiles(join(PACKAGES, pkg.name, 'src'));
    } catch {
      continue; // a package without a src/ is not a finding
    }
    for (const f of files) {
      const lines = readFileSync(f, 'utf-8')
        .split(/\r?\n/)
        .map((line) => (/^\s*(\*|\/\*)/.test(line) ? '' : line.replace(/\/\/.*$/, '')));
      out.push({ rel: relative(PACKAGES, f).split(sep).join('/'), lines });
    }
  }
  return out;
}

describe('E1 — exit codes are a contract', () => {
  const sources = layerSources();
  const codes = contractCodes();

  it('reads the six codes out of the contract itself', () => {
    expect([...codes].toSorted((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 130]);
  });

  it('finds the layer sources it is supposed to be reading', () => {
    // A lock that silently scans nothing passes forever. `execute.ts` is the framework's
    // exit path; if this list stops containing it, the scan is broken, not the code.
    expect(sources.map((s) => s.rel)).toContain('burgee/src/execute.ts');
  });

  it('no bare literal reaches an exit outside the two front-ends', () => {
    const offenders: string[] = [];
    for (const { rel, lines } of sources) {
      if (LITERAL_EXITS_ALLOWED.has(rel)) continue;
      lines.forEach((code, i) => {
        if (LITERAL_EXIT_CALL.test(code) || LITERAL_EXIT_ASSIGN.test(code)) offenders.push(`${rel}:${i + 1}${code.trim() === '' ? '' : ` — ${code.trim()}`}`);
      });
    }
    expect(offenders, 'name the code: an exit literal says nothing about which half of E1 it means').toEqual([]);
  });

  it('every exit constant any package declares is one of the six', () => {
    const wrong: string[] = [];
    for (const { rel, lines } of sources) {
      lines.forEach((code, i) => {
        const m = EXIT_CONSTANT.exec(code);
        if (m && !codes.has(Number(m[2]))) wrong.push(`${rel}:${i + 1} — ${m[1]} = ${m[2]}`);
      });
    }
    expect(wrong, 'E1 has six codes; a seventh means something in one package and nothing in the rest').toEqual([]);
  });

  // The lock is only as good as its patterns, so each gets its rows. Every `caught` line is
  // one that would have shipped an unnamed exit code before this file existed.
  it.each([
    'process.exitCode = 1;',
    'process.exitCode = 0;',
    '    process.exit(1);',
    'if (bad) process.exit(2);',
    'return io.exit(1);',
    'this.exit(0);',
    'yargs.exit(1, err);',
    'exit(130);',
  ])('catches %j', (line) => {
    expect(LITERAL_EXIT_CALL.test(line) || LITERAL_EXIT_ASSIGN.test(line)).toBe(true);
  });

  it.each([
    'process.exit(code);',
    'process.exitCode = code;',
    'return io.exit(ExitCode.OK);',
    'return io.exit(failure.code);',
    'burgee.exit(code === 0 ? ExitCode.OK : ExitCode.USAGE);',
    'const exitCode = config.exitCode || 1;',
    'if (proc.exitCode === null) proc.kill(signal);',
    'process.exitCode = await main(argv, write);',
  ])('leaves %j alone', (line) => {
    expect(LITERAL_EXIT_CALL.test(line) || LITERAL_EXIT_ASSIGN.test(line)).toBe(false);
  });

  it.each([
    ['const EXIT_USAGE = 2;', 2],
    ['const EXIT_OK: number = 0;', 0],
    ['const DEFAULT_EXIT_CODE = 1;', 1],
  ])('reads %j as an exit constant', (line, value) => {
    expect(Number(EXIT_CONSTANT.exec(line)?.[2])).toBe(value);
  });
});
