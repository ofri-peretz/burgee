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
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

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

  it('keeps an escaped quote inside a string, so what follows it is still the string', () => {
    expect(parse('{"a": "say \\"hi\\" // not a comment", "b": "back\\\\"} // a comment')).toEqual({ a: 'say "hi" // not a comment', b: 'back\\' });
    // One escaped quote, unbalanced: read as a closing quote, the `//` after it would start a comment.
    expect(parse('{"a": "q\\" // kept"}')).toEqual({ a: 'q" // kept' });
  });
});

describe('the places rc reads, and the ones it may not', () => {
  const isolated = { env: {}, home: '', win: true };

  it('reads a file named by `<name>_config` in the environment, and one named by `argv.config`, the latter last', () => {
    const fromEnv = join(dir, 'from-env.json');
    const fromArgv = join(dir, 'from-argv.json');
    writeFileSync(fromEnv, '{"who": "env file", "envOnly": 1}');
    writeFileSync(fromArgv, '{"who": "argv file"}');
    const config = rc(NAME, {}, { config: fromArgv }, parse, { ...isolated, cwd: join(dir, 'nowhere'), env: { [`${NAME}_config`]: fromEnv } });
    expect(config).toMatchObject({ who: 'argv file', envOnly: 1, configs: [fromEnv, fromArgv], config: fromArgv });
  });

  it('skips the four home places when there is no home directory', () => {
    const home = join(dir, 'home-skipped');
    mkdirSync(home, { recursive: true });
    writeFileSync(join(home, `.${NAME}rc`), '{"fromHome": true}');
    // Run from inside that directory: a home of `''` joined onto `.rctestrc` is a relative path,
    // and it would resolve right here if the empty home were not skipped outright.
    const previous = process.cwd();
    process.chdir(home);
    try {
      expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, 'nowhere') })).toEqual({});
    } finally {
      process.chdir(previous);
    }
    expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, 'nowhere'), home })).toMatchObject({ fromHome: true });
  });

  it('merges two variables under one parent, and ignores one that is the prefix alone', () => {
    const env = { [`${NAME}_db__host`]: 'h', [`${NAME}_db__port`]: '5', [`${NAME}_`]: 'nothing', [`${NAME}___`]: 'nothing either' };
    expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, 'nowhere'), env })).toEqual({ db: { host: 'h', port: '5' } });
  });

  it('stops the upward walk at sixty-four directories, so a file further up is never read', () => {
    writeFileSync(join(dir, `.${NAME}rc`), '{"tooFar": true}');
    const deep = join(dir, ...Array.from({ length: 70 }, (_, i) => `d${String(i)}`));
    mkdirSync(deep, { recursive: true });
    try {
      expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: deep })).toEqual({});
      expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, 'd0') })).toMatchObject({ tooFar: true });
    } finally {
      rmSync(join(dir, `.${NAME}rc`));
    }
  });

  it('defaults the defaults, the argv, the directory and the home, and reads the process environment (D-135)', () => {
    const key = `seniority_rc_${String(process.pid)}`;
    process.env[`${key}_fromProcess`] = 'yes';
    try {
      expect(rc(key)).toEqual({ fromProcess: 'yes' });
    } finally {
      delete process.env[`${key}_fromProcess`];
    }
  });
});

describe('rc with no process, and a file it cannot read', () => {
  afterEach(() => {
    vi.doUnmock('./runtime.js');
    vi.doUnmock('node:fs');
    vi.resetModules();
  });

  it('reads no environment on a runtime with no process', async () => {
    vi.resetModules();
    vi.doMock('./runtime.js', () => ({ ambientEnv: () => undefined, ambientCwd: () => undefined }));
    const fresh = await import('./rc.js');
    expect(fresh.rc(NAME, { d: 1 }, undefined, fresh.parse, { cwd: join(dir, 'nowhere'), home: '', win: true })).toEqual({ d: 1 });
  });

  it('swallows a file that exists but cannot be read, as rc does, and reads the rest', async () => {
    const unreadable = join(dir, 'unreadable.json');
    const readable = join(dir, 'readable.json');
    writeFileSync(unreadable, '{"never": true}');
    writeFileSync(readable, '{"read": true}');
    vi.resetModules();
    vi.doMock('node:fs', async (importOriginal) => {
      const real = await importOriginal<typeof import('node:fs')>();
      return {
        ...real,
        readFileSync: (path: string, encoding: BufferEncoding) => {
          if (path === unreadable) throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
          return real.readFileSync(path, encoding);
        },
      };
    });
    const fresh = await import('./rc.js');
    const config = fresh.rc(NAME, {}, { config: readable }, fresh.parse, { cwd: join(dir, 'nowhere'), home: '', win: true, env: { [`${NAME}_config`]: unreadable } });
    expect(config).toEqual({ read: true, configs: [readable], config: readable });
  });
});
