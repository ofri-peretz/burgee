/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * B5: a lookup stops at its first hit. `whichSync` was `whichAllSync()[0]`, which stat-ed every
 * directory on `PATH` to throw all but one answer away (3.3× `which.sync` in the audit), and the
 * `node-which` façade built every candidate path before trying the first. Counting `statSync`
 * calls proves the walk ends where it should, which a timing could not do reliably on a runner.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>();
  return { ...real, statSync: vi.fn(real.statSync) };
});

const { whichAllSync, whichSync } = await import('./which.js');
const { default: which } = await import('./node-which.js');

let root: string;
let dirs: string[];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bellpull-first-hit-'));
  dirs = ['a', 'b', 'c', 'd'].map((name) => join(root, name));
  for (const dir of dirs) {
    mkdirSync(dir);
    writeFileSync(join(dir, 'tool'), '#!/bin/sh\n');
    chmodSync(join(dir, 'tool'), 0o755);
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.mocked(statSync).mockClear();
});

const runtime = (): Parameters<typeof whichSync>[1]['runtime'] => ({ platform: 'linux', env: { PATH: dirs.join(delimiter) }, cwd: root, uid: process.getuid?.(), gid: process.getgid?.() });

describe.skipIf(process.platform === 'win32')('a lookup stops at its first hit', () => {
  it('whichSync stats one file when the first PATH entry has it', () => {
    expect(whichSync('tool', { runtime: runtime() })?.from).toBe(dirs[0]);
    expect(statSync).toHaveBeenCalledTimes(1);
  });

  it('whichAllSync still stats every entry, and finds every hit', () => {
    expect(whichAllSync('tool', { runtime: runtime() })).toHaveLength(dirs.length);
    expect(statSync).toHaveBeenCalledTimes(dirs.length);
  });

  it('the node-which façade stats one file, not every candidate it could build', () => {
    expect(which.sync('tool', { path: dirs.join(delimiter) })).toBe(join(dirs[0] as string, 'tool'));
    expect(statSync).toHaveBeenCalledTimes(1);
    expect(which.sync('tool', { path: dirs.join(delimiter), all: true })).toHaveLength(dirs.length);
  });
});
