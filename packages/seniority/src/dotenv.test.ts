/** R8 — `seniority/dotenv`: dotenv 18's parse, populate and config, byte for byte. */
import fs, { mkdtempSync, writeFileSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import path, { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { optionsFromEnv, truthy } from './dotenv-options.js';
import { parseFast } from './dotenv-scan.js';
import dotenv, { config, configDotenv, parse, populate } from './dotenv.js';

// The scanner, watched: `{ fast }` must route to it and nothing else may.
vi.mock('./dotenv-scan.js', async (original) => {
  const real = await original<typeof import('./dotenv-scan.js')>();
  return { parseFast: vi.fn(real.parseFast) };
});

const dir = mkdtempSync(join(tmpdir(), 'seniority-dotenv-'));

/** Every `DOTENV_*` / `DOTENV_CONFIG_*` name, cleared around each case so the shell running the tests cannot steer one. */
const ENV_NAMES = ['ENCODING', 'PATH', 'QUIET', 'DEBUG', 'OVERRIDE', 'FAST'].flatMap((n) => [`DOTENV_${n}`, `DOTENV_CONFIG_${n}`]);
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_NAMES.map((k) => [k, process.env[k]]));
  for (const k of ENV_NAMES) delete process.env[k];
  // The `◇ injected env` line, which every un-quiet `config()` prints; cases that read it re-spy.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.mocked(parseFast).mockClear();
});

afterEach(() => {
  for (const k of ENV_NAMES) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

/** What a spied console method was handed. */
const calls = (method: 'log' | 'error'): string[] => (console[method] as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));
const logged = (): string[] => calls('log');

describe('parse (dotenv 18.0.5, the regular expression)', () => {
  it('reads the plain case', () => {
    expect(parse('BASIC=basic')).toEqual({ BASIC: 'basic' });
  });

  it('ignores comments, blank lines and a line with no equals', () => {
    expect(parse('# a comment\n\nA=1\nnot a pair\nB=2 # trailing')).toEqual({ A: '1', B: '2' });
  });

  it('accepts `export` and a colon separator, because real .env files carry both', () => {
    expect(parse('export A=1\nB: 2')).toEqual({ A: '1', B: '2' });
  });

  it('keeps a `#` that is inside quotes', () => {
    expect(parse('A="not # a comment"')).toEqual({ A: 'not # a comment' });
  });

  it('expands \\n and \\r inside double quotes and leaves them alone inside single quotes and backticks', () => {
    expect(parse('A="one\\ntwo\\rthree"')).toEqual({ A: 'one\ntwo\rthree' });
    expect(parse("B='one\\ntwo'")).toEqual({ B: 'one\\ntwo' });
    expect(parse('C=`one\\ntwo`')).toEqual({ C: 'one\\ntwo' });
  });

  /**
   * dotenv 18's suite pins this (issue #1043): the expansion follows the *opening* quote, so an
   * unterminated double-quoted value keeps its quote and still expands. Before 18 this package
   * expanded only a value whose quotes matched, which no test of dotenv 17 reached.
   */
  it('expands an unterminated double-quoted value, keeping its quote', () => {
    expect(parse('KEY="line one\\nline two')).toEqual({ KEY: '"line one\nline two' });
    expect(parse('KEY="line one\\rline two')).toEqual({ KEY: '"line one\rline two' });
    expect(parse("KEY='line one\\nline two")).toEqual({ KEY: "'line one\\nline two" });
  });

  it('keeps a multi-line value written across lines in quotes', () => {
    expect(parse('A="one\ntwo"')).toEqual({ A: 'one\ntwo' });
  });

  it('trims unquoted whitespace and keeps quoted whitespace', () => {
    expect(parse('A=   spaced   \nB="   spaced   "')).toEqual({ A: 'spaced', B: '   spaced   ' });
  });

  it('gives an empty value its empty string rather than dropping the key', () => {
    expect(parse('A=\nB=""')).toEqual({ A: '', B: '' });
  });

  it('reads a Buffer as well as a string, which is how `config` hands it over', () => {
    expect(parse(Buffer.from('A=1'))).toEqual({ A: '1' });
  });

  it('handles CRLF and a lone CR, because a .env written on Windows is still a .env', () => {
    expect(parse('A=1\r\nB=2\rC=3\r\n')).toEqual({ A: '1', B: '2', C: '3' });
  });

  it('gives a key with nothing after it at the end of the file the empty string', () => {
    expect(parse('A=1\nB=')).toEqual({ A: '1', B: '' });
  });

  it('leaves a lone quote character as it is rather than unwrapping it', () => {
    expect(parse('A="\nB=`')).toMatchObject({ B: '`' });
  });

  it('keeps `__proto__` as an entry rather than a prototype write', () => {
    const out = parse('__proto__=polluted');
    // eslint-disable-next-line conventions/consistent-existence-index-check -- `in` cannot ask this: `'__proto__' in {}` is true for every object, through the inherited accessor. Only an own entry proves the key was kept rather than written to the prototype.
    expect(Object.hasOwn(out, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
  });

  it('parses the same file the same way twice — no state left on the pattern', () => {
    const src = 'A=1\nB=2\n';
    expect(parse(src)).toEqual(parse(src));
  });
});

describe('parse({ fast }) routes to the scanner, and only then', () => {
  it.each([
    [{ fast: true }, true],
    [{ fast: 'yes' }, true],
    [{ fast: 'false' }, false],
    [{ fast: false }, false],
    [{}, false],
    [undefined, false],
  ] as const)('%j → scanner: %s', (options, used) => {
    expect(parse('A=1', options)).toEqual({ A: '1' });
    expect(vi.mocked(parseFast).mock.calls.length > 0).toBe(used);
  });
});

describe('populate (dotenv 18.0.5)', () => {
  it('sets what is missing and leaves what is already there', () => {
    const target: Record<string, string | undefined> = { A: 'already' };
    populate(target, { A: 'from-file', B: 'from-file' });
    expect(target).toEqual({ A: 'already', B: 'from-file' });
  });

  it('overwrites under `override`', () => {
    const target: Record<string, string | undefined> = { A: 'already' };
    populate(target, { A: 'from-file' }, { override: true });
    expect(target).toEqual({ A: 'from-file' });
  });

  it.each([
    ['an undefined target', undefined, { A: '1' }],
    ['a null target', null, { A: '1' }],
    ['a string target', 'env', { A: '1' }],
    ['a string `parsed`', {}, ''],
    ['a null `parsed`', {}, null],
  ])('refuses %s with dotenv’s own OBJECT_REQUIRED', (_, target, parsed) => {
    let caught: unknown;
    try {
      populate(target as Record<string, string>, parsed as Record<string, string>);
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toBe('OBJECT_REQUIRED: Please check the processEnv argument being passed to populate');
    expect((caught as { code?: string }).code).toBe('OBJECT_REQUIRED');
  });

  it('returns what it set, and nothing it left alone', () => {
    expect(populate({ A: 'already' }, { A: 'from-file', B: 'from-file' })).toEqual({ B: 'from-file' });
    expect(populate({ A: 'already' }, { A: 'from-file' }, { override: true })).toEqual({ A: 'from-file' });
  });

  it('treats a key that is only inherited as absent, so `toString` can be set', () => {
    const target: Record<string, string | undefined> = {};
    expect(populate(target, { toString: 'x' })).toEqual({ toString: 'x' });
  });
});

describe('config', () => {
  it('parses a file and populates the object it was given', () => {
    const file = join(dir, '.env');
    writeFileSync(file, 'A=1\nB=2\n');
    const target: Record<string, string | undefined> = {};
    const result = config({ path: file, processEnv: target });
    expect(result).toEqual({ parsed: { A: '1', B: '2' } });
    expect(target).toEqual({ A: '1', B: '2' });
  });

  it('reads several files, the earlier one winning, as dotenv does', () => {
    const first = join(dir, '.env.first');
    const second = join(dir, '.env.second');
    writeFileSync(first, 'A=first\n');
    writeFileSync(second, 'A=second\nB=second\n');
    expect(config({ path: [first, second], processEnv: {} }).parsed).toEqual({ A: 'first', B: 'second' });
  });

  it('lets a later file win under `override`, because each file is populated with the caller’s options', () => {
    const first = join(dir, '.env.o1');
    const second = join(dir, '.env.o2');
    writeFileSync(first, 'A=first\n');
    writeFileSync(second, 'A=second\n');
    const target: Record<string, string | undefined> = { A: 'held' };
    expect(config({ path: [first, second], processEnv: target, override: true }).parsed).toEqual({ A: 'second' });
    expect(target).toEqual({ A: 'second' });
  });

  it('reports a missing file as `error` beside what did parse, never as a throw', () => {
    const good = join(dir, '.env.good');
    writeFileSync(good, 'G=1\n');
    const result = config({ path: [good, join(dir, 'nope.env')], processEnv: {} });
    expect(result.parsed).toEqual({ G: '1' });
    expect((result.error as NodeJS.ErrnoException).code).toBe('ENOENT');
  });

  it('populates the process environment when given none, as dotenv does (D-135)', () => {
    const key = `SENIORITY_D131_${String(process.pid)}`;
    const file = join(dir, 'ambient.env');
    writeFileSync(file, `${key}=from-file\n`);
    try {
      expect(config({ path: file }).parsed).toEqual({ [key]: 'from-file' });
      expect(process.env[key]).toBe('from-file');
    } finally {
      delete process.env[key];
    }
  });

  it('expands a leading `~` to the home directory, and reads a URL as a path', () => {
    const home = mkdtempSync(join(tmpdir(), 'seniority-dotenv-home-'));
    writeFileSync(join(home, '.env.home'), 'H=home\n');
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    expect(config({ path: '~/.env.home', processEnv: {} }).parsed).toEqual({ H: 'home' });
    expect(config({ path: ['~/.env.home'], processEnv: {} }).parsed).toEqual({ H: 'home' });
    expect(config({ path: pathToFileURL(join(home, '.env.home')), processEnv: {} }).parsed).toEqual({ H: 'home' });
  });

  it('reads `.env` in the working directory when given no path, or an empty one', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'seniority-dotenv-cwd-'));
    writeFileSync(join(cwd, '.env'), 'W=cwd\n');
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    expect(config({ processEnv: {} }).parsed).toEqual({ W: 'cwd' });
    expect(config({ path: '', processEnv: {} }).parsed).toEqual({ W: 'cwd' });
  });

  it('reads with the encoding it is given, and UTF-8 when given none or an empty one', () => {
    const file = join(dir, '.env.latin1');
    writeFileSync(file, Buffer.from('L=café\n', 'latin1'));
    expect(config({ path: file, processEnv: {}, encoding: 'latin1' }).parsed).toEqual({ L: 'café' });
    const read = vi.spyOn(fs, 'readFileSync');
    config({ path: file, processEnv: {}, encoding: '' as BufferEncoding });
    config({ path: file, processEnv: {} });
    expect(read.mock.calls.map((c) => c[1])).toEqual([{ encoding: 'utf8' }, { encoding: 'utf8' }]);
  });

  it('hands `fast` to `parse`', () => {
    const file = join(dir, '.env.fast');
    writeFileSync(file, 'F=1\n');
    config({ path: file, processEnv: {}, fast: true });
    expect(parseFast).toHaveBeenCalledTimes(1);
  });

  it('turns a non-Error thrown while reading into an Error, and keeps going', () => {
    const good = join(dir, '.env.after-throw');
    writeFileSync(good, 'G=1\n');
    let first = true;
    vi.spyOn(dotenv, 'parse').mockImplementation((src) => {
      if (first) {
        first = false;
        throw 'not an error';
      }
      return parse(src);
    });
    const result = config({ path: [good, good], processEnv: {} });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('not an error');
    expect(result.parsed).toEqual({ G: '1' });
  });

  it('goes through the module object, so a stub of `configDotenv` is what `config` runs', () => {
    const stub = vi.spyOn(dotenv, 'configDotenv').mockReturnValue({ parsed: { STUBBED: '1' } });
    expect(config({ processEnv: {} })).toEqual({ parsed: { STUBBED: '1' } });
    expect(stub).toHaveBeenCalledWith({ processEnv: {} });
    expect(configDotenv).not.toBe(config);
  });
});

describe('the `◇ injected env` line', () => {
  const file = join(dir, '.env.line');
  beforeEach(() => {
    writeFileSync(file, 'L1=a\nL2=b\n');
  });

  it('is dotenv’s exact line on `console.error`, counting what was set and naming the path relative to the cwd', () => {
    config({ path: file, processEnv: { L1: 'held' } });
    expect(calls('error')).toEqual([`◇ injected env (1) from ${relative(process.cwd(), file)}`]);
  });

  it('joins several paths with a bare comma, and names a URL by its file', () => {
    config({ path: [file, pathToFileURL(file) as unknown as string], processEnv: {} });
    const short = relative(process.cwd(), file);
    expect(calls('error')).toEqual([`◇ injected env (2) from ${short},${short}`]);
  });

  it.each([
    ['explicit quiet', { quiet: true }, {}, {}, false],
    ['explicit quiet as a string', { quiet: 'true' }, {}, {}, false],
    ['explicit quiet: false', { quiet: false }, {}, {}, true],
    ['quiet present but undefined', { quiet: undefined }, {}, {}, true],
    ['the shell’s DOTENV_QUIET', {}, { DOTENV_QUIET: 'true' }, {}, false],
    ['the shell’s legacy DOTENV_CONFIG_QUIET', {}, { DOTENV_CONFIG_QUIET: '1' }, {}, false],
    ['the shell’s false over the file’s true', {}, { DOTENV_QUIET: 'false' }, { DOTENV_QUIET: 'true' }, true],
    ['the file’s own DOTENV_QUIET', {}, {}, { DOTENV_QUIET: 'true' }, false],
    ['explicit false over the file’s true', { quiet: false }, {}, { DOTENV_QUIET: 'true' }, true],
    ['debug, which logs even when quiet', { quiet: true, debug: true }, {}, {}, true],
    // eslint-disable-next-line maintainability/max-parameters -- one parameter per column of the table above, which is how `it.each` hands a row over.
  ] as const)('%s', (_, options, shell, processEnv, printed) => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    Object.assign(process.env, shell);
    config({ path: file, processEnv: { ...processEnv }, ...options });
    expect(calls('error')).toHaveLength(printed ? 1 : 0);
  });

  it('records a failure to shorten a path as the error, and says so under debug', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(path, 'relative').mockImplementation(() => {
      throw new Error('fail');
    });
    const result = config({ path: file, processEnv: {}, debug: true });
    expect(result.error?.message).toBe('fail');
    expect(result.parsed).toEqual({ L1: 'a', L2: 'b' });
    expect(logged()).toContain(`┆ failed to load ${file} fail`);
    expect(calls('error')).toEqual(['◇ injected env (2) from ']);
  });

  it('records a failure to shorten a path silently without debug', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(path, 'relative').mockImplementation(() => {
      throw 'not an error';
    });
    expect(config({ path: file, processEnv: {} }).error?.message).toBe('not an error');
    expect(logged()).toEqual([]);
  });
});

describe('optionsFromEnv (dotenv’s `lib/config-options`)', () => {
  it.each(['ENCODING', 'PATH'])('%s stays a string, the shorter name wins, and empty is a value', (name) => {
    const key = name.toLowerCase();
    expect(optionsFromEnv({})).toEqual({});
    expect(optionsFromEnv({ [`DOTENV_CONFIG_${name}`]: 'legacy' })).toEqual({ [key]: 'legacy' });
    expect(optionsFromEnv({ [`DOTENV_CONFIG_${name}`]: 'legacy', [`DOTENV_${name}`]: 'current' })).toEqual({ [key]: 'current' });
    expect(optionsFromEnv({ [`DOTENV_CONFIG_${name}`]: 'legacy', [`DOTENV_${name}`]: '' })).toEqual({ [key]: '' });
  });

  it.each(['QUIET', 'DEBUG', 'OVERRIDE', 'FAST'])('%s is read as a boolean, the shorter name winning, `false` and empty included', (name) => {
    const key = name.toLowerCase();
    expect(optionsFromEnv({ [`DOTENV_CONFIG_${name}`]: 'true' })).toEqual({ [key]: true });
    expect(optionsFromEnv({ [`DOTENV_CONFIG_${name}`]: 'true', [`DOTENV_${name}`]: 'false' })).toEqual({ [key]: false });
    expect(optionsFromEnv({ [`DOTENV_${name}`]: '' })).toEqual({ [key]: false });
  });

  it('reads the process’s own environment when handed none', () => {
    process.env['DOTENV_OVERRIDE'] = 'yes';
    expect(optionsFromEnv()).toEqual({ override: true });
  });
});

describe('config takes its defaults from DOTENV_* (dotenv 18)', () => {
  const local = join(dir, '.env.defaults');
  beforeEach(() => {
    writeFileSync(local, 'BASIC=local_basic\n');
  });

  it('uses the environment’s path, quiet and override when the caller gives none', () => {
    Object.assign(process.env, { DOTENV_CONFIG_PATH: local, DOTENV_CONFIG_QUIET: 'true', DOTENV_CONFIG_OVERRIDE: 'true' });
    const processEnv: Record<string, string | undefined> = { BASIC: 'existing' };
    config({ processEnv });
    expect(processEnv['BASIC']).toBe('local_basic');
    expect(calls('error')).toEqual([]);
  });

  it('lets an explicit option outrank every one of them', () => {
    Object.assign(process.env, { DOTENV_PATH: join(dir, 'missing.env'), DOTENV_QUIET: 'true', DOTENV_OVERRIDE: 'true' });
    const processEnv: Record<string, string | undefined> = { BASIC: 'existing' };
    config({ path: local, quiet: false, override: false, processEnv });
    expect(processEnv['BASIC']).toBe('existing');
    expect(calls('error')).toHaveLength(1);
  });
});

describe('debug output (dotenv’s `_debug`, behind `┆`)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('says whether an already-defined key was overwritten, only when asked', () => {
    populate({ A: 'held' }, { A: 'file' }, { debug: true });
    populate({ A: 'held' }, { A: 'file' }, { debug: true, override: true });
    populate({ A: 'held' }, { A: 'file' });
    populate({}, { A: 'file' }, { debug: true });
    expect(logged()).toEqual(['┆ "A" is already defined and was NOT overwritten', '┆ "A" is already defined and WAS overwritten']);
  });

  it('notes the default encoding, and each file that failed, when `debug` is on', () => {
    const missing = join(dir, 'missing.env');
    config({ path: missing, processEnv: {}, debug: true });
    const lines = logged();
    expect(lines[0]).toBe('┆ no encoding is specified (UTF-8 is used by default)');
    expect(lines[1]).toMatch(new RegExp(`^┆ failed to load ${missing.replaceAll('\\', '\\\\')} ENOENT`));
    expect(lines).toHaveLength(2);
  });

  it('says nothing about encoding when one was given', () => {
    const file = join(dir, '.env.enc');
    writeFileSync(file, 'E=1\n');
    config({ path: file, processEnv: {}, debug: true, encoding: 'utf8' });
    expect(logged()).toEqual([]);
  });

  it('reads `DOTENV_DEBUG` from the environment, and an explicit option over it, as dotenv parses a boolean', () => {
    const missing = join(dir, 'missing.env');
    process.env['DOTENV_DEBUG'] = 'true';
    config({ path: missing, processEnv: {} });
    expect(logged()).toHaveLength(2);
    for (const off of ['false', '0', 'no', 'OFF', '']) config({ path: missing, processEnv: {}, debug: off });
    expect(logged()).toHaveLength(2);
    delete process.env['DOTENV_DEBUG'];
    config({ path: missing, processEnv: {}, debug: 'yes' });
    expect(logged()).toHaveLength(4);
  });
});

describe('truthy (dotenv’s `parseBoolean`)', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    ['anything', true],
    ['false', false],
    ['FALSE', false],
    ['0', false],
    ['no', false],
    ['Off', false],
    ['', false],
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    [undefined, false],
  ] as const)('%j → %s', (value, expected) => {
    expect(truthy(value)).toBe(expected);
  });
});

/** A fresh copy of the module over a runtime with no process, whose working directory is `cwd`. */
async function fresh(cwd: string | undefined): Promise<typeof import('./dotenv.js')> {
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({ ambientEnv: () => undefined, ambientCwd: () => cwd }));
  return await import('./dotenv.js');
}

describe('dotenv with no process', () => {
  afterEach(() => {
    vi.doUnmock('./runtime.js');
    vi.resetModules();
  });

  it('refuses a bare `config()` by name, since there is no environment to write into', async () => {
    const { config: bare } = await fresh(undefined);
    let caught: unknown;
    try {
      bare();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('seniority/dotenv has no environment to populate');
    expect((caught as { hint?: string }).hint).toMatch(/^pass processEnv/);
  });

  it('reads `.env` relative to `.`, when there is no working directory to ask', async () => {
    const { config: bare } = await fresh(undefined);
    // Asked of `fs` rather than read off the error: Windows reports the path it resolved, and a
    // stub keeps a stray `.env` in the checkout from answering.
    const read = vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw Object.assign(new Error('ENOENT: forced'), { code: 'ENOENT' });
    });
    expect(bare({ processEnv: {}, quiet: true }).error?.message).toBe('ENOENT: forced');
    expect(read.mock.calls.map((call) => call[0])).toEqual([resolve('.env')]);
  });

  it('reads no DOTENV_* defaults, since there is no environment to read them from', async () => {
    await fresh(undefined);
    const { optionsFromEnv: bare } = await import('./dotenv-options.js');
    process.env['DOTENV_QUIET'] = 'true';
    expect(bare()).toEqual({});
  });
});
