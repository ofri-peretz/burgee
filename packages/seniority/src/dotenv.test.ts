/** R8 — `seniority/dotenv`: dotenv 17's parse and populate, byte for byte, with its env as an argument (R11). */
import { mkdtempSync, writeFileSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import dotenv, { config, parse, populate } from './dotenv.js';

const dir = mkdtempSync(join(tmpdir(), 'seniority-dotenv-'));

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parse (dotenv 17.4.2)', () => {
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

  it('expands \\n inside double quotes and leaves it alone inside single quotes', () => {
    expect(parse('A="one\\ntwo"')).toEqual({ A: 'one\ntwo' });
    expect(parse("B='one\\ntwo'")).toEqual({ B: 'one\\ntwo' });
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

  it('handles CRLF, because a .env written on Windows is still a .env', () => {
    expect(parse('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });

  it('gives a key with nothing after it at the end of the file the empty string', () => {
    expect(parse('A=1\nB=')).toEqual({ A: '1', B: '' });
  });

  it('leaves a lone quote character as it is rather than unwrapping it', () => {
    expect(parse('A="\nB=`')).toMatchObject({ B: '`' });
  });
});

describe('populate (dotenv 17.4.2)', () => {
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

  it('refuses a target that is not an object, naming the argument', () => {
    expect(() => populate(undefined as unknown as Record<string, string>, { A: '1' })).toThrow('OBJECT_REQUIRED: Please check the processEnv argument being passed to populate');
  });

  /**
   * The check dotenv itself makes, and the one its own suite grades:
   * `returns any errors thrown on passing not json type` calls `populate(process.env, '')` —
   * a perfectly good target and a string where the parsed object should be — and matches the
   * message exactly. Our target guard above never fires for it.
   */
  it('refuses a `parsed` that is not an object, which is the check dotenv makes', () => {
    expect(() => populate({}, '' as unknown as Record<string, string>)).toThrow('OBJECT_REQUIRED: Please check the processEnv argument being passed to populate');
  });

  it('returns what it set, and nothing it left alone', () => {
    expect(populate({ A: 'already' }, { A: 'from-file', B: 'from-file' })).toEqual({ B: 'from-file' });
    expect(populate({ A: 'already' }, { A: 'from-file' }, { override: true })).toEqual({ A: 'from-file' });
  });
});

describe('config takes its environment as an argument (R8 divergence, R11)', () => {
  it('parses a file and populates the object it was given', () => {
    const path = join(dir, '.env');
    writeFileSync(path, 'A=1\nB=2\n');
    const target: Record<string, string | undefined> = {};
    const result = config({ path, processEnv: target });
    expect(result.parsed).toEqual({ A: '1', B: '2' });
    expect(target).toEqual({ A: '1', B: '2' });
  });

  it('reads several files, the earlier one winning, as dotenv does', () => {
    const first = join(dir, '.env.first');
    const second = join(dir, '.env.second');
    writeFileSync(first, 'A=first\n');
    writeFileSync(second, 'A=second\nB=second\n');
    const target: Record<string, string | undefined> = {};
    expect(config({ path: [first, second], processEnv: target }).parsed).toEqual({ A: 'first', B: 'second' });
  });

  it('reports a missing file as `error`, never as a throw — dotenv is loaded at import time', () => {
    // `parsed` is `{}` beside the error, not absent: dotenv 17's `configDotenv` tries every
    // path, remembers the last failure and still returns what did parse (restated 2026-09-23,
    // read off the incumbent's source — this case had pinned the divergence).
    const result = config({ path: join(dir, 'nope.env'), processEnv: {} });
    expect(result.parsed).toEqual({});
    expect(result.error).toBeInstanceOf(Error);
  });

  it('populates the process environment when given none, as dotenv does (D-135)', () => {
    // Restated 2026-09-23. This case used to assert the opposite — a bare `config()` refused,
    // naming `processEnv` — because R11 kept every file in seniority away from the process.
    // D-135 opened one seam, `runtime.ts`, for the drop-in façades only: dotenv's own suite
    // asserts `process.env.BASIC` after a bare `config()` in 34 cases, and a drop-in that makes
    // every migrating caller add an argument is not a drop-in. The resolver stays pure.
    const key = `SENIORITY_D131_${String(process.pid)}`;
    const path = join(dir, 'ambient.env');
    writeFileSync(path, `${key}=from-file\n`);
    try {
      expect(config({ path }).parsed).toEqual({ [key]: 'from-file' });
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
    expect(config({ path: pathToFileURL(join(home, '.env.home')), processEnv: {} }).parsed).toEqual({ H: 'home' });
  });

  it('reads `.env` in the working directory when given no path', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'seniority-dotenv-cwd-'));
    writeFileSync(join(cwd, '.env'), 'W=cwd\n');
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    expect(config({ processEnv: {} }).parsed).toEqual({ W: 'cwd' });
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
});

/** What `console.log` was handed, while it is spied on. */
const logged = (): string[] => (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => String(c[0]));

/** A fresh copy of the module over a runtime with no process, whose working directory is `cwd`. */
async function fresh(cwd: string | undefined): Promise<typeof import('./dotenv.js')> {
  vi.resetModules();
  vi.doMock('./runtime.js', () => ({ ambientEnv: () => undefined, ambientCwd: () => cwd }));
  return await import('./dotenv.js');
}

describe('debug output (dotenv’s `_debug`)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('says whether an already-defined key was overwritten, only when asked', () => {
    populate({ A: 'held' }, { A: 'file' }, { debug: true });
    populate({ A: 'held' }, { A: 'file' }, { debug: true, override: true });
    populate({ A: 'held' }, { A: 'file' });
    populate({}, { A: 'file' }, { debug: true });
    expect(logged()).toEqual(['[seniority/dotenv][DEBUG] "A" is already defined and was NOT overwritten', '[seniority/dotenv][DEBUG] "A" is already defined and WAS overwritten']);
  });

  it('notes the default encoding, and each file that failed, when `debug` is on', () => {
    const missing = join(dir, 'missing.env');
    config({ path: missing, processEnv: {}, debug: true });
    const lines = logged();
    expect(lines[0]).toBe('[seniority/dotenv][DEBUG] no encoding is specified (UTF-8 is used by default)');
    expect(lines[1]).toMatch(new RegExp(`^\\[seniority/dotenv\\]\\[DEBUG\\] failed to load ${missing.replaceAll('\\', '\\\\')} ENOENT`));
    expect(lines).toHaveLength(2);
  });

  it('says nothing about encoding when one was given', () => {
    const path = join(dir, '.env.enc');
    writeFileSync(path, 'E=1\n');
    config({ path, processEnv: {}, debug: true, encoding: 'utf8' });
    expect(logged()).toEqual([]);
  });

  it('reads `DOTENV_CONFIG_DEBUG` from the environment first, as dotenv parses a boolean', () => {
    const missing = join(dir, 'missing.env');
    config({ path: missing, processEnv: { DOTENV_CONFIG_DEBUG: 'true' } });
    expect(logged()).toHaveLength(2);
    for (const off of ['false', '0', 'no', 'OFF', '']) config({ path: missing, processEnv: { DOTENV_CONFIG_DEBUG: off }, debug: true });
    expect(logged()).toHaveLength(2);
    config({ path: missing, processEnv: {}, debug: 'yes' });
    expect(logged()).toHaveLength(4);
  });
});

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

  it('reads `./.env` relative to wherever it is, when there is no working directory to ask', async () => {
    const { config: bare } = await fresh(undefined);
    const result = bare({ processEnv: {} });
    expect((result.error as NodeJS.ErrnoException | undefined)?.path).toBe('.env');
  });
});
