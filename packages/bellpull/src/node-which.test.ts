/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R9 — `bellpull/node-which` answers node-which 7's calls. node-which's own suite
 * grades it in `compat-oracle`; this is the package-local check that the entry carries it.
 */
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import which from './node-which.js';

const POSIX = process.platform !== 'win32';
const dir = mkdtempSync(join(tmpdir(), 'bellpull-which-'));
const tool = join(dir, 'tool');
writeFileSync(tool, '#!/bin/sh\necho tool\n');
chmodSync(tool, 0o755);
writeFileSync(join(dir, 'plain'), 'not executable\n');

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

  it('checks a command with a slash as given, without searching', () => {
    expect(which.sync(tool, { path: '/nowhere' })).toBe(tool);
  });
});
