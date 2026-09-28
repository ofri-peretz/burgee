/**
 * `burgee/meow`'s package lookup: the nearest `package.json` above the caller's module that
 * parses. The walk is `seniority/find-up`'s since 2026-09-28; what these pin is meow's reading
 * of it, which the move had to keep.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { readPackageUp } from './present.js';

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'burgee-meow-pkg-'));
  for (const [path, body] of Object.entries(files)) {
    const at = join(root, path);
    mkdirSync(join(at, '..'), { recursive: true });
    writeFileSync(at, body);
  }
  return root;
}

const metaAt = (file: string): ImportMeta => ({ url: pathToFileURL(file).href }) as ImportMeta;

describe('readPackageUp', () => {
  it('reads the nearest package.json above the module', () => {
    const root = tree({ 'package.json': '{"name":"outer"}', 'a/b/package.json': '{"name":"inner"}', 'a/b/c/cli.js': '' });
    expect(readPackageUp(metaAt(join(root, 'a/b/c/cli.js')))).toEqual({ name: 'inner' });
  });

  it('steps over one that does not parse, to the next one up', () => {
    const root = tree({ 'package.json': '{"name":"outer"}', 'a/b/package.json': '{ not json', 'a/b/c/cli.js': '' });
    expect(readPackageUp(metaAt(join(root, 'a/b/c/cli.js')))).toEqual({ name: 'outer' });
  });

  it('is empty without an importMeta', () => {
    expect(readPackageUp(undefined)).toEqual({});
  });
});
