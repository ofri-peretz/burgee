import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { scratchDirs } from './__fixtures__/run/scratch-dir.js';
import { builtinAdapters } from './inputs.js';
import { locate, loadPlugins } from './run-load.js';


const scratch = scratchDirs();
const PLUGIN = fileURLToPath(new URL('__fixtures__/run/plugin.mjs', import.meta.url));
const temp = (): string => realpathSync(scratch('apicontract-load-'));

const rejection = async (attempt: Promise<unknown>): Promise<string> => {
  try {
    await attempt;
  } catch (error) {
    expect((error as { code?: unknown }).code).toBe('CONFIG');
    return (error as Error).message;
  }
  throw new Error('expected a config error');
};

describe('locate', () => {
  it('resolves a relative path from the config folder, and an absolute one as it is', () => {
    expect(locate('./p.mjs', '/repo')).toBe(pathToFileURL('/repo/p.mjs').href);
    expect(locate('../shared/p.mjs', '/repo/app')).toBe(pathToFileURL('/repo/shared/p.mjs').href);
    expect(locate('/abs/p.mjs', '/repo')).toBe(pathToFileURL('/abs/p.mjs').href);
  });

  it('resolves a package name from the config folder, not from apicontract', () => {
    const root = temp();
    mkdirSync(join(root, 'node_modules/apicontract-plugin-x'), { recursive: true });
    writeFileSync(join(root, 'node_modules/apicontract-plugin-x/package.json'), '{ "name": "apicontract-plugin-x", "main": "index.js" }');
    writeFileSync(join(root, 'node_modules/apicontract-plugin-x/index.js'), '');
    expect(locate('apicontract-plugin-x', root)).toBe(pathToFileURL(join(root, 'node_modules/apicontract-plugin-x/index.js')).href);
  });
});

describe('loadPlugins', () => {
  it('registers the built-in formats first, then each configured plugin in order', async () => {
    const root = temp();
    writeFileSync(join(root, 'named.mjs'), 'export const plugin = { name: "named", generators: {} };\n');
    const host = await loadPlugins({ root, file: join(root, 'c.json'), plugins: [PLUGIN, './named.mjs'] });
    expect(host.plugins().map((plugin) => plugin.name)).toEqual(['apicontract', 'spine-test', 'named']);
    expect(host.plugins()[0]?.adapters).toBe(builtinAdapters);
    expect(host.generator('types').description).toBe('One type per schema, for the tests');
  });

  it('registers only the built-ins when the config names no plugin', async () => {
    const host = await loadPlugins({ root: temp(), file: 'c.json', plugins: [] });
    expect(host.plugins().map((plugin) => plugin.name)).toEqual(['apicontract']);
  });

  it('stops on a plugin that does not load, naming it and how to install it', async () => {
    const root = temp();
    expect(await rejection(loadPlugins({ root, file: '/r/c.json', plugins: ['./missing.mjs'] }))).toMatch(
      /^\/r\/c\.json cannot be used:\n {2}- the plugin "\.\/missing\.mjs" did not load \(.+\)\. fix: install it \(`npm i -D \.\/missing\.mjs`\) or correct its path in `plugins`$/su,
    );
    expect(await rejection(loadPlugins({ root, file: '/r/c.json', plugins: ['apicontract-plugin-nowhere'] }))).toContain('the plugin "apicontract-plugin-nowhere" did not load');
  });

  it('stops on a module that is not a plugin, with the host refusal and its fix', async () => {
    const root = temp();
    writeFileSync(join(root, 'bad.mjs'), 'export default { generators: {} };\n');
    writeFileSync(join(root, 'none.mjs'), 'export const x = 1;\n');
    expect(await rejection(loadPlugins({ root, file: '/r/c.json', plugins: ['./bad.mjs'] }))).toBe(
      '/r/c.json cannot be used:\n  - "./bad.mjs" is not a plugin apicontract can use: a plugin needs a name. fix: add `name: "…"`: it is how a refused plugin is reported',
    );
    expect(await rejection(loadPlugins({ root, file: '/r/c.json', plugins: ['./none.mjs'] }))).toContain('a plugin is a plain object');
  });
});
