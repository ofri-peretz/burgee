/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `whichSync` stops at the first hit; `whichAllSync` does not (D-20260930-bellpull-first-hit-resolve).
 *
 * The answer was always the same — `whichSync` was `whichAllSync()[0]` — so no test of *what*
 * it returns could tell the two apart. The difference is what it costs: `run()` resolves before
 * every spawn, and the full walk statted every `PATH` entry after the one that answered, ~195 µs
 * a call on an 18-entry ubuntu-latest `PATH`, which was the whole of bellpull's 6 % over tinyexec
 * on spawn time there. So what is asserted is the thing that cost: how many files were statted.
 *
 * Its own file because it replaces `node:fs`'s `statSync` for every module it loads, and the
 * rest of `which.test.ts` stats real fixtures.
 */
import { type Stats } from 'node:fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { run } from './run.js';
import { type Runtime } from './runtime.js';
import { resolveExecutable, whichAllSync, whichSync } from './which.js';

const statted: string[] = [];
/** The options every stat was asked with. */
const asked: unknown[] = [];
/** Two `tool`s, in the first and the last of eight entries; everything else is absent. */
const PRESENT = new Set(['/p/0/tool', '/p/7/tool', 'C:\\p\\tool.exe']);
const EXECUTABLE = { isFile: () => true, mode: 0o755, uid: 0, gid: 0 } as unknown as Stats;

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    statSync: (file: string, options?: unknown) => {
      statted.push(file);
      asked.push(options);
      return PRESENT.has(file) ? EXECUTABLE : undefined;
    },
  };
});

const PATH = Array.from({ length: 8 }, (_, i) => `/p/${String(i)}`).join(':');
const runtime: Runtime = { platform: 'linux', env: { PATH }, cwd: '/w', uid: undefined, gid: undefined };

beforeEach(() => {
  statted.length = 0;
  asked.length = 0;
});

describe('resolution stops where the answer is', () => {
  it('whichSync stats the entry that answered and nothing after it', () => {
    expect(whichSync('tool', { runtime })?.from).toBe('/p/0');
    expect(statted).toEqual(['/p/0/tool']);
  });

  it('resolveExecutable, the walk run() takes before every spawn, stops there too', () => {
    expect(resolveExecutable('tool', { runtime })?.path).toBe('/p/0/tool');
    expect(statted).toEqual(['/p/0/tool']);
  });

  it('whichAllSync still walks every entry, because the second tool is the finding it reports', () => {
    expect(whichAllSync('tool', { runtime }).map((r) => r.from)).toEqual(['/p/0', '/p/7']);
    expect(statted).toHaveLength(8);
  });

  // The other half of the cost: six of those eight are absent, and a throwing stat builds an
  // Error with a stack for each. Every one is asked not to throw for an absent file.
  it('asks every stat not to throw for an absent file, which is most of any walk', () => {
    whichAllSync('tool', { runtime });
    expect(asked).toHaveLength(8);
    for (const options of asked) expect(options).toEqual({ throwIfNoEntry: false });
  });

  // Windows dialect, because that is where a named file has more than one candidate: a name
  // carrying a dot is tried as written, then with each `PATHEXT` extension.
  it('a named file stops at its first candidate that answers, not after every PATHEXT extension', () => {
    const win: Runtime = { platform: 'win32', env: { PATH: '', PATHEXT: '.EXE;.CMD;.BAT' }, cwd: 'C:\\w' };
    expect(whichSync('C:\\p\\tool.exe', { runtime: win })?.path).toBe('C:\\p\\tool.exe');
    expect(statted).toEqual(['C:\\p\\tool.exe']);
  });

  it('run() pays for one stat on the way to its spawn, not one per PATH entry', async () => {
    // The spawn itself fails — `/p/0/tool` is not on this disk — and that rejection is not what
    // is being asserted: the resolution before it is.
    await expect(run('tool', [], { runtime })).rejects.toThrow();
    expect(statted).toEqual(['/p/0/tool']);
  });
});
