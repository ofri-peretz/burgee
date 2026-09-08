/** commander-env V6, V7 — discovery order, --no-config, explicit misses, extends with deep merge and cycles, on real temp files. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { candidates, deepMerge, discover, loadWithExtends } from './config.js';
import { ConfigError } from './precedence.js';

const dir = mkdtempSync(join(tmpdir(), 'burgee-config-'));
const write = (rel: string, data: unknown): string => {
  const at = join(dir, rel);
  mkdirSync(join(at, '..'), { recursive: true });
  writeFileSync(at, typeof data === 'string' ? data : JSON.stringify(data));
  return at;
};

describe('discovery order (V6)', () => {
  it('lists explicit env, the cwd files by extension, then the user directory', () => {
    const w = resolve('/w');
    const xdg = resolve('/xdg');
    const list = candidates({ name: 'my-tool', cwd: w, env: { MY_TOOL_CONFIG: 'x.json', XDG_CONFIG_HOME: xdg } });
    expect(list.map((c) => c.path)).toEqual([join(w, 'x.json'), join(w, 'my-tool.config.json'), join(w, 'my-tool.config.mjs'), join(w, 'my-tool.config.js'), join(w, 'my-tool.config.cjs'), join(xdg, 'my-tool', 'config.json')]);
    expect(list[0]?.reason).toBe('MY_TOOL_CONFIG');
  });

  it('finds ./name.config.json in the cwd and nothing when there is none (silent)', async () => {
    const cwd = join(dir, 'a');
    write('a/app.config.json', { region: 'eu' });
    const hit = await discover({ name: 'app', cwd, env: {} });
    expect(hit?.data).toEqual({ region: 'eu' });
    expect(await discover({ name: 'app', cwd: join(dir, 'empty'), env: {} })).toBeUndefined();
  });

  it('loads a JavaScript config, object or function', async () => {
    const cwd = join(dir, 'js');
    write('js/app.config.mjs', 'export default () => ({ region: "fn" });');
    expect((await discover({ name: 'app', cwd, env: {} }))?.data).toEqual({ region: 'fn' });
  });

  it('--config names a file explicitly; a missing one is a CONFIG error, not silence (yargs #1676)', async () => {
    const explicit = write('e/custom.json', { region: 'x' });
    expect((await discover({ name: 'app', cwd: dir, env: {}, explicit }))?.data).toEqual({ region: 'x' });
    await expect(discover({ name: 'app', cwd: dir, env: {}, explicit: join(dir, 'nope.json') })).rejects.toThrow(ConfigError);
  });

  it('--no-config disables discovery entirely, explicit env included', async () => {
    write('n/app.config.json', { region: 'eu' });
    expect(await discover({ name: 'app', cwd: join(dir, 'n'), env: { APP_CONFIG: join(dir, 'n/app.config.json') }, disabled: true })).toBeUndefined();
  });

  it('reports invalid JSON as a CONFIG error naming the file', async () => {
    write('bad/app.config.json', '{ nope');
    await expect(discover({ name: 'app', cwd: join(dir, 'bad'), env: {} })).rejects.toThrow(/not valid JSON/);
  });
});

describe('extends (V7)', () => {
  it('deep-merges nested keys, the extending file winning (yargs #1305, #1627)', () => {
    expect(deepMerge({ a: { x: 1, y: 1 }, list: [1] }, { a: { y: 2, z: 3 }, list: [2] })).toEqual({ a: { x: 1, y: 2, z: 3 }, list: [2] });
  });

  it('resolves relative to the extending file, left to right, and records the chain', async () => {
    write('x/base.json', { region: 'base', log: { level: 'info', json: false } });
    write('x/team.json', { extends: './base.json', log: { level: 'debug' } });
    const top = write('x/app.config.json', { extends: ['./team.json'], region: 'top' });
    const loaded = await loadWithExtends(top);
    expect(loaded.data).toEqual({ region: 'top', log: { level: 'debug', json: false } });
    expect(loaded.chain.map((p) => basename(p))).toEqual(['base.json', 'team.json', 'app.config.json']);
  });

  it('rejects a cycle by name (yargs #1363)', async () => {
    write('c/a.json', { extends: './b.json' });
    const a = write('c/b.json', { extends: './a.json' });
    await expect(loadWithExtends(a)).rejects.toThrow(/extends itself/);
  });

  it('names an unresolvable extends target', async () => {
    const f = write('u/app.config.json', { extends: 'no-such-package-xyz' });
    await expect(loadWithExtends(f)).rejects.toThrow(/cannot be resolved/);
  });
});
