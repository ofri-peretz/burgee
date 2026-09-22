/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Resolution — design R3, and the two `PATH` refusals `which.ts` documents.
 *
 * ## Two kinds of case, and mixing them is what broke this file on Windows
 *
 * A resolution test is either about **policy** — which directories would be searched, in what
 * order, which are refused and why — or about the **filesystem**, which needs real files with
 * real names and real modes. The two need opposite things from a `Runtime`, and the first
 * version of this file gave them the same one.
 *
 * Policy cases build a `Runtime` out of nothing: `platform: 'linux'` with `/opt/bin` on
 * `PATH`, or `platform: 'win32'` with `C:\tools`. That is Y9's whole point — the Windows
 * cases below run on a Mac because the platform is an argument — and such a case is a pure
 * function of its arguments, so it gives the same answer on every runner.
 *
 * Filesystem cases cannot do that. They need `mkdtemp`, and `mkdtemp` hands back a path in
 * the dialect of the machine it ran on. The original file fed those host paths to a runtime
 * that claimed `platform: 'linux'`, and on Windows the result was an incoherent world: the
 * temp directory came back as `C:\Users\RUNNER~1\…`, the suite joined two of them with `:`
 * because a linux runtime says the delimiter is `:`, and `searchPath` duly split
 * `C:\…\a:C:\…\b` into `C`, `\…\a`, `C`, `\…\b` — two drive letters read as two relative
 * entries. Ten cases failed, all of them reporting `undefined` or `[]`, and **not one of
 * them was a resolver bug**. The runtime described Linux and the paths described Windows.
 *
 * So: policy cases take {@link posix} or {@link win}, which are invented. Filesystem cases
 * take {@link host}, which is the machine this is running on — real platform, real
 * delimiter, and fixtures named so they are executable under that platform's own rule.
 *
 * ## What `host` changes on Windows, and why that is the point
 *
 * Windows has no execute bit, so `executableByName` asks whether the extension is in
 * `PATHEXT` instead. A fixture called `tool` is therefore not executable there however it is
 * chmod'd, and every one of these cases would resolve to `undefined` while appearing to test
 * resolution. The fixtures are written as `tool.CMD` on Windows and `tool` elsewhere, so the
 * same case exercises the `PATHEXT` branch there and the mode branch here — which is the
 * first time either half of `executableByName` has been run by anything.
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Runtime } from './runtime.js';
import { extensionCandidates, NotFoundError, resolveExecutable, runPath, searchPath, whichAllSync, whichOrThrowSync, whichSync } from './which.js';

const WINDOWS = process.platform === 'win32';

/**
 * The extension a fixture needs to be executable on this platform.
 *
 * `.CMD` and not `.cmd`: `pathExtensions` returns `PATHEXT`'s own spelling, which is
 * upper-case by default, and `Resolution.path` is the candidate that was tried. Naming the
 * file the way the resolver will name it keeps every assertion below a plain equality
 * instead of a case-insensitive comparison that would also pass for the wrong file.
 */
const EXE = WINDOWS ? '.CMD' : '';

let root: string;
let binA: string;
let binB: string;
let writable: string;

/** A fixture that this platform will agree is executable. */
function executable(dir: string, name: string, body: string): string {
  const at = join(dir, `${name}${EXE}`);
  writeFileSync(at, WINDOWS ? `@echo ${body}\r\n` : `#!/bin/sh\necho ${body}\n`);
  chmodSync(at, 0o755);
  return at;
}

/**
 * A runtime describing **this** machine — for the cases that touch the filesystem, because a
 * real file's path and a real file's executability are both facts about the platform it is
 * on, and no other runtime can describe them truthfully.
 */
const host = (over: Partial<Runtime> = {}): Runtime => ({ platform: process.platform, env: {}, cwd: root, uid: process.getuid?.(), gid: process.getgid?.(), ...over });

/** `PATH`, spelled for the platform `host` describes. */
const hostPath = (...dirs: string[]): string => dirs.join(delimiter);

/**
 * An invented POSIX runtime, for the cases that are pure policy. `/opt/bin` is not on this
 * machine and does not need to be: nothing here stats anything.
 */
const posix = (over: Partial<Runtime> = {}): Runtime => ({ platform: 'linux', env: {}, cwd: '/w', uid: undefined, gid: undefined, ...over });

/** An invented Windows runtime. The Windows cases run on a Mac because the platform is an argument. */
const win = (env: Record<string, string | undefined>): Runtime => ({ platform: 'win32', env, cwd: 'C:\\work' });

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'bellpull-which-'));
  binA = join(root, 'a');
  binB = join(root, 'b');
  writable = join(root, 'writable');
  for (const dir of [binA, binB, writable]) mkdirSync(dir, { recursive: true });

  // The same name in two directories: which one answers is the question this package exists
  // to be able to report on.
  executable(binA, 'tool', 'a');
  executable(binB, 'tool', 'b');

  // Present, and not executable — by this platform's own rule. On POSIX that is the mode; on
  // Windows it is the extension, since `notexec` carries none that `PATHEXT` lists.
  writeFileSync(join(binA, 'notexec'), 'data\n');
  chmodSync(join(binA, 'notexec'), 0o644);

  // A directory wearing an executable's name, so `isFile` is the check being graded rather
  // than `stat` succeeding. It needs the extension too, or on Windows the `PATHEXT` walk
  // would pass it over before `executableByName` ever saw it.
  mkdirSync(join(root, `tooldir${EXE}`), { recursive: true });

  // What an attacker would drop in a directory they can write to, for an empty PATH entry
  // or a relative one to pick up.
  executable(root, 'evil', 'owned');
  executable(writable, 'tool', 'owned');
});

afterAll(() => rmSync(root, { recursive: true, force: true }), 60_000);

describe('the differentiator: where it was found, not just what', () => {
  it('reports the PATH entry that answered', () => {
    const found = whichSync('tool', { runtime: host({ env: { PATH: hostPath(binA, binB) } }) });
    expect(found).toEqual({ path: join(binA, `tool${EXE}`), from: binA, ext: EXE });
  });

  it('answers differently when the order changes, and says so rather than leaving it to be inferred', () => {
    const found = whichSync('tool', { runtime: host({ env: { PATH: hostPath(binB, binA) } }) });
    expect(found?.from).toBe(binB);
  });

  it('lists every hit, best first — "there are two of these on PATH" is the finding', () => {
    const all = whichAllSync('tool', { runtime: host({ env: { PATH: hostPath(binA, binB) } }) });
    expect(all.map((r) => r.from)).toEqual([binA, binB]);
  });

  it('leaves `from` empty when the caller named a file, so the two cases are distinguishable', () => {
    const named = join(binA, `tool${EXE}`);
    const found = whichSync(named, { runtime: host({ env: { PATH: binB } }) });
    // `ext` is `''` because the name was already complete: on Windows a command carrying a
    // dot is tried as written before `PATHEXT` is applied, and here that first try answers.
    expect(found).toEqual({ path: named, from: '', ext: '' });
  });
});

describe('the executable bit is checked, not just existence', () => {
  it('passes over a file that is present and not executable', () => {
    expect(whichSync('notexec', { runtime: host({ env: { PATH: binA } }) })).toBeUndefined();
  });

  it('passes over a directory with the right name', () => {
    expect(whichSync('tooldir', { runtime: host({ env: { PATH: root } }) })).toBeUndefined();
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
  /**
   * The two whole-lookup cases below are POSIX-only, and the reason is not that Windows is
   * hard to test — it is that **on Windows the claim is false, deliberately**.
   *
   * `searchPath` puts the working directory in front of `PATH` on Windows because that is
   * the platform's own rule (`searches the working directory first, as the platform does`).
   * So a bait dropped in the working directory *is* found there, and a lookup that refused it
   * would report a path that disagrees with what `cmd.exe` would have run. The refusal being
   * graded here — that an **empty `PATH` entry** does not silently mean `.` — is asserted for
   * both platforms by the `searchPath` cases, which are policy and run everywhere.
   */
  const onPosix = describe.skipIf(WINDOWS);

  onPosix('the lookup itself, where the working directory is not already on the path', () => {
    it('skips an empty PATH entry instead of reading it as the working directory', () => {
      // `/usr/bin:` — the trailing colon is the classic form, and on a POSIX shell it means
      // `.`. A caller running in a directory an attacker can write to would run their binary.
      expect(whichSync('evil', { runtime: host({ env: { PATH: `${binA}:` }, cwd: root }) })).toBeUndefined();
    });

    it('skips a relative PATH entry, whose meaning changes with the working directory', () => {
      expect(whichSync('tool', { runtime: host({ env: { PATH: 'writable' }, cwd: root }) })).toBeUndefined();
    });
  });

  it('reports an empty entry as skipped rather than silently dropping it', () => {
    const entries = searchPath({ runtime: posix({ env: { PATH: '/opt/bin:' } }) });
    expect(entries.at(-1)).toEqual({ raw: '', skipped: 'empty' });
  });

  it('reports a relative entry as skipped, naming it as the caller wrote it', () => {
    expect(searchPath({ runtime: posix({ env: { PATH: 'writable' } }) })).toEqual([{ raw: 'writable', skipped: 'relative' }]);
  });

  it('says why an entry was skipped, so a PATH doing less than its author expected is visible', () => {
    const entries = searchPath({ runtime: posix({ env: { PATH: '/opt/bin::bin:/usr/bin' } }) });
    expect(entries.map((e) => e.skipped ?? e.dir)).toEqual(['/opt/bin', 'empty', 'relative', '/usr/bin']);
  });

  it('always answers with an absolute path, even for a relative command', () => {
    const found = whichSync('./a/tool', { runtime: host({ cwd: root }) });
    expect(found?.path).toBe(join(binA, `tool${EXE}`));
  });

  it('never searches PATH for a command that carries a path separator', () => {
    // `writable/tool` exists; `tool` also exists on PATH. The caller wrote a path, so PATH
    // must not answer — otherwise `PATH` could shadow a file the caller named.
    const runtime = host({ env: { PATH: binA }, cwd: root });
    expect(whichSync('writable/tool', { runtime })?.path).toBe(join(writable, `tool${EXE}`));
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
 * filesystem, and it is now graded by the `host` cases above whenever this suite runs on a
 * Windows runner. From a Mac it is left alone rather than faked: a case that stat'd a posix
 * temp directory through a `win32` runtime would be checking an incoherent world, which is
 * the mistake that made this file red in the first place.
 */
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
    expect(searchPath({ runtime: posix({ env: { PATH: '/opt/bin' } }) })[0]?.dir).toBe('/opt/bin');
  });
});

/**
 * The two-attempt walk `run()` and `parse()` must share.
 *
 * This is the lookup a **spawner** needs, and it differs from `which`'s only on Windows: an
 * extensionless file with a `#!` line is runnable — `spawn-args.ts` puts the interpreter in
 * front — but a `PATHEXT` walk passes it over for not being `.EXE`. `run.ts` used to ask the
 * single-attempt question while `spawn-args.ts` asked the double, so on Windows a shebang
 * script parsed fine and was then rejected by the function that runs it.
 *
 * Off Windows `pathExtensions` is `['']` whatever is asked, so the second attempt *is* the
 * first and this divergence could never have shown up here. That is why it survived a
 * 68 / 68 grading against `cross-spawn`'s own suite, and it is why the policy case below is
 * written against an invented `win32` runtime rather than left to the Windows runner.
 */
describe('resolveExecutable — the walk a spawner needs, not the walk a shell needs', () => {
  it('disables PATHEXT on the second attempt, which is the only way a shebang script is found', () => {
    // The observable difference, without a filesystem: with `PATHEXT` in force the candidate
    // list never contains the bare name, and with it disabled that is the only candidate. A
    // single-attempt resolver can therefore only ever try the first list.
    const runtime = win({ PATHEXT: '.EXE;.CMD', PATH: 'C:\\tools' });
    expect(extensionCandidates('bin-script', { runtime })).toEqual(['.EXE', '.CMD']);
    expect(extensionCandidates('bin-script', { runtime, pathExt: '' })).toEqual(['']);
  });

  it('finds what whichSync finds, on this machine', () => {
    const runtime = host({ env: { PATH: hostPath(binA, binB) } });
    expect(resolveExecutable('tool', { runtime })).toEqual(whichSync('tool', { runtime }));
  });

  it('is undefined when neither attempt answers', () => {
    expect(resolveExecutable('nothinghere', { runtime: host({ env: { PATH: binA } }) })).toBeUndefined();
  });
});

describe('the throwing form', () => {
  it('throws ENOENT naming the command', () => {
    expect(() => whichOrThrowSync('nothinghere', { runtime: host({ env: { PATH: binA } }) })).toThrow(NotFoundError);
    try {
      whichOrThrowSync('nothinghere', { runtime: host({ env: { PATH: binA } }) });
    } catch (error) {
      expect((error as NotFoundError).code).toBe('ENOENT');
      expect((error as NotFoundError).command).toBe('nothinghere');
    }
  });
});

/**
 * `runPath` is policy, all of it: a walk up a path string and a join. It never stats
 * anything, so it is written against invented runtimes and answers the same on every runner
 * — which the original did not, because it walked a real `mkdtemp` directory and then split
 * the result on `:`. On a Windows runner that produced
 * `'/a/burgee/burgee/packages/bellpull/C'`, a posix `resolve` of a drive letter.
 */
describe('runPath — npm-run-path, without npm-run-path', () => {
  it('puts every node_modules/.bin from cwd upward in front of PATH', () => {
    const parts = runPath({ runtime: posix({ env: { PATH: '/usr/bin' }, cwd: '/w/x/y' }) }).split(':');
    expect(parts[0]).toBe('/w/x/y/node_modules/.bin');
    expect(parts).toContain('/w/node_modules/.bin');
    expect(parts.at(-1)).toBe('/usr/bin');
  });

  it('terminates at the filesystem root rather than walking forever', () => {
    expect(runPath({ runtime: posix({ cwd: '/' }) }).split(':')).toEqual(['/node_modules/.bin']);
  });

  it('walks a Windows path in Windows dialect, and stops at the drive root', () => {
    // The half that never ran: backslashes, `;` between entries, and a walk that terminates
    // at `C:\` rather than at `/`. A posix `resolve` of `C:\work\pkg` would not have found a
    // parent at all, so this is the case that would catch `pathOps` being read off the
    // machine instead of off the runtime.
    const path = runPath({ runtime: win({ PATH: 'C:\\tools' }), cwd: 'C:\\work\\pkg' });
    expect(path.split(';')).toEqual(['C:\\work\\pkg\\node_modules\\.bin', 'C:\\work\\node_modules\\.bin', 'C:\\node_modules\\.bin', 'C:\\tools']);
  });
});
