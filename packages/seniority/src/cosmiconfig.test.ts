/**
 * `seniority/cosmiconfig`, driven in this process.
 *
 * The public grade is cosmiconfig's own suite through `compat-oracle` (186 / 243 on ubuntu;
 * the 57 short are the YAML parser this package does not bundle). That suite runs in another
 * process against `dist/`, so none of it moves a counter here, and `cosmiconfig.ts` is not in
 * the shared `TESTED_IN_ANOTHER_PROCESS` list: it is measured, so it is tested here too.
 *
 * Every case runs against **both** explorers. They are two copies of one algorithm — upstream's
 * own duplication, reproduced — and a fix that lands in one copy and not the other is the
 * defect this shape exists to catch. The sync explorer is wrapped so a throw reads as a
 * rejection; nothing else about it is adapted.
 *
 * The filesystem is real (temp directories). What the explorers read *through the module
 * object* — `fsPromises.readFile`, `fs.readFileSync` — is the seam cosmiconfig's own suite
 * spies on, and it is the one used here to force the read errors a temp directory cannot
 * produce portably (`EACCES`, `EIO`). The working directory is pinned per case with a spy on
 * `process.cwd`, because the meta config is read from it and a developer's checkout must not
 * be able to change what these assert.
 */
import fs, { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cosmiconfig, cosmiconfigSync, type CosmiconfigResult, type Options } from './cosmiconfig.js';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A fresh directory holding `files`; a key ending in `/` is an empty directory. Real path, so results compare exactly. */
function tree(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'seniority-cosmiconfig-')));
  roots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const at = join(root, rel);
    if (rel.endsWith('/')) {
      mkdirSync(at, { recursive: true });
      continue;
    }
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, body);
  }
  return root;
}

/** An empty working directory, so no meta config is found unless a case writes one. */
let cwd = '';
beforeEach(() => {
  cwd = tree();
  vi.spyOn(process, 'cwd').mockReturnValue(cwd);
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** `.config/config.json` in the working directory — the meta file that is actually honoured. */
function meta(body: string): void {
  mkdirSync(join(cwd, '.config'), { recursive: true });
  writeFileSync(join(cwd, '.config', 'config.json'), body);
}

/** A fresh copy of the module over an `os` that answers for the platform and the home directory. */
async function load(platform: string, home: string): Promise<typeof import('./cosmiconfig.js')> {
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:os')>()), homedir: () => home, platform: () => platform }));
  try {
    return await import('./cosmiconfig.js');
  } finally {
    vi.doUnmock('node:os');
  }
}

interface Explorer {
  search: (from?: string) => Promise<CosmiconfigResult>;
  load: (filepath: string) => Promise<CosmiconfigResult>;
  clearLoadCache: () => void;
  clearSearchCache: () => void;
  clearCaches: () => void;
}

type Reader = (path: fs.PathOrFileDescriptor) => Buffer;

interface Flavour {
  name: string;
  make: (moduleName: string, options?: Partial<Options>) => Explorer;
  /** Spy on the one read call this explorer makes, passing through unless `fail` answers for a path. */
  spyReads: (fail?: (path: string) => Error | undefined) => { calls: () => string[] };
  /** Make this explorer's `stat` of one path fail with `error`, passing every other path through. */
  failStat: (path: string, error: Error) => void;
}

const failWith = (code: string): Error => Object.assign(new Error(`${code}: forced`), { code });

const flavours: Flavour[] = [
  {
    name: 'cosmiconfig (async)',
    make: (moduleName, options) => cosmiconfig(moduleName, options),
    spyReads: (fail) => {
      const real = fsPromises.readFile.bind(fsPromises) as (path: string) => Promise<Buffer>;
      const spy = vi.spyOn(fsPromises, 'readFile').mockImplementation((async (path: string) => {
        const error = fail?.(String(path));
        if (error !== undefined) throw error;
        return await real(path);
      }) as typeof fsPromises.readFile);
      return { calls: () => spy.mock.calls.map((c) => String(c[0])) };
    },
    failStat: (at, error) => {
      const real = fsPromises.stat.bind(fsPromises) as (path: string) => Promise<fs.Stats>;
      vi.spyOn(fsPromises, 'stat').mockImplementation((async (path: string) => {
        if (String(path) === at) throw error;
        return await real(path);
      }) as typeof fsPromises.stat);
    },
  },
  {
    name: 'cosmiconfigSync',
    make: (moduleName, options) => {
      const explorer = cosmiconfigSync(moduleName, options);
      return {
        search: async (from) => await Promise.resolve().then(() => explorer.search(from)),
        load: async (filepath) => await Promise.resolve().then(() => explorer.load(filepath)),
        clearLoadCache: explorer.clearLoadCache,
        clearSearchCache: explorer.clearSearchCache,
        clearCaches: explorer.clearCaches,
      };
    },
    spyReads: (fail) => {
      const real = fs.readFileSync.bind(fs) as Reader;
      const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(((path: fs.PathOrFileDescriptor) => {
        const error = fail?.(String(path));
        if (error !== undefined) throw error;
        return real(path);
      }) as typeof fs.readFileSync);
      return { calls: () => spy.mock.calls.map((c) => String(c[0])) };
    },
    failStat: (at, error) => {
      const real = fs.statSync.bind(fs) as (path: string) => fs.Stats;
      vi.spyOn(fs, 'statSync').mockImplementation(((path: string) => {
        if (String(path) === at) throw error;
        return real(path);
      }) as typeof fs.statSync);
    },
  },
];

describe('the published shape', () => {
  it('hands back five bound methods, so a detached `search` keeps its explorer', async () => {
    const root = tree({ '.apprc.json': '{"a":1}' });
    const expected = { config: { a: 1 }, filepath: join(root, '.apprc.json') };
    const keys = ['search', 'load', 'clearLoadCache', 'clearSearchCache', 'clearCaches'];
    const asyncExplorer = cosmiconfig('app');
    const syncExplorer = cosmiconfigSync('app');
    expect(Object.keys(asyncExplorer)).toEqual(keys);
    expect(Object.keys(syncExplorer)).toEqual(keys);
    const { search: searchAsync } = asyncExplorer;
    const { search: searchSync } = syncExplorer;
    expect(await searchAsync(root)).toEqual(expected);
    expect(searchSync(root)).toEqual(expected);
  });

  it('refuses `stopDir` beside a strategy other than `global`, and allows an empty one', () => {
    for (const make of [cosmiconfig, cosmiconfigSync]) {
      expect(() => make('app', { searchStrategy: 'project', stopDir: '/x' })).toThrow('Can not supply `stopDir` option with `searchStrategy` other than "global"');
      expect(() => make('app', { searchStrategy: 'none', stopDir: '' })).not.toThrow();
      expect(() => make('app', { searchStrategy: 'global', stopDir: '/x' })).not.toThrow();
    }
  });

  it('checks every search place for a loader at construction, naming the whole place', () => {
    for (const make of [cosmiconfig, cosmiconfigSync]) {
      expect(() => make('app', { searchPlaces: ['.apprc.things'] })).toThrow('Missing loader for extension ".apprc.things".');
      expect(() => make('app', { searchPlaces: ['.apprc.things'], loaders: { '.things': 'nope' as never } })).toThrow('Loader for extension ".apprc.things" is not a function: Received string.');
      expect(() => make('app', { searchPlaces: [''], loaders: { noExt: undefined as never } })).toThrow('Missing loader for files without extensions.');
      // The description takes the place, not the extension, so an extensionless place is named.
      expect(() => make('app', { searchPlaces: ['.apprc'], loaders: { noExt: undefined as never } })).toThrow('Missing loader for extension ".apprc".');
      expect(() => make('app', { searchPlaces: ['.apprc.things'], loaders: { default: () => 1 } })).not.toThrow();
    }
  });
});

describe.each(flavours)('$name', ({ make, spyReads, failStat }) => {
  describe('one directory', () => {
    it('takes the first search place that holds a config, in the declared order', async () => {
      const root = tree({ '.apprc.json': '{"from":"json"}', 'app.config.cjs': 'module.exports = { from: "cjs" };' });
      expect(await make('app').search(root)).toEqual({ config: { from: 'json' }, filepath: join(root, '.apprc.json') });
    });

    it('reads a `package.json` for its named property, and passes one without it', async () => {
      const root = tree({ 'package.json': '{"name":"x","app":{"from":"pkg"}}' });
      expect(await make('app').search(root)).toEqual({ config: { from: 'pkg' }, filepath: join(root, 'package.json') });
      const other = tree({ 'package.json': '{"name":"x"}', '.apprc.json': '{"from":"rc"}' });
      expect(await make('app').search(other)).toEqual({ config: { from: 'rc' }, filepath: join(other, '.apprc.json') });
      // A `package.json` without the property holds nothing, which is not the same as empty:
      // it is passed even when empty places are not.
      expect(await make('app', { ignoreEmptySearchPlaces: false }).search(other)).toEqual({ config: { from: 'rc' }, filepath: join(other, '.apprc.json') });
    });

    it('follows `packageProp` as a path, and prefers a literal key with periods in it', async () => {
      const root = tree({ 'package.json': '{"tools":{"app":{"deep":true}},"a.b":{"literal":true},"name":"abc"}' });
      expect((await make('app', { packageProp: 'tools.app' }).search(root))?.config).toEqual({ deep: true });
      expect((await make('app', { packageProp: ['tools', 'app'] }).search(root))?.config).toEqual({ deep: true });
      expect((await make('app', { packageProp: 'a.b' }).search(root))?.config).toEqual({ literal: true });
      // 10.0.1 walks a string's own properties, so this is a number and not "not found".
      expect((await make('app', { packageProp: 'name.length' }).search(root))?.config).toBe(3);
    });

    it('throws, as 10.0.1 does, for a `packageProp` path through a null — annotated with the file', async () => {
      const root = tree({ 'package.json': '{"tools":null}' });
      const error = (await make('app', { packageProp: 'tools.app' })
        .search(root)
        .catch((caught: unknown) => caught)) as Error & { filepath?: string };
      expect(error).toBeInstanceOf(TypeError);
      expect(error.message).toMatch(/null/);
      expect(error.filepath).toBe(join(root, 'package.json'));
    });

    it('skips an empty file by default, and reports it as empty when told not to', async () => {
      const root = tree({ '.apprc.json': '  \n', 'app.config.cjs': 'module.exports = { from: "cjs" };' });
      expect(await make('app').search(root)).toEqual({ config: { from: 'cjs' }, filepath: join(root, 'app.config.cjs') });
      expect(await make('app', { ignoreEmptySearchPlaces: false }).search(root)).toEqual({ config: undefined, filepath: join(root, '.apprc.json'), isEmpty: true });
    });

    it('reads a file with no extension as the JSON subset of YAML, and refuses the rest by name', async () => {
      const root = tree({ '.apprc': '{"from":"noext"}' });
      expect((await make('app').search(root))?.config).toEqual({ from: 'noext' });
      const yaml = tree({ '.apprc': 'from: yaml\n' });
      await expect(make('app').search(yaml)).rejects.toThrow(`no YAML parser for ${join(yaml, '.apprc')}`);
    });

    it('treats a loader answering `null` as nothing here and `undefined` as an empty file', async () => {
      const root = tree({ 'a.cfg': 'x', 'b.cfg': 'x', 'c.cfg': 'x' });
      const answers: Record<string, unknown> = { 'a.cfg': null, 'b.cfg': undefined, 'c.cfg': 'third' };
      const loaders = { '.cfg': (filepath: string): unknown => answers[basename(filepath)] };
      expect(await make('app', { searchPlaces: ['a.cfg', 'b.cfg', 'c.cfg'], loaders }).search(root)).toEqual({ config: 'third', filepath: join(root, 'c.cfg') });
      expect(await make('app', { searchPlaces: ['a.cfg', 'b.cfg'], loaders, ignoreEmptySearchPlaces: false }).search(root)).toEqual({ config: undefined, filepath: join(root, 'b.cfg'), isEmpty: true });
    });

    it('falls back to `loaders.default` for an extension nothing else claims', async () => {
      const root = tree({ '.apprc.toml': 'x = 1' });
      expect((await make('app', { searchPlaces: ['.apprc.toml'], loaders: { default: () => ({ via: 'default' }) } }).search(root))?.config).toEqual({ via: 'default' });
    });

    it('runs `transform` once, on the hit or on the `null` at the end', async () => {
      const seen: CosmiconfigResult[] = [];
      const transform = (result: CosmiconfigResult): CosmiconfigResult => {
        seen.push(result);
        return result === null ? { config: 'nothing', filepath: '' } : { ...result, config: 'changed' };
      };
      const root = tree({ '.apprc.json': '{"a":1}' });
      expect((await make('app', { transform }).search(root))?.config).toBe('changed');
      expect((await make('app', { transform }).search(tree()))?.config).toBe('nothing');
      expect(seen).toEqual([{ config: { a: 1 }, filepath: join(root, '.apprc.json') }, null]);
    });

    it('starts from the working directory when `search` is given nothing', async () => {
      writeFileSync(join(cwd, '.apprc.json'), '{"from":"cwd"}');
      expect(await make('app').search()).toEqual({ config: { from: 'cwd' }, filepath: join(cwd, '.apprc.json') });
    });
  });

  describe('what a search swallows, and what it does not', () => {
    it('skips a place that is missing, a directory, or under a file', async () => {
      const root = tree({ 'dir.json/': '', 'file/': '', 'plain.json': '1', 'last.json': '{"found":"last"}' });
      const places = ['missing.json', 'dir.json', 'plain.json/under.json', 'last.json'];
      expect(await make('app', { searchPlaces: places }).search(root)).toEqual({ config: { found: 'last' }, filepath: join(root, 'last.json') });
    });

    it('skips a place it may not read (`EACCES`)', async () => {
      const root = tree({ 'first.json': '{"n":1}', 'second.json': '{"n":2}' });
      const explorer = make('app', { searchPlaces: ['first.json', 'second.json'] });
      spyReads((path) => (path.endsWith('first.json') ? failWith('EACCES') : undefined));
      expect((await explorer.search(root))?.config).toEqual({ n: 2 });
    });

    it('rethrows any other read error rather than reading past it', async () => {
      const root = tree({ 'first.json': '{"n":1}', 'second.json': '{"n":2}' });
      const explorer = make('app', { searchPlaces: ['first.json', 'second.json'] });
      spyReads((path) => (path.endsWith('first.json') ? failWith('EIO') : undefined));
      await expect(explorer.search(root)).rejects.toThrow('EIO: forced');
    });

    it('rethrows a loader failure with the file written onto it', async () => {
      const root = tree({ '.apprc.json': '{ nope' });
      const error = (await make('app')
        .search(root)
        .catch((caught: unknown) => caught)) as Error & { filepath?: string };
      expect(error.message).toMatch(new RegExp(`^JSON Error in ${join(root, '.apprc.json').replaceAll('\\', '\\\\')}:\\n`));
      expect(error.filepath).toBe(join(root, '.apprc.json'));
    });

    it('rethrows a thrown non-object untouched, since there is nothing to write the file onto', async () => {
      const root = tree({ 'x.bad': 'x' });
      const loaders = {
        '.bad': () => {
          throw 'plain string';
        },
      };
      await expect(make('app', { searchPlaces: ['x.bad'], loaders }).search(root)).rejects.toBe('plain string');
    });

    it('reads a start directory that does not exist as nothing found', async () => {
      expect(await make('app').search(join(tree(), 'not', 'here'))).toBeNull();
    });

    it('rejects when the start directory cannot be `stat`ed for any reason but absence (10.0.1)', async () => {
      // Forced through the module object, because the real-world routes are per platform:
      // `stat('<file>/sub')` is `ENOTDIR` on POSIX but `ENOENT` on Windows.
      const root = tree({ '.apprc.json': '{"a":1}' });
      const explorer = make('app');
      failStat(root, failWith('EACCES'));
      await expect(explorer.search(root)).rejects.toThrow('EACCES: forced');
    });
  });

  describe('search strategies', () => {
    it('`none` — the default — looks in the start directory alone', async () => {
      const root = tree({ '.apprc.json': '{"a":1}', 'child/': '' });
      expect(await make('app').search(join(root, 'child'))).toBeNull();
    });

    it('`stopDir: ""` names no directory, so it is `none` and not `global` (10.0.1)', async () => {
      const root = tree({ '.apprc.json': '{"a":1}', 'child/': '' });
      expect(await make('app', { stopDir: '' }).search(join(root, 'child'))).toBeNull();
    });

    it('`project` walks up to and including the first directory with a package manifest', async () => {
      const root = tree({ '.apprc.json': '{"from":"above"}', 'pkg/package.json': '{"name":"p"}', 'pkg/.apprc.json': '{"from":"pkg"}', 'pkg/a/b/': '' });
      expect((await make('app', { searchStrategy: 'project' }).search(join(root, 'pkg', 'a', 'b')))?.config).toEqual({ from: 'pkg' });
      const bare = tree({ '.apprc.json': '{"from":"above"}', 'pkg/package.json': '{"name":"p"}', 'pkg/a/': '' });
      expect(await make('app', { searchStrategy: 'project' }).search(join(bare, 'pkg', 'a'))).toBeNull();
    });

    it('`project` treats a `package.yaml` as a manifest too', async () => {
      const root = tree({ '.apprc.json': '{"from":"above"}', 'pkg/package.yaml': 'name: p\n', 'pkg/a/': '' });
      expect(await make('app', { searchStrategy: 'project' }).search(join(root, 'pkg', 'a'))).toBeNull();
    });

    it('`project` with no manifest anywhere walks to the root and stops there', async () => {
      const root = tree({ 'a/b/': '' });
      expect(await make('seniority-no-such-tool-7f3a', { searchStrategy: 'project', cache: false }).search(join(root, 'a', 'b'))).toBeNull();
    });

    it('`global` walks up to `stopDir` inclusive, then reads the global directory by its own places', async () => {
      const root = tree({ 'home/.apprc.json': '{"from":"home"}', 'global/config.json': '{"from":"global"}', 'home/a/b/': '' });
      const options = { stopDir: join(root, 'home'), globalConfigDir: join(root, 'global') };
      expect((await make('app', options).search(join(root, 'home', 'a', 'b')))?.config).toEqual({ from: 'home' });
      const above = tree({ '.apprc.json': '{"from":"above"}', 'home/a/': '', 'global/config.json': '{"from":"global"}' });
      expect((await make('app', { stopDir: join(above, 'home'), globalConfigDir: join(above, 'global') }).search(join(above, 'home', 'a')))?.config).toEqual({ from: 'global' });
    });

    it('`global` answers null when neither the walk nor the global directory holds anything', async () => {
      const root = tree({ 'home/a/': '', 'global/': '' });
      expect(await make('app', { stopDir: join(root, 'home'), globalConfigDir: join(root, 'global') }).search(join(root, 'home', 'a'))).toBeNull();
    });

    it('`global` with a `stopDir` that is not an ancestor walks to the root, then the global directory', async () => {
      const root = tree({ 'start/': '', 'elsewhere/': '', 'global/config.json': '{"from":"global"}' });
      const options = { stopDir: join(root, 'elsewhere'), globalConfigDir: join(root, 'global') };
      expect((await make('seniority-no-such-tool-7f3a', options).search(join(root, 'start')))?.config).toEqual({ from: 'global' });
    });

    it('refuses an unknown strategy with no directories to walk, rather than returning null', async () => {
      const root = tree();
      await expect(make('app', { searchStrategy: 'sideways' as never }).search(root)).rejects.toThrow(`Could not find any folders to iterate through (start from ${root})`);
    });
  });

  describe('caches', () => {
    it('reads a loaded file once, until the load cache is cleared', async () => {
      const root = tree({ 'x.json': '{"a":1}' });
      const explorer = make('app');
      const reads = spyReads();
      await explorer.load(join(root, 'x.json'));
      await explorer.load(join(root, 'x.json'));
      expect(reads.calls()).toHaveLength(1);
      explorer.clearLoadCache();
      await explorer.load(join(root, 'x.json'));
      expect(reads.calls()).toHaveLength(2);
      explorer.clearCaches();
      await explorer.load(join(root, 'x.json'));
      expect(reads.calls()).toHaveLength(3);
    });

    it('shares a walk: a second search from below reuses every directory the first one visited', async () => {
      const root = tree({ 'pkg/package.json': '{"name":"p"}', 'pkg/.apprc.json': '{"a":1}', 'pkg/a/b/': '' });
      const explorer = make('app', { searchStrategy: 'project', searchPlaces: ['.apprc.json'] });
      const reads = spyReads();
      await explorer.search(join(root, 'pkg', 'a'));
      const first = reads.calls().length;
      expect(await explorer.search(join(root, 'pkg', 'a'))).toEqual({ config: { a: 1 }, filepath: join(root, 'pkg', '.apprc.json') });
      // `pkg` was never a start directory; it is cached because the first walk passed through it.
      expect(await explorer.search(join(root, 'pkg'))).toEqual({ config: { a: 1 }, filepath: join(root, 'pkg', '.apprc.json') });
      expect(reads.calls()).toHaveLength(first);
      explorer.clearSearchCache();
      await explorer.search(join(root, 'pkg', 'a'));
      expect(reads.calls()).toHaveLength(first * 2);
      explorer.clearCaches();
      await explorer.search(join(root, 'pkg', 'a'));
      expect(reads.calls()).toHaveLength(first * 3);
    });

    it('reads every time with `cache: false`, and clearing a cache it does not have is a no-op', async () => {
      const root = tree({ 'pkg/package.json': '{"name":"p"}', 'pkg/.apprc.json': '{"a":1}', 'pkg/a/': '' });
      const explorer = make('app', { cache: false, searchStrategy: 'project', searchPlaces: ['.apprc.json'] });
      const reads = spyReads();
      const hits = (): number => reads.calls().filter((path) => path === join(root, 'pkg', '.apprc.json')).length;
      await explorer.load(join(root, 'pkg', '.apprc.json'));
      await explorer.load(join(root, 'pkg', '.apprc.json'));
      expect(hits()).toBe(2);
      await explorer.search(join(root, 'pkg', 'a'));
      await explorer.search(join(root, 'pkg', 'a'));
      expect(hits()).toBe(4);
      expect(() => {
        explorer.clearLoadCache();
        explorer.clearSearchCache();
        explorer.clearCaches();
      }).not.toThrow();
    });
  });

  describe('load', () => {
    it('resolves a relative path against the working directory', async () => {
      writeFileSync(join(cwd, 'rel.json'), '{"rel":true}');
      expect(await make('app').load('rel.json')).toEqual({ config: { rel: true }, filepath: join(cwd, 'rel.json') });
    });

    it('names the extension it has no loader for, and a file with none', async () => {
      const root = tree({ 'x.txt': 'x', noext: 'x' });
      await expect(make('app').load(join(root, 'x.txt'))).rejects.toThrow('No loader specified for extension ".txt"');
      await expect(make('app', { searchPlaces: ['.apprc.json'], loaders: { noExt: undefined as never } }).load(join(root, 'noext'))).rejects.toThrow('No loader specified for files without extensions');
    });

    it('reports an empty file as empty without asking a loader', async () => {
      const root = tree({ 'x.json': '' });
      expect(await make('app').load(join(root, 'x.json'))).toEqual({ config: undefined, filepath: join(root, 'x.json'), isEmpty: true });
    });

    it('decodes a UTF-16 file by its byte-order mark', async () => {
      const root = tree();
      writeFileSync(join(root, 'x.json'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('{"wide":1}', 'utf16le')]));
      expect((await make('app').load(join(root, 'x.json')))?.config).toEqual({ wide: 1 });
    });
  });

  describe('$import', () => {
    it('merges imports first and the file’s own keys last, concatenating arrays unless told not to', async () => {
      const root = tree({
        'base.json': '{"list":[1],"deep":{"x":1},"only":"base"}',
        'mid.json': '{"list":[2],"deep":{"y":2}}',
        'top.json': '{"$import":["./base.json","./mid.json"],"list":[3],"deep":{"z":3}}',
        'one.json': '{"$import":"./base.json","only":"one"}',
      });
      expect((await make('app').load(join(root, 'top.json')))?.config).toEqual({ list: [1, 2, 3], deep: { x: 1, y: 2, z: 3 }, only: 'base' });
      expect((await make('app', { mergeImportArrays: false }).load(join(root, 'top.json')))?.config).toEqual({ list: [3], deep: { x: 1, y: 2, z: 3 }, only: 'base' });
      expect((await make('app').load(join(root, 'one.json')))?.config).toEqual({ list: [1], deep: { x: 1 }, only: 'one' });
    });

    it('contributes nothing for an import that is empty or holds no config', async () => {
      const root = tree({ 'empty.json': '', 'package.json': '{"name":"p"}', 'top.json': '{"$import":["./empty.json","./package.json"],"own":1}' });
      expect((await make('app').load(join(root, 'top.json')))?.config).toEqual({ own: 1 });
    });

    it('refuses a non-string import, a self-import, and a ring — naming every link of it', async () => {
      const root = tree({
        'num.json': '{"$import":[1]}',
        'self.json': '{"$import":"./self.json"}',
        'a.json': '{"$import":"./b.json"}',
        'b.json': '{"$import":"./a.json"}',
      });
      await expect(make('app').load(join(root, 'num.json'))).rejects.toThrow(`${join(root, 'num.json')}: Key $import must contain a string or a list of strings`);
      await expect(make('app').load(join(root, 'self.json'))).rejects.toThrow(`Self-import detected in ${join(root, 'self.json')}`);
      await expect(make('app').load(join(root, 'a.json'))).rejects.toThrow(`Circular import detected:\n1. ${join(root, 'a.json')}\n2. ${join(root, 'b.json')}\n3. ${join(root, 'a.json')} (same as 1.)`);
    });

    it('ignores `$import` on a config that is not an object, and an inherited one', async () => {
      const root = tree({ 'x.cfg': 'x', 'y.cfg': 'y' });
      const inherited = Object.create({ $import: './nope.json' }) as Record<string, unknown>;
      const loaders = { '.cfg': (filepath: string) => (filepath.endsWith('x.cfg') ? '$import' : inherited) };
      expect((await make('app', { loaders }).load(join(root, 'x.cfg')))?.config).toBe('$import');
      expect((await make('app', { loaders }).load(join(root, 'y.cfg')))?.config).toBe(inherited);
    });
  });

  describe('the meta config (cosmiconfig’s own, read from the working directory)', () => {
    it('adds its search places ahead of the tool’s, `{name}` replaced once', async () => {
      meta('{"cosmiconfig":{"searchPlaces":["{name}-{name}.json"]}}');
      const root = tree({ 'app-{name}.json': '{"from":"meta"}', '.apprc.json': '{"from":"rc"}' });
      expect((await make('app').search(root))?.config).toEqual({ from: 'meta' });
      const fallback = tree({ '.apprc.json': '{"from":"rc"}' });
      expect((await make('app').search(fallback))?.config).toEqual({ from: 'rc' });
    });

    it('replaces the tool’s places when it says `mergeSearchPlaces: false`', async () => {
      meta('{"cosmiconfig":{"searchPlaces":["only.json"],"mergeSearchPlaces":false}}');
      expect(await make('app').search(tree({ '.apprc.json': '{"from":"rc"}' }))).toBeNull();
      expect((await make('app').search(tree({ 'only.json': '{"from":"only"}' })))?.config).toEqual({ from: 'only' });
    });

    it('outranks the program’s own options, and keeps the program’s places when it names none', async () => {
      meta('{"cosmiconfig":{"ignoreEmptySearchPlaces":false}}');
      const root = tree({ '.apprc.json': '', 'custom.json': '{"from":"custom"}' });
      expect(await make('app', { ignoreEmptySearchPlaces: true, searchPlaces: ['.apprc.json', 'custom.json'] }).search(root)).toEqual({ config: undefined, filepath: join(root, '.apprc.json'), isEmpty: true });
      // Even when it declines to merge places, naming none keeps the program's.
      meta('{"cosmiconfig":{"mergeSearchPlaces":false}}');
      expect((await make('app', { searchPlaces: ['custom.json'] }).search(root))?.config).toEqual({ from: 'custom' });
    });

    it('answers a search itself when the meta file carries the tool’s own key', async () => {
      meta('{"cosmiconfig":{},"app":{"from":"meta-file"},"other":1}');
      const root = tree({ '.apprc.json': '{"from":"rc","app":"not this"}' });
      const explorer = make('app');
      expect(await explorer.search(root)).toEqual({ config: { from: 'meta-file' }, filepath: join(cwd, '.config', 'config.json') });
      // Loading the meta file is the only time the tool's key is read out of a non-package file.
      expect((await explorer.load(join(root, '.apprc.json')))?.config).toEqual({ from: 'rc', app: 'not this' });
    });

    it('falls through to the ordinary search when the meta file has no key for the tool, or is empty', async () => {
      const root = tree({ '.apprc.json': '{"from":"rc","app":"not this"}' });
      meta('{"cosmiconfig":{}}');
      expect(await make('app').search(root)).toEqual({ config: { from: 'rc', app: 'not this' }, filepath: join(root, '.apprc.json') });
      meta('');
      expect(await make('app').search(root)).toEqual({ config: { from: 'rc', app: 'not this' }, filepath: join(root, '.apprc.json') });
    });

    it('never applies a `package.json` meta key — it is extracted twice over, as in 10.0.1', async () => {
      writeFileSync(join(cwd, 'package.json'), '{"cosmiconfig":{"searchPlaces":["{name}-{name}.json"],"loaders":{}}}');
      const root = tree({ 'app-{name}.json': '{"from":"meta"}', '.apprc.json': '{"from":"rc"}' });
      expect((await make('app').search(root))?.config).toEqual({ from: 'rc' });
    });

    it('refuses `loaders` and `searchStrategy` in the meta file', () => {
      meta('{"cosmiconfig":{"loaders":{}}}');
      expect(() => make('app')).toThrow('Can not specify loaders in meta config file');
      meta('{"cosmiconfig":{"searchStrategy":"global"}}');
      expect(() => make('app')).toThrow('Can not specify searchStrategy in meta config file');
    });
  });
});

describe('the global config directory, by platform', () => {
  it.each([
    ['darwin', ['Library', 'Preferences', 'app', 'config.json']],
    ['win32', ['AppData', 'Roaming', 'app', 'Config', 'config.json']],
    ['linux', ['.config', 'app', 'config.json']],
  ])('on %s it is where env-paths puts it, reached after a walk that stops at the home directory', async (platform, segments) => {
    // The `.apprc.json` above home is what a walk that did not stop at home would find first.
    const root = tree({ '.apprc.json': '{"from":"above home"}', [['home', ...segments].join('/')]: '{"from":"global"}', 'home/project/a/': '' });
    const home = join(root, 'home');
    const fresh = await load(platform, home);
    const expected = { config: { from: 'global' }, filepath: join(home, ...segments) };
    expect(await fresh.cosmiconfig('app', { searchStrategy: 'global' }).search(join(home, 'project', 'a'))).toEqual(expected);
    expect(fresh.cosmiconfigSync('app', { searchStrategy: 'global' }).search(join(home, 'project', 'a'))).toEqual(expected);
  });
});
