/** R3, R5, R6 wired into discovery: lines recorded, loaders injected, the walk bounded. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { discover, lineOf } from './config.js';
import { LoaderError } from './load.js';

const dir = mkdtempSync(join(tmpdir(), 'seniority-discovery-'));
const write = (rel: string, body: string): string => {
  const at = join(dir, rel);
  mkdirSync(join(at, '..'), { recursive: true });
  writeFileSync(at, body);
  return at;
};

describe('a JSON layer records the line each key is set on (R3, R12)', () => {
  it('finds a top-level key’s line, one-based', () => {
    expect(lineOf('{\n  "a": 1,\n  "out": 4\n}', 'out')).toBe(3);
  });

  it('returns undefined for a key the text does not set, rather than guessing at 1', () => {
    expect(lineOf('{\n  "a": 1\n}', 'out')).toBeUndefined();
  });

  it('is on the layer `discover` hands back, so `--explain` and R12 can cite a line', async () => {
    const cwd = join(dir, 'lines');
    write('lines/app.config.json', '{\n  "region": "eu",\n  "out": "lib"\n}');
    const found = await discover({ name: 'app', cwd, env: {} });
    expect(found?.lines).toEqual({ region: 2, out: 3 });
  });

  it('has no lines for a JavaScript config, because there is no parser to ask', async () => {
    const cwd = join(dir, 'nolines');
    write('nolines/app.config.mjs', 'export default { region: "eu" };');
    expect((await discover({ name: 'app', cwd, env: {} }))?.lines).toBeUndefined();
  });
});

describe('loaders reach discovery (R6)', () => {
  it('an injected loader makes a format seniority does not bundle discoverable', async () => {
    const cwd = join(dir, 'ini');
    write('ini/app.config.ini', 'region = eu');
    const loaders = { '.ini': (_f: string, content: string): unknown => Object.fromEntries([content.split(' = ') as [string, string]]) };
    const found = await discover({ name: 'app', cwd, env: {}, loaders, extensions: ['.ini'] });
    expect(found?.data).toEqual({ region: 'eu' });
  });

  it('an explicit --config in a format nobody supplied a loader for is the USAGE refusal, not silence', async () => {
    const explicit = write('toml/app.config.toml', 'region = "eu"');
    await expect(discover({ name: 'app', cwd: dir, env: {}, explicit })).rejects.toThrow(LoaderError);
  });
});

describe('discovery walks upward when asked (R5)', () => {
  it('finds a config in an ancestor directory and says which one', async () => {
    write('up/app.config.json', '{"region":"root"}');
    mkdirSync(join(dir, 'up', 'a', 'b'), { recursive: true });
    const found = await discover({ name: 'app', cwd: join(dir, 'up', 'a', 'b'), env: {}, upward: true });
    expect(found?.path).toBe(join(dir, 'up', 'app.config.json'));
  });

  it('does not walk upward by default, because a surprise parent config is worse than none', async () => {
    expect(await discover({ name: 'app', cwd: join(dir, 'up', 'a', 'b'), env: {} })).toBeUndefined();
  });

  it('honours `stopAt`, so a monorepo package never reads the repository root’s config by accident', async () => {
    const found = await discover({ name: 'app', cwd: join(dir, 'up', 'a', 'b'), env: {}, upward: true, stopAt: join(dir, 'up', 'a') });
    expect(found).toBeUndefined();
  });
});
