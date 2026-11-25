/**
 * The home's numbers are the files' numbers. Read against the real repository, so a renamed
 * baseline or a moved field empties the band in this test before it empties it on the site.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { homeStats, SIZE_BASELINE } from './home-stats';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const json = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as T;

describe('homeStats', () => {
  it('reads roundel’s numbers from their files', () => {
    const stats = Object.fromEntries(homeStats('roundel', ROOT).map((s) => [s.id, s]));
    const chalk = json<{ passed: number; reference: number }>('packages/compat-oracle/baseline/chalk.json');
    const colour = json<{ passed: number; reference: number }>('packages/compat-oracle/baseline/supports-color.json');
    expect(stats['incumbent-tests']?.value).toBe(`${chalk.passed + colour.passed} / ${chalk.reference + colour.reference}`);
    expect(stats['incumbent-tests']?.label).toBe('of chalk’s and supports-color’s own tests pass');
    expect(stats.dependencies?.value).toBe(String(Object.keys(json<{ dependencies?: object }>('packages/roundel/package.json').dependencies ?? {}).length));
    const size = json<Record<string, { size: number }>>(SIZE_BASELINE).roundel?.size ?? Number.NaN;
    expect(stats.size?.value).toBe(`${(size / 1000).toFixed(1)} kB`);
  });

  it('counts the incumbents rather than naming them past two', () => {
    expect(homeStats('seniority', ROOT).find((s) => s.id === 'incumbent-tests')?.label).toMatch(/^of \d+ incumbents’ own tests pass$/u);
  });

  it('shows no band for a package with fewer than two numbers on file', () => {
    expect(homeStats('no-such-package', ROOT)).toEqual([]);
  });
});
