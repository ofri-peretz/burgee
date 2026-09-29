/**
 * `cosmiconfig-defaults.ts`: the search-place lists and the loader tables, as data and as the
 * four loaders behind them.
 *
 * The lists are asserted whole, in order, because the order *is* the contract — the first
 * place that holds a config wins — and a generator that produced the same set in another order
 * would pass every membership check there is.
 *
 * `loadJs` has four ways out and each is forced here with a real file. The trick that reaches
 * the fallback is an extension Node's ESM loader refuses (`ERR_UNKNOWN_FILE_EXTENSION`) and
 * `require` reads as CommonJS, so `import()` fails and `require` runs the file's own code —
 * which can then succeed, throw, or throw exactly the complaint the rethrow rule keys on.
 */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  defaultLoaders,
  defaultLoadersSync,
  getDefaultSearchPlaces,
  getDefaultSearchPlacesSync,
  globalConfigSearchPlaces,
  globalConfigSearchPlacesSync,
  loadJs,
  loadJson,
  loadJsSync,
  loadYaml,
  metaSearchPlaces,
} from './cosmiconfig-defaults.js';
import { LoaderError } from './load.js';

const root = realpathSync(mkdtempSync(join(tmpdir(), 'seniority-cosmiconfig-defaults-')));
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});
const file = (name: string, body: string): string => {
  const at = join(root, name);
  writeFileSync(at, body);
  return at;
};

describe('the search places, in order', () => {
  it('lists the async explorer’s twenty-one places', () => {
    expect(getDefaultSearchPlaces('app')).toEqual([
      'package.json',
      '.apprc',
      '.apprc.json',
      '.apprc.yaml',
      '.apprc.yml',
      '.apprc.js',
      '.apprc.ts',
      '.apprc.cjs',
      '.apprc.mjs',
      '.config/apprc',
      '.config/apprc.json',
      '.config/apprc.yaml',
      '.config/apprc.yml',
      '.config/apprc.js',
      '.config/apprc.ts',
      '.config/apprc.cjs',
      '.config/apprc.mjs',
      'app.config.js',
      'app.config.ts',
      'app.config.cjs',
      'app.config.mjs',
    ]);
  });

  it('drops every `.mjs` for the sync explorer and nothing else', () => {
    expect(getDefaultSearchPlacesSync('app')).toEqual(getDefaultSearchPlaces('app').filter((place) => !place.endsWith('.mjs')));
    expect(getDefaultSearchPlacesSync('app')).toHaveLength(18);
    expect(globalConfigSearchPlaces).toEqual(['config', 'config.json', 'config.yaml', 'config.yml', 'config.js', 'config.ts', 'config.cjs', 'config.mjs']);
    expect(globalConfigSearchPlacesSync).toEqual(['config', 'config.json', 'config.yaml', 'config.yml', 'config.js', 'config.ts', 'config.cjs']);
    expect(metaSearchPlaces[0]).toBe('package.json');
  });
});

describe('the loader tables', () => {
  it('maps every extension to its loader, and cannot be edited by a caller', () => {
    expect(Object.keys(defaultLoaders)).toEqual(['.mjs', '.cjs', '.js', '.ts', '.cts', '.mts', '.json', '.yaml', '.yml', 'noExt']);
    expect(defaultLoaders['.js']).toBe(loadJs);
    expect(defaultLoaders['.json']).toBe(loadJson);
    expect(defaultLoaders['noExt']).toBe(loadYaml);
    expect(Object.keys(defaultLoadersSync)).toEqual(['.cjs', '.js', '.cts', '.ts', '.json', '.yaml', '.yml', 'noExt']);
    expect(defaultLoadersSync['.js']).toBe(loadJsSync);
    expect(Object.isFrozen(defaultLoaders) && Object.isFrozen(defaultLoadersSync)).toBe(true);
  });
});

describe('loadJson and loadYaml', () => {
  it('parses JSON, and writes the file into a parse error’s message without changing its type', () => {
    expect(loadJson('/x.json', '{"a":1}')).toEqual({ a: 1 });
    let caught: unknown;
    try {
      loadJson('/x.json', '{ nope');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SyntaxError);
    expect((caught as Error).message).toMatch(/^JSON Error in \/x\.json:\n\S/);
  });

  it('reads the JSON subset of YAML and refuses the rest by name, with the option that fixes it', () => {
    expect(loadYaml('/x.yaml', '{"a":[1]}')).toEqual({ a: [1] });
    let caught: unknown;
    try {
      loadYaml('/x.yaml', 'a: 1\n');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LoaderError);
    expect(caught).toMatchObject({ message: 'no YAML parser for /x.yaml', extension: '.yaml' });
    expect((caught as LoaderError).hint).toMatch(/^pass loaders: \{ "\.yaml": yaml\.load/);
  });
});

describe('loadJsSync', () => {
  it('requires the file afresh every time, so an edit between two loads is seen', () => {
    const at = file('fresh.cjs', 'module.exports = { n: 1 };');
    expect(loadJsSync(at)).toEqual({ n: 1 });
    writeFileSync(at, 'module.exports = { n: 2 };');
    expect(loadJsSync(at)).toEqual({ n: 2 });
  });
});

/**
 * A file that numbers each time it runs and throws `make(n)`. Node refuses the extension on
 * `import()` without running it; vitest's runner runs it. Either way `require` is the
 * **last** run, so "which error came back" is answered by the number on it.
 */
const counted = async (name: string, make: string): Promise<{ error: Error; runs: number }> => {
  const key = `__seniority_${name}`;
  const at = file(`${name}.cfgjs`, `const n = (globalThis.${key} = (globalThis.${key} ?? 0) + 1);\nthrow ${make};`);
  const error = (await loadJs(at).catch((caught: unknown) => caught)) as Error;
  return { error, runs: (globalThis as Record<string, unknown>)[key] as number };
};

/** The `import()` error: Node's refusal when it never ran the file, or the first run's when it did. */
const fromImport = (runs: number): RegExp => (runs === 1 ? /Unknown file extension/ : /^run 1\b/);

describe('loadJs', () => {
  it('imports an ES module’s default export, and a CommonJS module’s `module.exports`', async () => {
    expect(await loadJs(file('esm.mjs', 'export default { from: "esm" };'))).toEqual({ from: 'esm' });
    expect(await loadJs(file('cjs.cjs', 'module.exports = { from: "cjs" };'))).toEqual({ from: 'cjs' });
  });

  it('falls back to `require` when `import()` refuses the file', async () => {
    expect(await loadJs(file('fallback.cfgjs', 'module.exports = { from: "require" };'))).toEqual({ from: 'require' });
  });

  it('rethrows the `require` error when it names a real problem', async () => {
    await expect(loadJs(file('boom.cfgjs', 'throw new Error("boom in the config");'))).rejects.toThrow('boom in the config');
    await expect(loadJs(file('null.cfgjs', 'throw null;'))).rejects.toBeNull();
  });


  it('rethrows the `import()` error when `require` only complains that the file is an ES module', async () => {
    const byCode = await counted('bycode', 'Object.assign(new Error("run " + n), { code: "ERR_REQUIRE_ESM" })');
    expect(byCode.error.message).toMatch(fromImport(byCode.runs));
    const byMessage = await counted('bymessage', 'new SyntaxError("run " + n + " Cannot use import statement outside a module")');
    expect(byMessage.error.message).toMatch(fromImport(byMessage.runs));
  });

  it('rethrows the `require` error when the complaint is not a SyntaxError, whatever it says', async () => {
    const notSyntax = await counted('notsyntax', 'new Error("run " + n + " Cannot use import statement outside a module")');
    expect(notSyntax.error.message).toBe(`run ${String(notSyntax.runs)} Cannot use import statement outside a module`);
  });
});
