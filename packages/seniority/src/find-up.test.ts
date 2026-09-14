/** R8 — `seniority/find-up`: the override target, over the same bounded walk. */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findUp, findUpMultiple, findUpMultipleSync, findUpSync } from './find-up.js';

const root = mkdtempSync(join(tmpdir(), 'seniority-findup-'));
const at = (...parts: string[]): string => join(root, ...parts);
mkdirSync(at('a', 'b'), { recursive: true });
writeFileSync(at('package.json'), '{}');
writeFileSync(at('a', 'package.json'), '{}');

describe('seniority/find-up (R8)', () => {
  it('finds the nearest file walking up', () => {
    expect(findUpSync('package.json', { cwd: at('a', 'b') })).toBe(at('a', 'package.json'));
  });

  it('returns undefined rather than throwing when there is nothing to find', () => {
    expect(findUpSync('nothing.json', { cwd: at('a', 'b') })).toBeUndefined();
  });

  it('collects every match, nearest first', () => {
    expect(findUpMultipleSync('package.json', { cwd: at('a', 'b') })).toEqual([at('a', 'package.json'), at('package.json')]);
  });

  it('stops where it is told to (Y10)', () => {
    expect(findUpSync('package.json', { cwd: at('a', 'b'), stopAt: at('a', 'b') })).toBeUndefined();
  });

  it('answers the same through the async spellings a migrating caller awaits', async () => {
    await expect(findUp('package.json', { cwd: at('a', 'b') })).resolves.toBe(at('a', 'package.json'));
    await expect(findUpMultiple('package.json', { cwd: at('a', 'b') })).resolves.toHaveLength(2);
  });
});
