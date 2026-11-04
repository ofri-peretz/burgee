/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R9 — `bellpull/node-which` answers node-which 7's calls. node-which's own suite
 * grades it in `compat-oracle`; this is the package-local check that the entry carries it.
 */
import { chmodSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discard, scratchDirs } from './__fixtures__/scratch-dir.js';
import which from './node-which.js';

const scratch = scratchDirs();

const POSIX = process.platform !== 'win32';
const dir = scratch('bellpull-which-');
const tool = join(dir, 'tool');
writeFileSync(tool, '#!/bin/sh\necho tool\n');
chmodSync(tool, 0o755);
writeFileSync(join(dir, 'plain'), 'not executable\n');
// A backslash is an ordinary character in a POSIX file name.
const backslashed = join(dir, 'a\\b');
writeFileSync(backslashed, '#!/bin/sh\n');
chmodSync(backslashed, 0o755);

describe.runIf(POSIX)('the node-which drop-in (R9)', () => {
  it('finds an executable on the given path, as a promise and synchronously', async () => {
    expect(await which('tool', { path: dir })).toBe(tool);
    expect(which.sync('tool', { path: dir })).toBe(tool);
  });

  it('returns every match with `all`', () => {
    expect(which.sync('tool', { path: [dir, dir].join(':'), all: true })).toEqual([tool, tool]);
  });

  it('refuses a file that is not executable, with node-which’s ENOENT error', async () => {
    await expect(which('plain', { path: dir })).rejects.toMatchObject({ code: 'ENOENT', message: 'not found: plain' });
    expect(() => which.sync('plain', { path: dir })).toThrow('not found: plain');
  });

  it('returns null instead of throwing with `nothrow`', () => {
    expect(which.sync('missing', { path: dir, nothrow: true })).toBeNull();
  });

  it('returns a single match as a list of one with `all`', () => {
    expect(which.sync('tool', { path: dir, all: true })).toEqual([tool]);
  });

  it('checks a command with a slash as given, without searching', () => {
    expect(which.sync(tool, { path: '/nowhere' })).toBe(tool);
  });

  it('normalises a `./` inside a path, and keeps no prefix for one that does not start with it', () => {
    expect(which.sync(`${dir}/./tool`, { path: '/nowhere' })).toBe(tool);
  });

  it('keeps the leading `./` of a relative command, as node-which does', () => {
    const rel = relative(process.cwd(), tool);
    expect(which.sync(`./${rel}`, { path: '/nowhere' })).toBe(`./${rel}`);
  });

  it('keeps no `.\\` prefix on POSIX, where `.\\x` is a name and not a relative path', () => {
    // An empty PATH entry joins to the name as written, against the working directory — the one
    // place a name lands there, so the file has to sit in it. Moved out again whatever the answer.
    const name = `.\\bellpull-which-${String(process.pid)}`;
    const at = join(process.cwd(), name);
    writeFileSync(at, '#!/bin/sh\n');
    chmodSync(at, 0o755);
    try {
      expect(which.sync(name, { path: '' })).toBe(name);
    } finally {
      discard(at);
    }
  });

  it('reads a backslash as part of a name on POSIX, and searches PATH for it', () => {
    expect(which.sync('a\\b', { path: dir })).toBe(backslashed);
  });
});
