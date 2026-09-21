/**
 * R8 — `seniority/lilconfig`: lilconfig 3.1.3's surface.
 *
 * The public grade is lilconfig's own suite (`npm run compat -- lilconfig`, **67 / 77**,
 * which is its control's number exactly). What is locked here is the part that suite's last
 * case turns on and that nothing else in this package protects: **the module exports four
 * names and no more**. A fifth runtime export fails
 * `npm package api › exports the same things as cosmiconfig` — the one assertion in seventy-seven
 * that grades the module's shape rather than its behaviour — and it would fail it silently,
 * because adding an export is the least alarming edit there is.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-namespace -- The namespace object *is* the thing under test: the graded case reads `Object.keys()` of the module, so a named-import list would assert what this file typed rather than what the module publishes.
import * as facade from './lilconfig.js';

const { defaultLoaders, defaultLoadersSync, lilconfig, lilconfigSync } = facade;

const root = mkdtempSync(join(tmpdir(), 'seniority-lilconfig-'));
const deep = join(root, 'a', 'b');
mkdirSync(deep, { recursive: true });

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('the export shape is the compatibility claim', () => {
  it('publishes exactly the four names lilconfig does', () => {
    // cosmiconfig 8.3.6 publishes `cosmiconfig`, `cosmiconfigSync`, `defaultLoaders`,
    // `defaultLoadersSync`, `metaSearchPlaces`; the suite omits the first two, the
    // `lilconfig`/`lilconfigSync` pair and `metaSearchPlaces` before comparing, which leaves
    // the two loader tables on both sides. Anything else here breaks that equality.
    expect(Object.keys(facade).sort()).toEqual(['defaultLoaders', 'defaultLoadersSync', 'lilconfig', 'lilconfigSync']);
  });

  it('gives an explorer cosmiconfig\'s five keys, in cosmiconfig\'s order', () => {
    expect(Object.keys(lilconfigSync('foo'))).toEqual(['search', 'load', 'clearLoadCache', 'clearSearchCache', 'clearCaches']);
    expect(Object.keys(lilconfig('foo'))).toEqual(['search', 'load', 'clearLoadCache', 'clearSearchCache', 'clearCaches']);
  });

  it('maps `.json` to `require` in the sync table and to `JSON.parse` in the async one', () => {
    // Not a detail: it is why an invalid `.json` reports V8's own message synchronously and
    // cosmiconfig's `JSON Error in <file>:` wrapper never appears. Two graded cases.
    expect(Object.keys(defaultLoadersSync).sort()).toEqual(['.cjs', '.js', '.json', 'noExt']);
    expect(Object.keys(defaultLoaders).sort()).toEqual(['.cjs', '.js', '.json', '.mjs', 'noExt']);
  });
});

describe('the walk and its bounds', () => {
  it('finds the nearest config above the starting directory and stops at `stopDir`', () => {
    writeFileSync(join(root, 'a', 'walk.config.js'), 'module.exports = { found: "near" };');
    expect(lilconfigSync('walk', { stopDir: root }).search(deep)).toEqual({ config: { found: 'near' }, filepath: join(root, 'a', 'walk.config.js') });
    rmSync(join(root, 'a', 'walk.config.js'));
  });

  it('returns null, not a result, when nothing is found', () => {
    expect(lilconfigSync('absent', { stopDir: root }).search(deep)).toBeNull();
  });
});

describe("the disagreements with cosmiconfig that lilconfig's suite asserts", () => {
  it('refuses an empty path before touching the disk', () => {
    expect(() => lilconfigSync('x').load('')).toThrow('load must pass a non-empty string');
  });

  it('names the whole search place when one has no loader', () => {
    expect(() => lilconfigSync('x', { searchPlaces: ['file.coffee'] })).toThrow('Missing loader for extension "file.coffee"');
  });

  it('names the type it was given when a loader is not a function', () => {
    expect(() => lilconfigSync('x', { searchPlaces: ['file.js'], loaders: { '.js': {} as never } })).toThrow('Loader for extension "file.js" is not a function: Received object.');
  });

  it('walks a `packageProp` path without guarding `null`, which is a throw and is graded', () => {
    const pkg = join(deep, 'package.json');
    writeFileSync(pkg, JSON.stringify({ bar: null }));
    expect(() => lilconfigSync('x', { packageProp: 'bar.baz', stopDir: root }).search(deep)).toThrow("Cannot read properties of null (reading 'baz')");
    rmSync(pkg);
  });

  it('collapses a falsy `packageProp` result to `null` and keeps searching', () => {
    const pkg = join(deep, 'package.json');
    writeFileSync(pkg, JSON.stringify({ x: '' }));
    expect(lilconfigSync('x', { stopDir: deep }).search(deep)).toBeNull();
    rmSync(pkg);
  });
});

describe('empty files, caches and transforms', () => {
  it('skips an empty search place by default and reports it when told not to', () => {
    const file = join(deep, 'empty.config.js');
    writeFileSync(file, '');
    expect(lilconfigSync('empty', { stopDir: deep }).search(deep)).toBeNull();
    expect(lilconfigSync('empty', { stopDir: deep, ignoreEmptySearchPlaces: false }).search(deep)).toEqual({ config: undefined, filepath: file, isEmpty: true });
    rmSync(file);
  });

  it('serves a second search of the same directory from the cache, and stops when cleared', () => {
    const file = join(deep, 'cached.config.js');
    writeFileSync(file, 'module.exports = { n: 1 };');
    const explorer = lilconfigSync('cached', { stopDir: deep });
    const first = explorer.search(deep);
    expect(explorer.search(deep)).toBe(first);
    explorer.clearCaches();
    expect(explorer.search(deep)).not.toBe(first);
    rmSync(file);
  });

  it('caches nothing when `cache` is off', () => {
    const file = join(deep, 'uncached.config.js');
    writeFileSync(file, 'module.exports = { n: 1 };');
    const explorer = lilconfigSync('uncached', { stopDir: deep, cache: false });
    expect(explorer.search(deep)).not.toBe(explorer.search(deep));
    rmSync(file);
  });

  it('runs `transform` over a hit and over a miss alike', async () => {
    const file = join(deep, 'shaped.config.js');
    writeFileSync(file, 'module.exports = { n: 1 };');
    const seen: Array<string | null> = [];
    const explorer = lilconfig('shaped', {
      stopDir: deep,
      transform: (result) => {
        seen.push(result === null ? null : result.filepath);
        return result;
      },
    });
    await explorer.search(deep);
    await lilconfig('nothing-here', { stopDir: deep, transform: (r) => (seen.push(r === null ? null : r.filepath), r) }).search(deep);
    expect(seen).toEqual([file, null]);
    rmSync(file);
  });
});
