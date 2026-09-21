/**
 * R8 — `seniority/rc`: rc 1.2.8's merge, with its world as an argument (R11).
 *
 * The three blocks below are **rc's own `test/test.js`, case for case**, with one change: the
 * environment is passed in rather than read off the process. That is the whole of the
 * divergence, and running the vendored file proves it — `npm run compat -- rc` fails at
 * `test.js:14`, `assert.equal(config.envOption, 42)`, having already passed line 13. This
 * file is that same assertion with the environment supplied, so what the compat row measures
 * as a zero is measured here as a pass, and the difference between the two numbers is R11 and
 * nothing else.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { LoaderError } from './load.js';
import { parse, rc } from './rc.js';

/** The thrown value, so a test can assert on a property of it rather than only on its message. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (cause) {
    return cause;
  }
}

const dir = mkdtempSync(join(tmpdir(), 'seniority-rc-'));
const NAME = 'rctest';

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("rc's own test/test.js, with the environment as an argument", () => {
  it('reads the environment over the defaults', () => {
    const config = rc(NAME, { option: true }, undefined, parse, { env: { [`${NAME}_envOption`]: '42' }, cwd: dir, home: dir });
    expect(config['option']).toBe(true);
    expect(config['envOption']).toBe('42');
  });

  it('lets a nopt-shaped argv outrank the environment', () => {
    const config = rc(NAME, { option: true }, { option: false, envOption: 24, argv: { remain: [], cooked: ['--no-option', '--envOption', '24'], original: ['--no-option', '--envOption=24'] } }, parse, {
      env: { [`${NAME}_envOption`]: '42' },
      cwd: dir,
      home: dir,
    });
    expect(config['option']).toBe(false);
    expect(config['envOption']).toBe(24);
  });

  it('reads a JSON file with comments, and reports which file it read', () => {
    const file = join(dir, `.${NAME}rc`);
    writeFileSync(file, ['{', '// json overrides default', '"option": false,', '/* env overrides json */', '"envOption": 24', '}'].join('\n'));
    const config = rc(NAME, { option: true }, undefined, parse, { env: { [`${NAME}_envOption`]: '42' }, cwd: dir, home: join(dir, 'nowhere') });
    expect(config['option']).toBe(false);
    expect(config['envOption']).toBe('42');
    expect(config['config']).toBe(file);
    expect(config['configs']).toEqual([file]);
    rmSync(file);
  });
});

describe('the parts of rc that are seniority rather than the process', () => {
  it('nests on `__` and drops empty segments', () => {
    const config = rc(NAME, {}, undefined, parse, { env: { [`${NAME}_a__b__c`]: '1', [`${NAME}_plain`]: 'x', OTHER_a: 'no' }, cwd: dir, home: join(dir, 'nowhere') });
    expect(config).toEqual({ a: { b: { c: '1' } }, plain: 'x' });
  });

  it('takes a JSON string as its defaults, the way rc README does', () => {
    expect(rc(NAME, '{"a": 1}', undefined, parse, { cwd: dir, home: join(dir, 'nowhere') })['a']).toBe(1);
  });

  it('refuses a name that is not a string, in rc\'s words', () => {
    expect(() => rc(undefined as unknown as string)).toThrow('rc(name): name *must* be string');
  });

  it('refuses an INI document by name, and its hint names the argument that would parse it', () => {
    expect(() => parse('a = 1\n')).toThrow(/no INI parser/);
    // `USAGE`, not `CONFIG`: the file may be perfectly good INI, and what is missing is a
    // parser the program never supplied — the same class `loadYaml` refuses YAML with.
    const error = thrownBy(() => parse('a = 1\n'));
    expect(error).toBeInstanceOf(LoaderError);
    expect((error as LoaderError).hint).toMatch(/rc\(name, defaults, argv, ini\.parse\)/);
  });

  it('accepts a caller-supplied parser in rc\'s fourth position', () => {
    const file = join(dir, `.${NAME}rc`);
    writeFileSync(file, 'option = false\n');
    const config = rc(NAME, { option: true }, undefined, (content) => Object.fromEntries(content.trim().split('\n').map((line) => line.split(' = ').map((s) => s.trim()) as [string, string])), {
      cwd: dir,
      home: join(dir, 'nowhere'),
    });
    expect(config['option']).toBe('false');
    rmSync(file);
  });

  it('merges plain objects and replaces arrays, which is `deep-extend`', () => {
    const file = join(dir, `.${NAME}rc`);
    writeFileSync(file, JSON.stringify({ nested: { kept: 1 }, list: [3, 4] }));
    const config = rc(NAME, { nested: { fromDefault: 0 }, list: [1, 2] }, undefined, parse, { cwd: dir, home: join(dir, 'nowhere') });
    expect(config['nested']).toEqual({ fromDefault: 0, kept: 1 });
    expect(config['list']).toEqual([3, 4]);
    rmSync(file);
  });

  it('leaves the prototype alone when a config file names it', () => {
    const file = join(dir, `.${NAME}rc`);
    writeFileSync(file, '{"__proto__": {"polluted": true}}');
    rc(NAME, {}, undefined, parse, { cwd: dir, home: join(dir, 'nowhere') });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    rmSync(file);
  });

  it('strips comments without touching a `//` inside a string', () => {
    expect(parse('{"url": "https://x.example/a", // trailing\n "b": 1 /* block */ }')).toEqual({ url: 'https://x.example/a', b: 1 });
  });

  it('reads no file when there is none, and then reports no `config`', () => {
    const empty = rc(NAME, { only: 'default' }, undefined, parse, { cwd: join(dir, 'nowhere'), home: join(dir, 'nowhere'), win: true });
    expect(empty).toEqual({ only: 'default' });
  });
});
