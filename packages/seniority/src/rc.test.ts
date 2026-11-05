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
import { pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { discard } from './__fixtures__/scratch-dir.js';
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
  discard(dir);
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

  it('leaves the prototype alone when a config file names it, and drops `constructor` and `prototype` with it', () => {
    const file = join(dir, `.${NAME}rc`);
    writeFileSync(file, '{"__proto__": {"polluted": true}, "constructor": 1, "prototype": 2, "kept": 3}');
    const config = rc(NAME, {}, undefined, parse, { cwd: dir, home: join(dir, 'nowhere') });
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(Object.getPrototypeOf(config)).toBe(Object.prototype);
    expect(config['polluted']).toBeUndefined();
    expect(Object.keys(config)).toEqual(['kept', 'configs', 'config']);
    rmSync(file);
  });

  it('replaces an object with an array or a scalar, and a scalar with an object, and carries a `Date` whole', () => {
    const file = join(dir, `.${NAME}rc`);
    writeFileSync(file, JSON.stringify({ list: [1], scalar: { now: 'object' }, gone: null, obj: 'now a string' }));
    const when = new Date(0);
    const config = rc(NAME, { list: { was: 'object' }, scalar: 1, gone: {}, obj: { was: 'object' }, when }, undefined, parse, { cwd: dir, home: join(dir, 'nowhere') });
    expect(config).toMatchObject({ list: [1], scalar: { now: 'object' }, gone: null, obj: 'now a string' });
    expect(config['when']).toBe(when);
    rmSync(file);
  });

  // A regression: the result shared its nested objects and arrays with `defaults` and `argv`, so
  // changing what `rc()` returned changed the caller's own defaults. `deep-extend` copies them.
  it('returns objects and arrays of its own, so changing the result never changes the defaults or the argv', () => {
    const defaults = { nested: { a: 1 }, list: [{ b: 1 }] };
    const argv = { fromArgv: { c: 1 } };
    const config = rc(NAME, defaults, argv, parse, { env: {}, cwd: join(dir, 'nowhere'), home: '', win: true }) as { nested: { a: number }; list: { b: number }[]; fromArgv: { c: number } };
    config.nested.a = 2;
    config.list[0]!.b = 2;
    config.fromArgv.c = 2;
    expect(defaults).toEqual({ nested: { a: 1 }, list: [{ b: 1 }] });
    expect(argv).toEqual({ fromArgv: { c: 1 } });
  });

  it('strips a block comment holding a `*` or a `/`, and one that opens with `/*/`', () => {
    expect(parse('{/* a * b/c */"a": 1}')).toEqual({ a: 1 });
    expect(parse('{/*/ "x": 1, */"a": 1}')).toEqual({ a: 1 });
  });

  it('reads a lone `*` or `/` outside a comment as text, so the JSON it leaves is refused', () => {
    expect(() => parse('{"a": 1 */* c */}')).toThrow(SyntaxError);
    expect(() => parse('{"a": 1 / 2 */}')).toThrow(SyntaxError);
  });

  it('reads JSON after leading whitespace, and refuses a document whose `{` is not first', () => {
    expect(parse('\n {"a": 1}')).toEqual({ a: 1 });
    const error = thrownBy(() => parse('a = {1}'));
    expect(error).toBeInstanceOf(LoaderError);
    expect((error as LoaderError).extension).toBe('');
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

  // `process.chdir()` throws inside a worker thread. `npm test` runs this package in forks, where
  // the case always runs; Stryker's vitest runner forces the threads pool, and there it is the one
  // case that cannot run, so it is skipped there rather than failing the mutation lane's dry run.
  it.runIf(isMainThread)('skips the four home places when there is no home directory', () => {
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

  it('reads a home directory that is also the working directory once', () => {
    const home = join(dir, 'home-is-cwd');
    mkdirSync(home, { recursive: true });
    const file = join(home, `.${NAME}rc`);
    writeFileSync(file, '{"once": true}');
    expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: home, home })).toEqual({ once: true, configs: [file], config: file });
  });

  it('reads a file named by `argv.config` only when it is a path string, as rc does', () => {
    const file = join(dir, 'argv-url.json');
    writeFileSync(file, '{"read": true}');
    expect(rc(NAME, {}, { config: pathToFileURL(file) }, parse, { ...isolated, cwd: join(dir, 'nowhere') })).not.toHaveProperty('read');
  });

  // A regression: the walk replaced a value with an object to nest into, so `NAME_a=1` was lost
  // when `NAME_a__b` came after it, and kept when it came before. rc keeps the value either way.
  it('keeps a value that a deeper key would nest under, in either order', () => {
    const forward = { [`${NAME}_a`]: '1', [`${NAME}_a__b`]: '2' };
    const backward = { [`${NAME}_a__b`]: '2', [`${NAME}_a`]: '1' };
    const deeper = { [`${NAME}_a`]: '1', [`${NAME}_a__b__c`]: '3' };
    for (const env of [forward, backward, deeper]) expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, 'nowhere'), env })).toEqual({ a: '1' });
    expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, 'nowhere'), env: { [`${NAME}_a__b__c`]: '3', [`${NAME}_a__b`]: '2' } })).toEqual({ a: { b: '2' } });
  });

  it('merges two variables under one parent, and ignores one that is the prefix alone', () => {
    const env = { [`${NAME}_db__host`]: 'h', [`${NAME}_db__port`]: '5', [`${NAME}_`]: 'nothing', [`${NAME}___`]: 'nothing either' };
    expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, 'nowhere'), env })).toEqual({ db: { host: 'h', port: '5' } });
  });

  it('stops the upward walk at sixty-four directories, so a file further up is never read', () => {
    writeFileSync(join(dir, `.${NAME}rc`), '{"tooFar": true}');
    const levels = Array.from({ length: 70 }, (_, i) => `d${String(i)}`);
    const deep = join(dir, ...levels);
    mkdirSync(deep, { recursive: true });
    try {
      expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: deep })).toEqual({});
      expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, 'd0') })).toMatchObject({ tooFar: true });
      // The sixty-fourth directory looked in is the sixty-fourth level up; the sixty-fifth is not.
      expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, ...levels.slice(0, 63)) })).toMatchObject({ tooFar: true });
      expect(rc(NAME, {}, undefined, parse, { ...isolated, cwd: join(dir, ...levels.slice(0, 64)) })).toEqual({});
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

/**
 * rc against a disk that holds exactly `files`, on `platform`, with `/v/home` as the home
 * directory — the only way to put a file in `/etc` without being root.
 */
async function onDisk(files: Record<string, string>, platform: string): Promise<typeof import('./rc.js')> {
  vi.resetModules();
  vi.doMock('node:fs', async (importOriginal) => {
    const real = await importOriginal<typeof import('node:fs')>();
    return {
      ...real,
      existsSync: (path: string) => path in files,
      readFileSync: (path: string) => {
        const content = files[path];
        if (content === undefined) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
        return content;
      },
    };
  });
  vi.doMock('node:os', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:os')>()), homedir: () => '/v/home', platform: () => platform }));
  return import('./rc.js');
}

describe('rc with no process, and a file it cannot read', () => {
  afterEach(() => {
    vi.doUnmock('./runtime.js');
    vi.doUnmock('node:fs');
    vi.doUnmock('node:os');
    vi.resetModules();
  });


  const PLACES = [`/etc/${NAME}/config`, `/etc/${NAME}rc`, `/v/home/.config/${NAME}/config`, `/v/home/.config/${NAME}`, `/v/home/.${NAME}/config`, `/v/home/.${NAME}rc`, `/v/project/.${NAME}rc`];
  /** Every place, each naming itself, so the last one read wins `last` and each leaves its own key. */
  const everywhere = Object.fromEntries(PLACES.map((place, i) => [place, JSON.stringify({ last: place, [`k${String(i)}`]: true })]));

  it("reads rc's seven places in rc's order, the home ones off the home directory, when nothing is passed", async () => {
    const fresh = await onDisk(everywhere, 'linux');
    const config = fresh.rc(NAME, {}, undefined, fresh.parse, { env: {}, cwd: '/v/project' });
    expect(config['configs']).toEqual(PLACES);
    expect(config['last']).toBe(PLACES.at(-1));
  });

  // A regression: `win` defaulted to false everywhere, so Windows read `/etc`. rc skips it there.
  it('skips `/etc` by default on Windows, as rc does, and reads it there when asked to', async () => {
    const fresh = await onDisk(everywhere, 'win32');
    expect(fresh.rc(NAME, {}, undefined, fresh.parse, { env: {}, cwd: '/v/project' })['configs']).toEqual(PLACES.slice(2));
    expect(fresh.rc(NAME, {}, undefined, fresh.parse, { env: {}, cwd: '/v/project', win: false })['configs']).toEqual(PLACES);
  });

  it('skips the four home places when the home directory is empty, rather than reading them relative to here', async () => {
    const relative = Object.fromEntries([`.config/${NAME}/config`, `.config/${NAME}`, `.${NAME}/config`, `.${NAME}rc`].map((place) => [place, '{"fromHere": true}']));
    const fresh = await onDisk(relative, 'linux');
    expect(fresh.rc(NAME, {}, undefined, fresh.parse, { env: {}, cwd: '/v/project', home: '' })).toEqual({});
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
