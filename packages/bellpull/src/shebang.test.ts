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
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
import { readShebang, shebangCommand } from './shebang.js';

const WINDOWS = process.platform === 'win32';

/**
 * Every descriptor `readShebang` takes and gives back, in order. The real `openSync` and
 * `closeSync` do the work; this only writes down the numbers, so a close that is skipped, or
 * that throws, leaves an opened descriptor with no matching close.
 */
const fds = vi.hoisted(() => ({ opened: [] as number[], closed: [] as number[] }));

vi.mock('node:fs', async (actual) => {
  const real = await actual<typeof import('node:fs')>();
  return {
    ...real,
    openSync: ((...args: Parameters<typeof real.openSync>) => {
      const fd = real.openSync(...args);
      fds.opened.push(fd);
      return fd;
    }) as typeof real.openSync,
    closeSync: ((fd: number) => {
      real.closeSync(fd);
      fds.closed.push(fd);
    }) as typeof real.closeSync,
  };
});

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
afterAll(() => discard(dir));

/** Longer than the 150 bytes read, so the read is a prefix and not the whole file. */
const script = join(dir, 'script');
writeFileSync(script, `#!/usr/bin/env node\n${'// padding\n'.repeat(40)}`);
chmodSync(script, 0o755);

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
   * was taken and the read threw — the one a missing `finally` would leak on. Windows refuses
   * the open itself.
   *
   * The count is of `readShebang`'s own descriptors, not of the process's: under a `threads`
   * pool (oxmutate's dry run) every test file shares one process, so `/dev/fd` moved while a
   * sibling file opened and closed its own: weekly run 41185206028 failed its dry run here, and
   * `vitest run --pool threads --maxWorkers 2` reproduces it (`expected 21 to be 23`, 2026-11-01).
   */
  it.skipIf(WINDOWS)('is undefined for a directory, and gives back every descriptor it took', () => {
    const sub = join(dir, 'a-directory');
    mkdirSync(sub);
    const rounds = 5;
    fds.opened.length = 0;
    fds.closed.length = 0;
    for (let i = 0; i < rounds; i += 1) {
      expect(readShebang(sub)).toBeUndefined();
      expect(readShebang(script)).toBe('node');
    }
    // The directory's open succeeded every time, so the throwing read was reached.
    expect(fds.opened).toHaveLength(2 * rounds);
    expect(fds.closed).toEqual(fds.opened);
  });
});
