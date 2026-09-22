/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * The shape of the package: one file may touch the process (design R7), every subpath a
 * caller can import exists (R6), and every new export is called here **the way the README
 * calls it, with nothing injected**.
 *
 * That last rule is not a style preference, it is this package's own scar. closeout 0.1.0
 * shipped to npm with `declare const globalProcess` — a type-level promise with no runtime
 * binding — so `onExit()` threw `ReferenceError` for everybody who followed the README,
 * while thirty-nine tests passed because every one of them injected a fake process. A suite
 * that never calls a function the way a user calls it cannot fail for the reason the package
 * is broken. `global-process.test.ts` is that case for `onExit`; this file is the standing
 * rule for everything added since.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { once, showCursor, SHOW_CURSOR } from './index.js';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const src = resolve(pkgRoot, 'src');

/**
 * The same pattern `burgee/src/process-reference-lock.test.ts` uses, and deliberately the
 * same spelling: the repository-wide lock reads every package, and this one reads only this
 * package so the exemption list of one can be asserted *here*, where the file that earns it
 * lives. An exemption list of one is auditable; a convention is not.
 */
const PROCESS_READ = /(?:(?<=\bglobalThis\.)|(?<![.\w]))process\??\.(env|argv|exit|exitCode|stdout|stderr|stdin|cwd)\b/;
/** `Reflect.get(globalThis, 'process')` is a process read too — it is the one this package makes. */
const REFLECTED_READ = /Reflect\.get\(globalThis, 'process'\)/;

const sources = (): string[] => readdirSync(src).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

const touchesProcess = (file: string): boolean =>
  readFileSync(join(src, file), 'utf8')
    .split(/\r?\n/)
    .some((line) => {
      // Comments and string literals first: a *message* that names `process.exit()` is prose
      // about a call, not a call — the exact confusion that made this lock red once already.
      const code = line
        .replace(/\/\/.*$/, '')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/`(?:[^`\\$]|\\.)*`/g, '``');
      if (/^\s*(\*|\/\*)/.test(line)) return false;
      return PROCESS_READ.test(code) || REFLECTED_READ.test(line);
    });

describe('exactly one file touches the process (R7), plus the program', () => {
  /**
   * `ambient.ts` is the library's one door to the process, and that is R7. The second file is
   * not the library: it is the `bin` `package.json` declares — `closeout check`, since
   * 2026-09-22 — and a command line owns its process by definition. It is read from `bin`, so
   * the exemption lasts exactly as long as the program does, and the pure logic lives in
   * `check.ts`, which touches nothing.
   */
  it('and it is ambient.ts, with the declared bin beside it', () => {
    const bin = Object.values((JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as { bin?: Record<string, string> }).bin ?? {}).map((target) =>
      target.replace('./dist/', '').replace(/\.js$/u, '.ts'),
    );
    expect(sources().filter(touchesProcess).filter((file) => !bin.includes(file))).toEqual(['ambient.ts']);
    expect(bin.every((file) => sources().includes(file)), 'package.json names a bin with no source behind it').toBe(true);
  });

  it('the check can fail — it finds the read it is looking for', () => {
    // A lock whose pattern matches nothing passes on a package that reads the process in
    // every file. This asserts the instrument before trusting the reading.
    expect(touchesProcess('ambient.ts')).toBe(true);
  });
});

describe('every published subpath has a module behind it (R6)', () => {
  const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
    exports: Record<string, { import: string } | string>;
  };

  it.each(Object.entries(manifest.exports).filter(([, target]) => typeof target === 'object'))('%s', (subpath, target) => {
    const file = (target as { import: string }).import.replace('./dist/', '').replace(/\.js$/, '.ts');
    expect(sources(), `${subpath} names ${file}, which does not exist in src/`).toContain(file);
  });
});

describe('the exports added today, called the way the README calls them', () => {
  it('once(), with nothing injected', () => {
    let calls = 0;
    const wrapped = once(function readTheConfig(): number {
      calls += 1;
      return calls;
    });
    expect(wrapped()).toBe(1);
    expect(wrapped()).toBe(1);
    expect(wrapped.name).toBe('readTheConfig');
  });

  it('showCursor(stream), with nothing injected but the stream it documents', () => {
    const written: string[] = [];
    showCursor({ write: (chunk: string) => written.push(chunk), isTTY: true });
    expect(written).toEqual([SHOW_CURSOR]);
  });
});
