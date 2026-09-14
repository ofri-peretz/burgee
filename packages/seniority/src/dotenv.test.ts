/** R8 — `seniority/dotenv`: dotenv 17's parse and populate, byte for byte, with its env as an argument (R11). */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { config, parse, populate } from './dotenv.js';

const dir = mkdtempSync(join(tmpdir(), 'seniority-dotenv-'));

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
    const result = config({ path: join(dir, 'nope.env'), processEnv: {} });
    expect(result.parsed).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
  });

  it('refuses to guess the environment: no `processEnv` is a USAGE-class refusal naming it', () => {
    // The one deliberate divergence from dotenv, and the reason is R11: nothing in this
    // package reads `process.*`, so the object to populate arrives as an argument. A caller
    // migrating writes `config({ processEnv: process.env })` — one word, at the one place a
    // program is allowed to own the process.
    expect(() => config({ path: join(dir, '.env') } as never)).toThrow(/processEnv/u);
  });
});
