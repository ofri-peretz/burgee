/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Shebang reading — `shebang-command`'s answers, and the file read that feeds it.
 *
 * `spawn-args.ts` only asks on Windows, so nothing on this machine reached either function
 * through a spawn. They are pure in their input (a string, or a path), so they are asked here
 * directly; `windows.test.ts` drives the same read through `parse()`.
 */
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { readShebang, shebangCommand } from './shebang.js';

const WINDOWS = process.platform === 'win32';

describe('shebangCommand — shebang-command, case for case', () => {
  it.each([
    ['#!/usr/bin/env node\nconsole.log(1)', 'node'],
    ['#!/bin/sh -e\n', 'sh -e'],
    ['#! /bin/bash\n', 'bash'],
    ['#!/usr/local/bin/python3\n', 'python3'],
  ])('%j names %j', (source, expected) => {
    expect(shebangCommand(source)).toBe(expected);
  });

  it('is undefined for a file with no #! on its first line', () => {
    expect(shebangCommand('console.log("#!/bin/sh")\n')).toBeUndefined();
    expect(shebangCommand('')).toBeUndefined();
  });

  it('is undefined for `env` with nothing after it, rather than naming `env` itself', () => {
    expect(shebangCommand('#!/usr/bin/env\n')).toBeUndefined();
  });

  it('is undefined for a #! line that names no binary at all', () => {
    expect(shebangCommand('#!\n')).toBeUndefined();
    expect(shebangCommand('#!/usr/bin/\n')).toBeUndefined();
  });

  /*
   * The two cases `shebang-command` answers by testing the argument for truth. Before this
   * file existed the first came back as `sh ` — a name nothing on `PATH` answers to, so a
   * Windows spawn of that script went to `cmd.exe` as a missing command — and the second as
   * `''`, which `spawn-args.ts` then made the command.
   */
  it('reads a trailing space as no argument, as shebang-command does', () => {
    expect(shebangCommand('#!/bin/sh \n')).toBe('sh');
  });

  it('reads `env` followed by two spaces as naming nothing, not an empty interpreter', () => {
    expect(shebangCommand('#!/usr/bin/env  node\n')).toBeUndefined();
  });
});

const dir = mkdtempSync(join(tmpdir(), 'bellpull-shebang-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Longer than the 150 bytes read, so the read is a prefix and not the whole file. */
const script = join(dir, 'script');
writeFileSync(script, `#!/usr/bin/env node\n${'// padding\n'.repeat(40)}`);
chmodSync(script, 0o755);

/** How many descriptors this process holds open. */
const open = (): number => readdirSync('/dev/fd').length;

describe('readShebang — the first 150 bytes of a real file', () => {
  it('reads the interpreter a script declares', () => {
    expect(readShebang(script)).toBe('node');
  });

  it('is undefined for a file that is not there', () => {
    expect(readShebang(join(dir, 'absent'))).toBeUndefined();
  });

  it('is undefined for a file with no shebang', () => {
    const plain = join(dir, 'plain.txt');
    writeFileSync(plain, 'just text\n');
    expect(readShebang(plain)).toBeUndefined();
  });

  /*
   * POSIX opens a directory and then fails the read, so this is the path where a descriptor
   * was taken and the read threw — the one a missing `finally` would leak on. `/dev/fd` lists
   * this process's open descriptors on Linux and macOS alike; Windows refuses the open itself.
   */
  it.skipIf(WINDOWS)('is undefined for a directory, and gives back every descriptor it took', () => {
    const sub = join(dir, 'a-directory');
    mkdirSync(sub);
    const before = open();
    for (let i = 0; i < 5; i += 1) {
      expect(readShebang(sub)).toBeUndefined();
      expect(readShebang(script)).toBe('node');
    }
    expect(open()).toBe(before);
  });
});
