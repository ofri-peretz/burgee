/** R5, Y10 — the bounded upward walk: it stops, it says where it stopped, and a symlink cycle cannot spin it. */
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { search, searchAll, WALK_LIMIT } from './search.js';

const root = mkdtempSync(join(tmpdir(), 'seniority-search-'));
const at = (...parts: string[]): string => join(root, ...parts);
mkdirSync(at('a', 'b', 'c'), { recursive: true });
writeFileSync(at('a', 'app.config.json'), '{}');
writeFileSync(at('a', 'b', '.apprc'), '{}');

/** The directories a walk visits, in order: a walk for a name nothing matches, instrumented. */
function directories(options: { cwd: string; limit?: number }): string[] {
  const seen: string[] = [];
  search(['never-matches'], {
    ...options,
    exists: (path) => {
      seen.push(resolve(path, '..'));
      return false;
    },
  });
  return seen;
}

describe('the upward walk (R5)', () => {
  it('finds the nearest match and reports the directory and the depth it was found at', () => {
    const found = search(['.apprc', 'app.config.json'], { cwd: at('a', 'b', 'c') });
    expect(found?.path).toBe(at('a', 'b', '.apprc'));
    expect(found?.dir).toBe(at('a', 'b'));
    expect(found?.depth).toBe(1);
  });

  it('prefers the nearer directory over the earlier name, because proximity is the question being asked', () => {
    // `app.config.json` is first in the list and two directories up; `.apprc` is second and
    // one up. A walk that ordered by name would answer with the further file.
    expect(search(['app.config.json', '.apprc'], { cwd: at('a', 'b', 'c') })?.path).toBe(at('a', 'b', '.apprc'));
  });

  it('collects every match on the way up, nearest first', () => {
    expect(searchAll(['.apprc', 'app.config.json'], { cwd: at('a', 'b', 'c') }).map((f) => f.path)).toEqual([at('a', 'b', '.apprc'), at('a', 'app.config.json')]);
  });

  it('returns undefined rather than throwing when nothing is there', () => {
    expect(search(['nothing-is-here.json'], { cwd: at('a', 'b', 'c') })).toBeUndefined();
  });

  it('takes a single name as well as a list', () => {
    expect(search('.apprc', { cwd: at('a', 'b', 'c') })?.path).toBe(at('a', 'b', '.apprc'));
  });
});

describe('the walk is bounded (Y10)', () => {
  it('stops at `stopAt`, inclusive, and never looks above it', () => {
    expect(search(['app.config.json'], { cwd: at('a', 'b', 'c'), stopAt: at('a', 'b') })).toBeUndefined();
    expect(search(['app.config.json'], { cwd: at('a', 'b', 'c'), stopAt: at('a') })?.path).toBe(at('a', 'app.config.json'));
  });

  it('stops at the filesystem root rather than looping on `dirname("/") === "/"`', () => {
    expect(directories({ cwd: resolve(sep) })).toEqual([resolve(sep)]);
  });

  it('visits at most WALK_LIMIT directories, so a pathological depth cannot hang a start-up', () => {
    const deep = at('a', ...Array.from({ length: WALK_LIMIT + 5 }, (_, i) => `d${String(i)}`));
    mkdirSync(deep, { recursive: true });
    expect(directories({ cwd: deep })).toHaveLength(WALK_LIMIT);
  });

  it('takes an explicit smaller limit', () => {
    expect(directories({ cwd: at('a', 'b', 'c'), limit: 2 })).toEqual([at('a', 'b', 'c'), at('a', 'b')]);
  });
});

describe('symlinks (R5)', () => {
  it('follows a link once and refuses to follow a cycle twice', () => {
    const ring = mkdtempSync(join(tmpdir(), 'seniority-ring-'));
    mkdirSync(join(ring, 'inner'));
    // `inner/up` points back at `ring`, so a walk that did not compare real paths would
    // revisit `ring/inner` for as long as the limit allowed.
    symlinkSync(ring, join(ring, 'inner', 'up'), 'dir');
    const walked = directories({ cwd: join(ring, 'inner', 'up', 'inner') });
    expect(new Set(walked.map((d) => resolve(d))).size).toBe(walked.length);
  });
});
