/**
 * `dotenv run`'s spawn, ported from dotenv 18.0.5's `lib/spawn-command.js`. The Windows half
 * is exercised by handing it `platform: 'win32'` and watching what reaches `child_process.spawn`
 * — the quoting is pure string work, and dotenv's own suite runs the real thing only on a
 * Windows runner.
 */
import cp from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { envValue, protectShellToken, quoteWindowsArgument, resolveWindowsCommand, spawnCommand } from './dotenv-spawn.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('quoteWindowsArgument (the C runtime’s rules)', () => {
  it.each([
    ['', '""'],
    ['plain', '"plain"'],
    ['two words', '"two words"'],
    ['a"quote', '"a\\"quote"'],
    ['trailing\\', '"trailing\\\\"'],
    ['a\\b', '"a\\b"'],
    ['a\\"b', '"a\\\\\\"b"'],
    ['a\\\\"b', '"a\\\\\\\\\\"b"'],
  ])('%j → %s', (value, quoted) => {
    expect(quoteWindowsArgument(value)).toBe(quoted);
  });
});

describe('protectShellToken (cmd’s rules)', () => {
  it('carets every ASCII character that is not a letter, digit or path character', () => {
    expect(protectShellToken('aZ09\\/:._-')).toBe('aZ09\\/:._-');
    expect(protectShellToken('a&b|c<d>e%f!g^h(i) "j"')).toBe('a^&b^|c^<d^>e^%f^!g^^h^(i^)^ ^"j^"');
  });

  it('leaves non-ASCII alone, and adds one layer of carets per pass', () => {
    expect(protectShellToken('é&')).toBe('é^&');
    expect(protectShellToken('&', 2)).toBe('^^^&');
    expect(protectShellToken('&', 0)).toBe('&');
  });

  it('treats the characters at each range boundary as the ranges say', () => {
    // '/' and ':' sit either side of the digits, '@' and '[' of the upper case, '`' and '{' of the lower.
    expect(protectShellToken('@[`{')).toBe('^@^[^`^{');
  });
});

describe('envValue (Windows names are case-insensitive)', () => {
  it('finds a name in any case, and the last spelling wins', () => {
    expect(envValue({ Path: 'a' }, 'PATH')).toBe('a');
    expect(envValue({ PATH: 'first', path: 'second' }, 'PATH')).toBe('second');
    expect(envValue({}, 'PATH')).toBeUndefined();
  });
});

describe('resolveWindowsCommand', () => {
  const root = mkdtempSync(join(tmpdir(), 'seniority-dotenv-win-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'probe.CMD'), '');
  writeFileSync(join(root, 'local.EXE'), '');
  mkdirSync(join(root, 'dir.BAT'));
  writeFileSync(join(root, 'twice.EXE'), '');
  writeFileSync(join(root, 'twice.EXE.exe'), '');

  it('tries each PATHEXT suffix over the cwd and then PATH', () => {
    expect(resolveWindowsCommand('probe', { Path: bin, PATHEXT: '.EXE;.CMD' }, root)).toBe(join(bin, 'probe.CMD'));
    expect(resolveWindowsCommand('local', { PATHEXT: '.EXE' }, root)).toBe(join(root, 'local.EXE'));
  });

  it('tries the name as given first when it already carries an extension', () => {
    expect(resolveWindowsCommand('local.EXE', { PATHEXT: '.CMD' }, root)).toBe(join(root, 'local.EXE'));
    expect(resolveWindowsCommand('local.EXE', { PATHEXT: '.exe' }, root)).toBe(join(root, 'local.EXE'));
    expect(resolveWindowsCommand('twice.EXE', { PATHEXT: '.exe' }, root)).toBe(join(root, 'twice.EXE'));
    expect(resolveWindowsCommand('twice.EXE', { PATHEXT: '.cmd' }, root)).toBe(join(root, 'twice.EXE'));
  });

  it('uses the default PATHEXT when there is none, or an empty one', () => {
    expect(resolveWindowsCommand('local', {}, root)).toBe(join(root, 'local.EXE'));
    expect(resolveWindowsCommand('local', { PATHEXT: '' }, root)).toBe(join(root, 'local.EXE'));
  });

  it('looks only in the cwd for a name with a slash, strips quotes from PATH entries, and skips a directory', () => {
    expect(resolveWindowsCommand('bin/probe', { Path: root }, root)).toBe(join(root, 'bin', 'probe.CMD'));
    expect(resolveWindowsCommand('probe', { Path: `"${bin}"` }, root)).toBe(join(bin, 'probe.CMD'));
    expect(resolveWindowsCommand('dir', { PATHEXT: '.BAT' }, root)).toBeUndefined();
    expect(resolveWindowsCommand('nowhere', {}, root)).toBeUndefined();
  });
});

/** What `spawnCommand` reads from the process, for a platform of the test's choosing. */
const context = (platform: string, env: Record<string, string | undefined> = {}): { platform: string; env: Record<string, string | undefined>; cwd: () => string } => ({ platform, env, cwd: () => tmpdir() });

describe('spawnCommand', () => {
  const fake = { pid: 1 } as unknown as cp.ChildProcess;

  it('is `child_process.spawn` and nothing else off Windows', () => {
    const spawn = vi.spyOn(cp, 'spawn').mockReturnValue(fake);
    expect(spawnCommand('node', ['-e', 'a&b'], { stdio: 'inherit' }, context('linux'))).toBe(fake);
    expect(spawn).toHaveBeenCalledWith('node', ['-e', 'a&b'], { stdio: 'inherit' });
  });

  const root = mkdtempSync(join(tmpdir(), 'seniority-dotenv-spawn-'));
  writeFileSync(join(root, 'native.EXE'), '');
  writeFileSync(join(root, 'script.BAT'), '');

  it('spawns a native executable directly on Windows, so Node quotes its arguments', () => {
    const spawn = vi.spyOn(cp, 'spawn').mockReturnValue(fake);
    spawnCommand('native', ['a b'], { cwd: root }, context('win32'));
    expect(spawn).toHaveBeenCalledWith(join(root, 'native.EXE'), ['a b'], { cwd: root });
  });

  it('runs anything else through COMSPEC with each token escaped, twice for a batch file', () => {
    const spawn = vi.spyOn(cp, 'spawn').mockReturnValue(fake);
    spawnCommand('script', ['a&b'], { cwd: root, env: { ComSpec: 'C:\\cmd.exe' } }, context('win32'));
    const batch = protectShellToken(normalize(join(root, 'script.BAT')));
    expect(spawn).toHaveBeenLastCalledWith('C:\\cmd.exe', ['/d', '/v:off', '/s', '/c', `"${batch} ^^^"a^^^&b^^^""`], { cwd: root, env: { ComSpec: 'C:\\cmd.exe' }, windowsVerbatimArguments: true });

    // Unresolved, it is passed as written and escaped once; with no COMSPEC it is `cmd.exe`, and
    // the context's own environment and cwd stand in for options that give none.
    spawnCommand('missing', ['a&b'], {}, context('win32', { PATHEXT: '.EXE' }));
    expect(spawn).toHaveBeenLastCalledWith('cmd.exe', ['/d', '/v:off', '/s', '/c', '"missing ^"a^&b^""'], { windowsVerbatimArguments: true });
  });

  it('treats an unresolved name ending in .cmd as a batch file', () => {
    const spawn = vi.spyOn(cp, 'spawn').mockReturnValue(fake);
    spawnCommand('gone.cmd', ['&'], { cwd: root }, context('win32'));
    expect(spawn.mock.calls[0]?.[1]).toEqual(['/d', '/v:off', '/s', '/c', '"gone.cmd ^^^"^^^&^^^""']);
  });
});
