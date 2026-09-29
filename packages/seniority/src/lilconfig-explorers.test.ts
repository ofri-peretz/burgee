/**
 * `seniority/lilconfig`'s two explorers, driven in this process.
 *
 * lilconfig's own suite grades this file 77 / 77 through `compat-oracle`, in another process,
 * so none of that moves a counter here. `lilconfig.test.ts` locks the export shape; this file
 * walks both explorers through every arm of `search` and `load`. They are one algorithm
 * written twice — lilconfig's duplication, reproduced — so every case runs against both, with
 * the sync one wrapped so a throw reads as a rejection.
 *
 * The one place the two copies differ on purpose is pinned by name: upstream's sync `load` of a
 * `package.json` does not cache, and its async one does.
 */
import fs, { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { defaultLoaders, lilconfig, lilconfigSync, type LilconfigResult, type LoaderSync, type Options } from './lilconfig.js';

const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** A fresh directory holding `files`; a key ending in `/` is an empty directory. */
function tree(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'seniority-lilconfig-')));
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

interface Explorer {
  search: (from?: string) => Promise<LilconfigResult>;
  load: (filepath: string) => Promise<LilconfigResult>;
  clearLoadCache: () => void;
  clearSearchCache: () => void;
  clearCaches: () => void;
}

const flavours: { name: string; sync: boolean; make: (name: string, options?: Options) => Explorer }[] = [
  { name: 'lilconfig (async)', sync: false, make: (name, options) => lilconfig(name, options) },
  {
    name: 'lilconfigSync',
    sync: true,
    make: (name, options) => {
      const explorer = lilconfigSync(name, options as Parameters<typeof lilconfigSync>[1]);
      return {
        search: async (from) => await Promise.resolve().then(() => explorer.search(from)),
        load: async (filepath) => await Promise.resolve().then(() => explorer.load(filepath)),
        clearLoadCache: explorer.clearLoadCache,
        clearSearchCache: explorer.clearSearchCache,
        clearCaches: explorer.clearCaches,
      };
    },
  },
];

/** A `.json` loader that counts its calls, so a case can tell a cache hit from a read. */
const counting = (): { loader: LoaderSync; calls: () => number } => {
  let calls = 0;
  return {
    loader: (_filepath, content) => {
      calls += 1;
      return JSON.parse(content) as unknown;
    },
    calls: () => calls,
  };
};

describe.each(flavours)('$name', ({ make, sync }) => {
  describe('search', () => {
    it('reads `package.json` for the named property, and passes one without it to the next place', async () => {
      const root = tree({ 'package.json': '{"x":{"from":"pkg"}}' });
      expect(await make('x', { stopDir: root }).search(root)).toEqual({ config: { from: 'pkg' }, filepath: join(root, 'package.json') });
      const other = tree({ 'package.json': '{"name":"n"}', '.xrc.json': '{"from":"rc"}' });
      expect(await make('x', { stopDir: other }).search(other)).toEqual({ config: { from: 'rc' }, filepath: join(other, '.xrc.json') });
    });

    it('walks up until `stopDir`, inclusive, and no further', async () => {
      const root = tree({ '.xrc.json': '{"from":"top"}', 'a/.xrc.json': '{"from":"a"}', 'a/b/c/': '' });
      expect((await make('x', { stopDir: join(root, 'a') }).search(join(root, 'a', 'b', 'c')))?.config).toEqual({ from: 'a' });
      const bare = tree({ '.xrc.json': '{"from":"top"}', 'a/b/': '' });
      expect(await make('x', { stopDir: join(bare, 'a') }).search(join(bare, 'a', 'b'))).toBeNull();
    });

    it('skips an empty place by default, and reports it when empty places are not ignored', async () => {
      const root = tree({ '.xrc.json': '  ', '.config/xrc.json': '{"from":"next"}' });
      expect(await make('x', { stopDir: root }).search(root)).toEqual({ config: { from: 'next' }, filepath: join(root, '.config', 'xrc.json') });
      expect(await make('x', { stopDir: root, ignoreEmptySearchPlaces: false }).search(root)).toEqual({ config: undefined, filepath: join(root, '.xrc.json'), isEmpty: true });
    });

    it('reads an extensionless search place as JSON', async () => {
      const root = tree({ '.config/xrc': '{"from":"noext"}' });
      expect(await make('x', { stopDir: root }).search(root)).toEqual({ config: { from: 'noext' }, filepath: join(root, '.config', 'xrc') });
    });

    it('starts from the working directory when given nothing', async () => {
      const root = tree({ '.xrc.json': '{"from":"cwd"}' });
      vi.spyOn(process, 'cwd').mockReturnValue(root);
      expect(await make('x', { stopDir: root }).search()).toEqual({ config: { from: 'cwd' }, filepath: join(root, '.xrc.json') });
    });

    it('stops at the filesystem root when `stopDir` is not above the start', async () => {
      const root = tree({ 'a/': '' });
      expect(await make('seniority-no-such-tool-7f3a', { stopDir: join(root, 'elsewhere') }).search(join(root, 'a'))).toBeNull();
    });

    it('answers a later search from any directory an earlier walk passed through, and records the new ones', async () => {
      const root = tree({ '.xrc.json': '{"n":1}', 'a/b/c/': '' });
      const json = counting();
      const explorer = make('x', { stopDir: root, loaders: { '.json': json.loader }, searchPlaces: ['.xrc.json'] });
      const first = await explorer.search(join(root, 'a', 'b'));
      expect(json.calls()).toBe(1);
      // Both explorers probe a place with `access` through the module object before reading it.
      const probe = join(root, 'a', 'b', 'c', '.xrc.json');
      const probes = [vi.spyOn(fs, 'accessSync'), vi.spyOn(fs.promises, 'access')];
      const probedC = (): number => probes.flatMap((spy) => spy.mock.calls).filter((call) => call[0] === probe).length;
      // `a/b/c` was never visited: it is walked, then `a/b` answers from the cache …
      expect(await explorer.search(join(root, 'a', 'b', 'c'))).toBe(first);
      expect(probedC()).toBe(1);
      // … and that answer is recorded for `a/b/c` too, so a third search probes nothing.
      expect(await explorer.search(join(root, 'a', 'b', 'c'))).toBe(first);
      expect(probedC()).toBe(1);
      expect(json.calls()).toBe(1);
      explorer.clearSearchCache();
      await explorer.search(join(root, 'a', 'b', 'c'));
      expect(json.calls()).toBe(2);
    });

    it('caches nothing and clears nothing with `cache: false`', async () => {
      const root = tree({ '.xrc.json': '{"n":1}' });
      const json = counting();
      const explorer = make('x', { stopDir: root, cache: false, loaders: { '.json': json.loader }, searchPlaces: ['.xrc.json'] });
      await explorer.search(root);
      await explorer.search(root);
      await explorer.load(join(root, '.xrc.json'));
      await explorer.load(join(root, '.xrc.json'));
      expect(json.calls()).toBe(4);
      expect(() => {
        explorer.clearLoadCache();
        explorer.clearSearchCache();
        explorer.clearCaches();
      }).not.toThrow();
    });
  });

  describe('load', () => {
    it('resolves a relative path against the working directory, and reads a file with no extension as JSON', async () => {
      const root = tree({ xrc: '{"k":1}' });
      vi.spyOn(process, 'cwd').mockReturnValue(root);
      expect(await make('x').load('xrc')).toEqual({ config: { k: 1 }, filepath: join(root, 'xrc') });
    });

    it('reads a `package.json` for the property, a literal key first and a falsy literal kept', async () => {
      const root = tree({ 'package.json': '{"x":{"a":1},"a.b":2,"z":0,"nested":{"y":false}}' });
      const at = join(root, 'package.json');
      expect((await make('x').load(at))?.config).toEqual({ a: 1 });
      expect((await make('x', { packageProp: 'a.b' }).load(at))?.config).toBe(2);
      expect((await make('x', { packageProp: 'z' }).load(at))?.config).toBe(0);
      // A walked path collapses every falsy value to null, as upstream's `|| null` does.
      expect((await make('x', { packageProp: 'nested.y' }).load(at))?.config).toBeNull();
    });

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['false', false],
      ['an empty string', ''],
      ['zero', 0],
      ['NaN', Number.NaN],
    ])('collapses a walked %s to null', async (_label, value) => {
      const root = tree({ 'package.json': '{}' });
      const explorer = make('x', { packageProp: ['deep', 'v'], loaders: { '.json': () => ({ deep: { v: value } }) } });
      expect((await explorer.load(join(root, 'package.json')))?.config).toBeNull();
    });

    it('keeps a walked truthy number', async () => {
      const root = tree({ 'package.json': '{}' });
      const explorer = make('x', { packageProp: ['deep', 'v'], loaders: { '.json': () => ({ deep: { v: 7 } }) } });
      expect((await explorer.load(join(root, 'package.json')))?.config).toBe(7);
    });

    it('carries `undefined` through the rest of a path whose parent is missing, rather than throwing', async () => {
      const root = tree({ 'package.json': '{"other":1}' });
      expect((await make('x', { packageProp: ['missing', 'deeper', 'v'] }).load(join(root, 'package.json')))?.config).toBeNull();
    });

    it('reports an empty file as empty, whether or not empty places are ignored', async () => {
      const root = tree({ 'e.json': '\n' });
      const expected = { config: undefined, filepath: join(root, 'e.json'), isEmpty: true };
      expect(await make('x').load(join(root, 'e.json'))).toEqual(expected);
      expect(await make('x', { ignoreEmptySearchPlaces: false }).load(join(root, 'e.json'))).toEqual(expected);
    });

    it('names an extension with no loader, and a loader that is not a function', async () => {
      const root = tree({ 'x.txt': 'hello' });
      await expect(make('x').load(join(root, 'x.txt'))).rejects.toThrow('No loader specified for extension ".txt"');
      await expect(make('x', { loaders: { '.txt': 'nope' as never } }).load(join(root, 'x.txt'))).rejects.toThrow('loader is not a function');
      // Checked before the file is read, so a missing file is not what gets reported.
      await expect(make('x', { loaders: { '.txt': 'nope' as never } }).load(join(root, 'missing.txt'))).rejects.toThrow('loader is not a function');
    });

    it('reads a loaded file once, until the load cache is cleared', async () => {
      const root = tree({ 'c.json': '{"n":1}' });
      const json = counting();
      const explorer = make('x', { loaders: { '.json': json.loader } });
      const first = await explorer.load(join(root, 'c.json'));
      expect(await explorer.load(join(root, 'c.json'))).toBe(first);
      expect(json.calls()).toBe(1);
      explorer.clearLoadCache();
      await explorer.load(join(root, 'c.json'));
      expect(json.calls()).toBe(2);
      explorer.clearCaches();
      await explorer.load(join(root, 'c.json'));
      expect(json.calls()).toBe(3);
    });

    it('caches an empty file’s result too', async () => {
      const root = tree({ 'e.json': '' });
      const explorer = make('x');
      expect(await explorer.load(join(root, 'e.json'))).toBe(await explorer.load(join(root, 'e.json')));
    });

    it('serves a cached `null` as null, not as a miss that reads again', async () => {
      const root = tree({ 'c.json': '{"n":1}' });
      const json = counting();
      const explorer = make('x', { loaders: { '.json': json.loader }, transform: () => null });
      expect(await explorer.load(join(root, 'c.json'))).toBeNull();
      expect(await explorer.load(join(root, 'c.json'))).toBeNull();
      expect(json.calls()).toBe(1);
    });

    it(`${sync ? 'does not cache' : 'caches'} a \`package.json\` load — upstream's own asymmetry`, async () => {
      const root = tree({ 'package.json': '{"x":{"a":1}}' });
      const json = counting();
      const explorer = make('x', { loaders: { '.json': json.loader } });
      await explorer.load(join(root, 'package.json'));
      await explorer.load(join(root, 'package.json'));
      expect(json.calls()).toBe(sync ? 2 : 1);
    });
  });
});

/** The `import()` error: Node's refusal when it never ran the file, or the first run's when it did. */
const fromImport = (runs: number): RegExp => (runs === 1 ? /Unknown file extension/ : /^run 1\b/);

describe('the async script loader', () => {
  const root = tree();
  const file = (name: string, body: string): string => {
    const at = join(root, name);
    writeFileSync(at, body);
    return at;
  };
  const load = defaultLoaders['.js'] as (filepath: string, content: string) => Promise<unknown>;

  it('is one function for `.js`, `.mjs` and `.cjs`, and imports a module’s default', async () => {
    expect(defaultLoaders['.mjs']).toBe(load);
    expect(defaultLoaders['.cjs']).toBe(load);
    expect(await load(file('esm.mjs', 'export default { from: "esm" };'), '')).toEqual({ from: 'esm' });
  });

  it('falls back to `require` when `import()` refuses the file', async () => {
    expect(await load(file('fallback.cfgjs', 'module.exports = { from: "require" };'), '')).toEqual({ from: 'require' });
  });

  /**
   * A file that numbers its runs and throws `make`. `require` is always the last run, so the
   * number on the error says which loader's error came back. Node refuses the extension on
   * `import()` without running it; vitest's runner runs it.
   */
  const counted = async (name: string, make: string): Promise<{ error: unknown; runs: number }> => {
    const key = `__seniority_lil_${name}`;
    const at = file(`${name}.cfgjs`, `const n = (globalThis.${key} = (globalThis.${key} ?? 0) + 1);\nthrow ${make};`);
    const error = await load(at, '').catch((caught: unknown) => caught);
    return { error, runs: (globalThis as Record<string, unknown>)[key] as number };
  };

  it('rethrows the `import()` error when `require` only complains about ES modules', async () => {
    const byCode = await counted('bycode', 'Object.assign(new Error("run " + n), { code: "ERR_REQUIRE_ESM" })');
    expect((byCode.error as Error).message).toMatch(fromImport(byCode.runs));
    const byMessage = await counted('bymessage', 'new SyntaxError("run " + n + " Cannot use import statement outside a module")');
    expect((byMessage.error as Error).message).toMatch(fromImport(byMessage.runs));
  });

  it('rethrows the `require` error otherwise — a plain Error with the same words, or no error at all', async () => {
    const notSyntax = await counted('notsyntax', 'new Error("run " + n + " Cannot use import statement outside a module")');
    expect((notSyntax.error as Error).message).toBe(`run ${String(notSyntax.runs)} Cannot use import statement outside a module`);
    const nothing = await counted('nothing', 'null');
    expect(nothing.error).toBeNull();
  });
});
