/**
 * The proof that `dotenv run`'s Windows command line says what it was given, and nothing else.
 *
 * Three readers stand between `spawnCommand` and the program, and this file models each one:
 * cmd.exe's percent pass, its caret-and-quote tokenizer (`phase2`, run a second time on what a
 * batch file's `%*` forwards), and the C runtime's argv rules. A line is right when nothing in
 * it is a live operator, no `%…%` names a variable, and the program's argv is the caller's.
 * Every vector below and 3,000 seeded random argument lists are held to that, for a plain
 * command and for a batch file.
 *
 * It is also the comparison with bellpull's cross-spawn, whose escaping is `cross-spawn`'s
 * `lib/util/escape.js`, ported below as the reference. The C-runtime quoting is the same bytes
 * except for a run of backslashes before a quote, which cross-spawn's regex shortens and this
 * (like bellpull's scan) does not; the caret set is a superset; and one difference is on purpose: a batch file
 * outside `node_modules/.bin` reparses `%*`, cross-spawn escapes it once, and dotenv 18's suite
 * (`plain.cmd`, `probe.bat`) needs it escaped twice.
 *
 * On a Windows runner the same vectors then go through the real cmd.exe, a `.cmd`, a `.bat` and
 * an npm shim, with a canary that a live `&` would create.
 */
import cp, { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { scratchDirs } from './__fixtures__/scratch-dir.js';
import { isCmdEscapeSafe, protectShellToken, quoteWindowsArgument, spawnCommand } from './dotenv-spawn.js';

const scratch = scratchDirs();

// ---------------------------------------------------------------------------------------------
// The readers.

/** cmd.exe's percent pass on a command line: `%name%` or `%name:…%` expands when `name` is set. */
function percentPass(line: string, env: Record<string, string>): { text: string; expanded: string[] } {
  const names = new Set(Object.keys(env).map((k) => k.toUpperCase()));
  const expanded: string[] = [];
  for (let i = line.indexOf('%'); i !== -1; i = line.indexOf('%', i + 1)) {
    const close = line.indexOf('%', i + 1);
    if (close === -1) break;
    const span = line.slice(i + 1, close);
    const colon = span.indexOf(':');
    const name = colon === -1 ? span : span.slice(0, colon);
    // An unset name is left as written on a command line, and the scan goes on from the next `%`.
    if (names.has(name.toUpperCase())) expanded.push(name);
  }
  return { text: line, expanded };
}

const OPERATORS = new Set(['&', '|', '<', '>', '(', ')']);

/** cmd.exe's tokenizer: a caret takes the next character literally; a quote toggles quoting. */
function phase2(line: string): { chars: { ch: string; literal: boolean }[]; live: string[] } {
  const chars: { ch: string; literal: boolean }[] = [];
  const live: string[] = [];
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quoted) {
      if (ch === '"') quoted = false;
      chars.push({ ch, literal: true });
    } else if (ch === '^') {
      i++;
      if (i < line.length) chars.push({ ch: line[i] as string, literal: true });
    } else {
      if (ch === '"') quoted = true;
      else if (OPERATORS.has(ch)) live.push(ch);
      chars.push({ ch, literal: ch === '"' });
    }
  }
  return { chars, live };
}

/** The command token (up to the first separator cmd itself sees) and the rest, as `%*` forwards it. */
function splitCommand(chars: { ch: string; literal: boolean }[]): { command: string; rest: string } {
  const at = chars.findIndex((c) => !c.literal && (c.ch === ' ' || c.ch === '\t'));
  const text = (from: number, to?: number): string =>
    chars
      .slice(from, to)
      .map((c) => c.ch)
      .join('');
  return at === -1 ? { command: text(0), rest: '' } : { command: text(0, at), rest: text(at + 1) };
}

const isBlank = (ch: string | undefined): boolean => ch === ' ' || ch === '\t';

/** A run of backslashes at `at`: an odd run before a quote escapes it; an even run leaves it to toggle. */
function backslashRun(text: string, at: number): { out: string; next: number } {
  let n = 0;
  while (text[at + n] === '\\') n++;
  if (text[at + n] !== '"') return { out: '\\'.repeat(n), next: at + n };
  if (n % 2 === 1) return { out: `${'\\'.repeat(n >> 1)}"`, next: at + n + 1 };
  return { out: '\\'.repeat(n >> 1), next: at + n };
}

/** One argument from `at`, and where the next one may start. */
function crtArgument(text: string, at: number): { arg: string; next: number } {
  let arg = '';
  let quoted = false;
  let i = at;
  while (i < text.length && (quoted || !isBlank(text[i]))) {
    const ch = text[i] as string;
    if (ch === '\\') {
      const run = backslashRun(text, i);
      arg += run.out;
      i = run.next;
    } else if (ch === '"' && quoted && text[i + 1] === '"') {
      // Inside quotes, `""` is one literal quote (msvcrt 2008 and later).
      arg += '"';
      i += 2;
    } else {
      if (ch === '"') quoted = !quoted;
      else arg += ch;
      i++;
    }
  }
  return { arg, next: i };
}

/** The C runtime's argv rules (`CommandLineToArgvW`, msvcrt 2008 and later). */
function crtArgv(text: string): string[] {
  const argv: string[] = [];
  let i = 0;
  for (;;) {
    while (isBlank(text[i])) i++;
    if (i >= text.length) return argv;
    const { arg, next } = crtArgument(text, i);
    argv.push(arg);
    i = next;
  }
}

interface Reading {
  command: string;
  argv: string[];
  live: string[];
  expanded: string[];
}

/** What a command line built by `spawnCommand` reaches the program as, through a batch file or not. */
function read(cmdArgument: string, batch: boolean, env: Record<string, string>): Reading {
  // `/s /c "<line>"`: cmd drops the first and the last quote and runs what is between.
  expect(cmdArgument.startsWith('"') && cmdArgument.endsWith('"')).toBe(true);
  const line = cmdArgument.slice(1, -1);
  const percent = percentPass(line, env);
  const first = phase2(percent.text);
  const { command, rest } = splitCommand(first.chars);
  // A batch file's `%*` is the rest as cmd stored it; its own line is tokenized again (no
  // percent pass reaches the expanded text).
  const second = batch ? phase2(rest) : { chars: [...rest].map((ch) => ({ ch, literal: true })), live: [] };
  return { command, argv: crtArgv(second.chars.map((c) => c.ch).join('')), live: [...first.live, ...second.live], expanded: percent.expanded };
}

// ---------------------------------------------------------------------------------------------
// cross-spawn 7.0.6 `lib/util/escape.js` (MIT, André Cruz), the reference bellpull ports.

const metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;
const crossSpawnQuote = (arg: string): string => `"${arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"').replace(/(?=(\\+?)?)\1$/, '$1$1')}"`;
function crossSpawnEscapeArgument(arg: string, doubleEscapeMetaChars: boolean): string {
  let out = crossSpawnQuote(arg).replace(metaCharsRegExp, '^$1');
  if (doubleEscapeMetaChars) out = out.replace(metaCharsRegExp, '^$1');
  return out;
}
const crossSpawnEscapeCommand = (arg: string): string => arg.replace(metaCharsRegExp, '^$1');

// ---------------------------------------------------------------------------------------------
// The vectors.

/** dotenv 18.0.7 `tests/test-cli.js`: the cross-platform case and the Windows shims case. */
const DOTENV = ['two words', 'a"quote', '', 'trailing\\', 'a&b', 'x|y', '<input>', '%PATH%', '!name!', '(value)', '^caret'];
/** cross-spawn's `should handle arguments with shell special chars`, its #82 cases, and its shim case. */
const CROSS_SPAWN = ['foo', '()', '[]', '%!', '^<', '>&', '|;', ', ', '!=', '\\*', '"f"', '?.', '=`', "'", '\\"', 'bar\\', '"foo|bar>baz"', '"(foo|bar>baz|foz)"', 'André Cruz', '1234'];
/** What a percent pass with a modifier, a variable cmd defines itself, or a tab would try. */
const PERCENT = ['%CD%', '%PATH:C=&calc%', '%PATH:~0,5%', '%=C:%', '%%', '100%', '%a%b%c%', 'tab\there', '"&"', '\\\\server\\share\\'];
const ALL = [...DOTENV, ...CROSS_SPAWN, ...PERCENT];

/** The variables a real cmd.exe has, plus a few a migrating program brings. */
const ENV = { PATH: 'C:\\Windows', CD: 'C:\\', PATHEXT: '.COM;.EXE;.BAT;.CMD', COMSPEC: 'C:\\Windows\\system32\\cmd.exe', NAME: 'x&y', VAR: 'v' };

/** The line `spawnCommand` builds for `command` and `args`, captured off `child_process.spawn`. */
function lineFor(command: string, args: readonly string[], cwd: string, env: Record<string, string | undefined> = { PATHEXT: '.EXE;.CMD;.BAT' }): string {
  const spawn = vi.spyOn(cp, 'spawn').mockReturnValue({ pid: 1 } as unknown as cp.ChildProcess);
  try {
    spawnCommand(command, args, { cwd, env }, { platform: 'win32', env: {}, cwd: () => cwd });
    return (spawn.mock.calls.at(-1)?.[1] as string[])[4] as string;
  } finally {
    spawn.mockRestore();
  }
}

/** A seeded generator, so a failure names its case and reproduces. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    // mulberry32: 32-bit arithmetic throughout, so no product loses precision.
    state = (state + 0x6d_2b_79_f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
const ALPHABET = [...' \t"\\^&|<>()%!:=;,*?[]`\'@~#$+{}./_-aZ09é😀＂'];

const root = scratch('seniority dotenv cmd ');
writeFileSync(join(root, 'plain.CMD'), '');

describe('the command line, read back through cmd.exe and the C runtime', () => {
  it.each([
    ['a command cmd runs once', 'unresolved', false],
    ['a batch file, whose `%*` cmd reads twice', 'plain', true],
  ])('%s: every vector comes back as written, with no live operator and no expansion', (_, command, batch) => {
    const reading = read(lineFor(command, ALL, root), batch, ENV);
    expect(reading.live).toEqual([]);
    expect(reading.expanded).toEqual([]);
    expect(reading.argv).toEqual(ALL);
    expect(reading.command).toBe(batch ? join(root, 'plain.CMD') : command);
  });

  it('holds for 3,000 seeded random argument lists, through a batch file and not', () => {
    const next = random(20_261_012);
    for (let n = 0; n < 3000; n++) {
      const args = Array.from({ length: 1 + Math.floor(next() * 4) }, () => Array.from({ length: Math.floor(next() * 12) }, () => ALPHABET[Math.floor(next() * ALPHABET.length)]).join(''));
      for (const [command, batch] of [['unresolved', false], ['plain', true]] as const) {
        const reading = read(lineFor(command, args, root), batch, ENV);
        expect({ n, args, ...reading }).toEqual({ n, args, command: reading.command, argv: args, live: [], expanded: [] });
      }
    }
  });

  it('protects a command path with spaces and every cmd metacharacter in it', () => {
    // cross-spawn's `should handle commands with special shell chars` and `…names of environment variables`.
    for (const name of ['()%!^&;, ', '%CD%']) {
      const reading = read(`"${protectShellToken(`C:\\fixtures\\${name}`)} "`, false, ENV);
      expect(reading).toMatchObject({ command: `C:\\fixtures\\${name}`, live: [], expanded: [] });
    }
  });

  it('refuses what no escaping carries: a line break or NUL, and a variable whose name ends in a caret', () => {
    for (const bad of ['a\nb', 'a\r\nb', '\n&calc', 'nul\0']) {
      expect(isCmdEscapeSafe(bad)).toBe(false);
      expect(() => lineFor('unresolved', [bad], root)).toThrow(/cannot carry a line break or NUL/);
      expect(() => protectShellToken(bad)).toThrow(TypeError);
    }
    expect(() => lineFor('bad\ncommand', [], root)).toThrow(/cannot carry/);
    expect(isCmdEscapeSafe('everything else\t"^&|%!')).toBe(true);
    expect(() => lineFor('unresolved', ['%x^%'], root, { 'x^': 'set' })).toThrow('cmd.exe would expand %x^%, a name ending in a caret');
  });

  it('pins the reader against the attacks it exists to catch', () => {
    // The model is only evidence if it can fail: an unescaped operator, an expansion, a split argument.
    expect(read('"x a&b"', false, ENV).live).toEqual(['&']);
    expect(read('"x ^%PATH:C=1^%"', false, ENV).expanded).toEqual(['PATH']);
    expect(read('"x ^%PATH^:C=1^%"', false, ENV).expanded).toEqual([]);
    expect(read('"x \\"a b\\""', false, ENV).argv).toEqual(['"a', 'b"']);
    expect(crtArgv('"a""b" c\\\\"d e" \\\\\\"f')).toEqual(['a"b', 'c\\d e', '\\"f']);
  });
});

describe('against bellpull’s cross-spawn (cross-spawn’s escape.js)', () => {
  it('quotes for the C runtime as cross-spawn does, except where cross-spawn’s regex drops a backslash', () => {
    const next = random(7);
    const generated = Array.from({ length: 2000 }, () => Array.from({ length: Math.floor(next() * 10) }, () => ALPHABET[Math.floor(next() * ALPHABET.length)]).join(''));
    // cross-spawn's lazy `\\+?` inside an atomic lookahead (its PR #160) captures one backslash
    // of a run, so two or more before a quote are not all doubled and the quote is not escaped:
    // `a\\"b` reads back as `a\\b`, the quote gone and quoting toggled. Everywhere else the bytes
    // are the same; there, only this side reads back as written.
    const run = /\\{2,}(?="|$)/;
    let same = 0;
    for (const value of [...ALL, ...generated]) {
      expect(crtArgv(quoteWindowsArgument(value))).toEqual([value]);
      if (run.test(value)) continue;
      expect(quoteWindowsArgument(value)).toBe(crossSpawnQuote(value));
      same++;
    }
    expect(same).toBeGreaterThan(1900);
    expect(crtArgv(crossSpawnQuote('a\\\\"b'))).toEqual(['a\\\\b']);
    expect(crtArgv(crossSpawnQuote('a\\\\" b'))).toEqual(['a\\\\', 'b']);
    expect(crtArgv(quoteWindowsArgument('a\\\\"b'))).toEqual(['a\\\\"b']);
  });

  it('carets every character cross-spawn does, and decodes to the same text', () => {
    for (const meta of '()][%!^"`<>&|;, *?') expect(protectShellToken(meta)).toBe(`^${meta}`);
    for (const value of ALL) {
      const ours = read(lineFor('unresolved', [value], root), false, ENV);
      const theirs = read(`"${crossSpawnEscapeCommand('unresolved')} ${crossSpawnEscapeArgument(value, false)}"`, false, ENV);
      expect(ours.argv).toEqual(theirs.argv);
    }
    // And for the shim case both escape twice: cross-spawn's `should double escape when executing node_modules/.bin/<file>.cmd`.
    const shim = '"(foo|bar>baz|foz)"';
    expect(read(`"x ${crossSpawnEscapeArgument(shim, true)}"`, true, ENV).argv).toEqual([shim]);
    expect(read(lineFor('plain', [shim], root), true, ENV).argv).toEqual([shim]);
  });

  it('differs on purpose for a batch file outside node_modules/.bin, which cross-spawn escapes once', () => {
    // dotenv 18's `plain.cmd` and `probe.bat` pass `a"quote` and then `a&b`: escaped once, the
    // quote leaves the batch file's second read out of step and the `&` is live there.
    const once = ['a"quote', 'a&b'].map((value) => crossSpawnEscapeArgument(value, false)).join(' ');
    expect(read(`"x ${once}"`, true, ENV).live).toEqual(['&']);
    expect(read(lineFor('plain', ['a"quote', 'a&b'], root), true, ENV)).toMatchObject({ argv: ['a"quote', 'a&b'], live: [] });
  });

  it('carets the colon, which neither cross-spawn nor dotenv 18 does, so no `%name:…%` expands', () => {
    // cmd reads the name up to the colon; uncareted, `PATH` is set and its value lands raw in the line.
    expect(read(`"x ${crossSpawnEscapeArgument('%PATH:C=&calc%', false)}"`, false, ENV).expanded).toEqual(['PATH']);
    expect(read(lineFor('unresolved', ['%PATH:C=&calc%'], root), false, ENV)).toMatchObject({ argv: ['%PATH:C=&calc%'], expanded: [] });
  });
});

describe.skipIf(process.platform !== 'win32')('through the real cmd.exe', () => {
  const dir = scratch('dotenv windows ');
  const bin = join(dir, 'node_modules', '.bin');
  mkdirSync(bin, { recursive: true });
  const script = join(dir, 'print args.cjs');
  writeFileSync(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))');
  const batch = `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`;
  const shim = `@echo off\r\nsetlocal\r\nendlocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "${process.execPath}" "${script}" %*\r\n`;
  writeFileSync(join(bin, 'probe.cmd'), shim);
  writeFileSync(join(dir, 'probe.bat'), batch);
  writeFileSync(join(dir, 'plain.cmd'), batch);
  const canary = join(dir, 'canary');
  // A live `&` anywhere runs this, and the file appears.
  const vectors = [...ALL, `a&echo x>"${canary}"`, `"&echo x>"${canary}"&"`, `%COMSPEC:\\=&echo x>${canary}&%`];

  it.each(['probe', join(bin, 'probe.cmd'), join(dir, 'probe.bat'), join(dir, 'plain.cmd')])('%s gets every vector back exactly', (command) => {
    const env: Record<string, string | undefined> = { ...process.env };
    for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
    env['Path'] = `${bin};${process.env['SystemRoot'] ?? 'C:\\Windows'}\\System32`;
    env['PATHEXT'] = '.COM;.EXE;.BAT;.CMD';
    // Built by `spawnCommand`, then run to completion here so its output can be read.
    const spawned = vi.spyOn(cp, 'spawn').mockReturnValue({ pid: 1 } as unknown as cp.ChildProcess);
    spawnCommand(command, vectors, { cwd: dir, env }, { platform: 'win32', env, cwd: () => dir });
    const [file, args, options] = spawned.mock.calls[0] as [string, string[], cp.SpawnOptions];
    spawned.mockRestore();
    const result = spawnSync(file, args, { ...options, encoding: 'utf8' });
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout) as string[]).toEqual(vectors);
    expect(existsSync(canary)).toBe(false);
  });
});
