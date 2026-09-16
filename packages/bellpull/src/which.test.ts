/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Resolution — design R3, and the two `PATH` refusals `which.ts` documents.
 *
 * Every case builds its own `Runtime` rather than reading the machine's, which is the whole
 * point of Y9: the Windows cases below run on a Mac because `platform: 'win32'` is an
 * argument. Nothing here would be testable if `which` read `process.env` the way its
 * incumbent does.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Runtime } from './runtime.js';
import { extensionCandidates, NotFoundError, runPath, searchPath, whichAllSync, whichOrThrowSync, whichSync } from './which.js';

let root: string;
let binA: string;
let binB: string;
let writable: string;

const posix = (over: Partial<Runtime> = {}): Runtime => ({ platform: 'linux', env: {}, cwd: root, uid: process.getuid?.(), gid: process.getgid?.(), ...over });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bellpull-which-'));
  binA = join(root, 'a');
  binB = join(root, 'b');
  writable = join(root, 'writable');
  for (const dir of [binA, binB, writable]) mkdirSync(dir, { recursive: true });

  // The same name in two directories: which one answers is the question this package exists
  // to be able to report on.
  writeFileSync(join(binA, 'tool'), '#!/bin/sh\necho a\n');
  chmodSync(join(binA, 'tool'), 0o755);
  writeFileSync(join(binB, 'tool'), '#!/bin/sh\necho b\n');
  chmodSync(join(binB, 'tool'), 0o755);

  // Present, and not executable. A resolver that only checked existence would find this.
  writeFileSync(join(binA, 'notexec'), 'data\n');
  chmodSync(join(binA, 'notexec'), 0o644);

  // What an attacker would drop in a directory they can write to, for an empty PATH entry
  // or a relative one to pick up.
  writeFileSync(join(root, 'evil'), '#!/bin/sh\necho owned\n');
  chmodSync(join(root, 'evil'), 0o755);
  writeFileSync(join(writable, 'tool'), '#!/bin/sh\necho owned\n');
  chmodSync(join(writable, 'tool'), 0o755);
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('the differentiator: where it was found, not just what', () => {
  it('reports the PATH entry that answered', () => {
    const found = whichSync('tool', { runtime: posix({ env: { PATH: `${binA}:${binB}` } }) });
    expect(found).toEqual({ path: join(binA, 'tool'), from: binA, ext: '' });
  });

  it('answers differently when the order changes, and says so rather than leaving it to be inferred', () => {
    const found = whichSync('tool', { runtime: posix({ env: { PATH: `${binB}:${binA}` } }) });
    expect(found?.from).toBe(binB);
  });

  it('lists every hit, best first — "there are two of these on PATH" is the finding', () => {
    const all = whichAllSync('tool', { runtime: posix({ env: { PATH: `${binA}:${binB}` } }) });
    expect(all.map((r) => r.from)).toEqual([binA, binB]);
  });

  it('leaves `from` empty when the caller named a file, so the two cases are distinguishable', () => {
    const found = whichSync(join(binA, 'tool'), { runtime: posix({ env: { PATH: binB } }) });
    expect(found).toEqual({ path: join(binA, 'tool'), from: '', ext: '' });
  });
});

describe('the executable bit is checked, not just existence', () => {
  it('passes over a file that is present and not executable', () => {
    expect(whichSync('notexec', { runtime: posix({ env: { PATH: binA } }) })).toBeUndefined();
  });

  it('passes over a directory with the right name', () => {
    expect(whichSync('a', { runtime: posix({ env: { PATH: root } }) })).toBeUndefined();
  });
});

/**
 * The security rules from `which.ts`'s header, each with the attack it refuses.
 *
 * These are the cases a naive implementation gets wrong: `which`'s own resolver joins an
 * empty `PATH` entry onto the command and stats the result, which resolves against the
 * working directory.
 */
describe('PATH cannot be used to point at a directory somebody else controls', () => {
  it('skips an empty PATH entry instead of reading it as the working directory', () => {
    // `/usr/bin:` — the trailing colon is the classic form, and on a POSIX shell it means
    // `.`. A caller running in a directory an attacker can write to would run their binary.
    const runtime = posix({ env: { PATH: `${binA}:` }, cwd: root });
    expect(whichSync('evil', { runtime })).toBeUndefined();

    const entries = searchPath({ runtime });
    expect(entries.at(-1)).toEqual({ raw: '', skipped: 'empty' });
  });

  it('skips a relative PATH entry, whose meaning changes with the working directory', () => {
    const runtime = posix({ env: { PATH: 'writable' }, cwd: root });
    expect(whichSync('tool', { runtime })).toBeUndefined();
    expect(searchPath({ runtime })).toEqual([{ raw: 'writable', skipped: 'relative' }]);
  });

  it('says why an entry was skipped, so a PATH doing less than its author expected is visible', () => {
    const entries = searchPath({ runtime: posix({ env: { PATH: `${binA}::bin:${binB}` } }) });
    expect(entries.map((e) => e.skipped ?? e.dir)).toEqual([binA, 'empty', 'relative', binB]);
  });

  it('always answers with an absolute path, even for a relative command', () => {
    const found = whichSync('./a/tool', { runtime: posix({ cwd: root }) });
    expect(found?.path).toBe(join(binA, 'tool'));
  });

  it('never searches PATH for a command that carries a path separator', () => {
    // `writable/tool` exists; `tool` also exists on PATH. The caller wrote a path, so PATH
    // must not answer — otherwise `PATH` could shadow a file the caller named.
    const runtime = posix({ env: { PATH: binA }, cwd: root });
    expect(whichSync('writable/tool', { runtime })?.path).toBe(join(writable, 'tool'));
  });
});

/**
 * Windows, from a Mac — and a precise line about what that can and cannot mean.
 *
 * The *policy* halves of Windows resolution are pure functions of the runtime, so they are
 * checked here: which `PATHEXT` extensions are tried and in what order, which key `PATH` was
 * spelled under, whether the working directory is searched first, and which `PATH` entries
 * are refused. Those are the parts a bug would hide in.
 *
 * The *filesystem* half — whether `C:\\tools\\npm.cmd` is there — is a fact about a
 * filesystem that is not on this machine, and a test that stat'd a posix temp directory
 * through a `win32` runtime would be checking an incoherent world. It is left to a Windows
 * runner, and said so here rather than faked.
 */
const win = (env: Record<string, string | undefined>): Runtime => ({ platform: 'win32', env, cwd: 'C:\\work' });

describe('Windows policy, from a Mac, because the platform is an argument', () => {
  it('tries PATHEXT in the order PATHEXT gives', () => {
    expect(extensionCandidates('npm', { runtime: win({ PATHEXT: '.EXE;.CMD' }) })).toEqual(['.EXE', '.CMD']);
    expect(extensionCandidates('npm', { runtime: win({ PATHEXT: '.CMD;.EXE' }) })).toEqual(['.CMD', '.EXE']);
  });

  it('falls back to the extensions Windows runs without being told to', () => {
    expect(extensionCandidates('npm', { runtime: win({}) })).toEqual(['.EXE', '.CMD', '.BAT', '.COM']);
  });

  it('tries a command that already carries a dot as written, first', () => {
    expect(extensionCandidates('whoami.cmd', { runtime: win({ PATHEXT: '.EXE;.CMD' }) })).toEqual(['', '.EXE', '.CMD']);
  });

  it('expands nothing off Windows, where a file is executable or it is not', () => {
    expect(extensionCandidates('npm', { runtime: posix() })).toEqual(['']);
  });

  it('reads PATH under whichever case Windows spelled it', () => {
    expect(searchPath({ runtime: win({ Path: 'C:\\tools' }) }).at(-1)?.dir).toBe('C:\\tools');
    expect(searchPath({ runtime: win({ PATH: 'C:\\other' }) }).at(-1)?.dir).toBe('C:\\other');
  });

  it('splits PATH on `;`, not `:`, so a drive letter is not two entries', () => {
    const dirs = searchPath({ runtime: win({ PATH: 'C:\\a;D:\\b' }) })
      .filter((e) => e.skipped === undefined)
      .map((e) => e.dir);
    expect(dirs).toEqual(['C:\\work', 'C:\\a', 'D:\\b']);
  });

  it('accepts a drive-letter path as absolute, which a posix rule would have refused', () => {
    expect(searchPath({ runtime: win({ PATH: 'C:\\tools' }) }).at(-1)?.skipped).toBeUndefined();
  });

  it('accepts a UNC path', () => {
    expect(searchPath({ runtime: win({ PATH: '\\\\server\\share\\bin' }) }).at(-1)?.skipped).toBeUndefined();
  });

  it('unquotes a PATH entry, which is how Windows carries a directory with a semicolon', () => {
    expect(searchPath({ runtime: win({ PATH: '"C:\\Program Files\\bin"' }) }).at(-1)?.dir).toBe('C:\\Program Files\\bin');
  });

  it('searches the working directory first, as the platform does', () => {
    expect(searchPath({ runtime: win({ PATH: 'C:\\tools' }) })[0]?.dir).toBe('C:\\work');
  });

  it('still refuses a relative entry there, where `tools` would follow the caller around', () => {
    expect(searchPath({ runtime: win({ PATH: 'tools' }) }).at(-1)).toEqual({ raw: 'tools', skipped: 'relative' });
  });

  it('does not search the working directory first off Windows', () => {
    expect(searchPath({ runtime: posix({ env: { PATH: binA } }) })[0]?.dir).toBe(binA);
  });
});

describe('the throwing form', () => {
  it('throws ENOENT naming the command', () => {
    expect(() => whichOrThrowSync('nothinghere', { runtime: posix({ env: { PATH: binA } }) })).toThrow(NotFoundError);
    try {
      whichOrThrowSync('nothinghere', { runtime: posix({ env: { PATH: binA } }) });
    } catch (error) {
      expect((error as NotFoundError).code).toBe('ENOENT');
      expect((error as NotFoundError).command).toBe('nothinghere');
    }
  });
});

describe('runPath — npm-run-path, without npm-run-path', () => {
  it('puts every node_modules/.bin from cwd upward in front of PATH', () => {
    const deep = join(root, 'a');
    const path = runPath({ runtime: posix({ env: { PATH: '/usr/bin' }, cwd: deep }) });
    const parts = path.split(':');
    expect(parts[0]).toBe(join(deep, 'node_modules', '.bin'));
    expect(parts).toContain(join(root, 'node_modules', '.bin'));
    expect(parts.at(-1)).toBe('/usr/bin');
  });

  it('terminates at the filesystem root rather than walking forever', () => {
    expect(runPath({ runtime: posix({ cwd: '/' }) }).split(':')).toEqual([join('/', 'node_modules', '.bin')]);
  });
});
