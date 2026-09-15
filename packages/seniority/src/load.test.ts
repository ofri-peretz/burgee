/** R6 — four builtin loaders, everything else injected, and a named extension is never a silent miss. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultLoaders, loaderFor, LoaderError, loadPath, NOT_BUNDLED } from './load.js';

const dir = mkdtempSync(join(tmpdir(), 'seniority-load-'));
const write = (rel: string, body: string): string => {
  const at = join(dir, rel);
  mkdirSync(join(at, '..'), { recursive: true });
  writeFileSync(at, body);
  return at;
};

describe('the builtin loaders (R6)', () => {
  it('are exactly the four formats Node can read with no parser: JSON and the three JavaScript spellings', () => {
    expect(Object.keys(defaultLoaders)).toEqual(['.json', '.js', '.mjs', '.cjs']);
  });

  it('reads JSON', async () => {
    await expect(loadPath(write('a.json', '{"region":"eu"}'))).resolves.toEqual({ region: 'eu' });
  });

  it('reads an ES module and awaits a function default, so a config may compute itself', async () => {
    await expect(loadPath(write('b.mjs', 'export default () => ({ region: "computed" });'))).resolves.toEqual({ region: 'computed' });
  });

  it('is frozen, so a caller cannot mutate the defaults out from under another caller', () => {
    expect(Object.isFrozen(defaultLoaders)).toBe(true);
  });
});

describe('an extension with no loader is USAGE, not a silent miss (R6)', () => {
  it('names the extension and the option that would supply one', () => {
    const error = caught(() => loaderFor('/tmp/app.config.toml'));
    expect(error.extension).toBe('.toml');
    expect(error.message).toBe('no loader for ".toml"');
    expect(error.hint).toBe('pass loaders: { ".toml": (filepath, content) => … } — seniority bundles no format parser');
  });

  it('is USAGE and not CONFIG, because the caller wired it wrong — the file may be perfect', () => {
    // The distinction is the exit code a program reports: CONFIG (3) says "your config file
    // is wrong", which would send the user to a file that is fine. USAGE (2) says the
    // program did not declare the loader it needs.
    expect(caught(() => loaderFor('/tmp/app.config.toml')).exitCode).toBe(2);
  });

  it('names the four formats deliberately not bundled, each of which is a caller-supplied loader', () => {
    expect([...NOT_BUNDLED]).toEqual(['.yaml', '.yml', '.json5', '.toml', '.ini']);
    for (const extension of NOT_BUNDLED) expect(defaultLoaders).not.toHaveProperty(extension);
  });

  it('a file with no extension at all is the same answer, named as such', () => {
    expect(caught(() => loaderFor('/tmp/.apprc')).message).toBe('no loader for a file with no extension: /tmp/.apprc');
  });
});

describe('injected loaders (R6, constraint 3)', () => {
  it('accepts one for an extension seniority does not bundle', async () => {
    const at = write('c.ini', 'region = eu');
    await expect(loadPath(at, { loaders: { '.ini': ini } })).resolves.toEqual({ region: 'eu' });
  });

  it('lets a caller override a builtin, because a program that wants JSON5 for `.json` may have it', async () => {
    const at = write('d.json', 'anything at all');
    await expect(loadPath(at, { loaders: { '.json': () => ({ region: 'overridden' }) } })).resolves.toEqual({ region: 'overridden' });
  });

  it('reports a file that does not parse with the path and the parser’s own words, as CONFIG', async () => {
    await expect(loadPath(write('e.json', '{not json'))).rejects.toThrow(/e\.json is not valid JSON/u);
  });
});

/** A four-line INI reader, standing in for the parser a caller would inject. */
function ini(_filepath: string, content: string): unknown {
  return Object.fromEntries([content.split(' = ') as [string, string]]);
}

function caught(fn: () => unknown): LoaderError {
  try {
    fn();
  } catch (error) {
    if (error instanceof LoaderError) return error;
  }
  throw new Error('expected a LoaderError');
}
