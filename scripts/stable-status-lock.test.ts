// A package at 1.x must not tell its readers it is pre-1.0. caique shipped 1.0.0 on 2026-10-08
// while its README and docs index still opened with "Released, pre-1.0.".
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const PRE_1_0 = /\bpre-1\.0\b|\bpre-release\b|\breserved\b(?= package| name)/iu;

/** `pkg` for every package whose manifest is at 1.x or later yet whose README says pre-1.0. */
export function staleStatus(readmes: Record<string, { version: string; readme: string }>): string[] {
  return Object.entries(readmes)
    .filter(([, { version, readme }]) => Number(version.split('.')[0]) >= 1 && PRE_1_0.test(readme))
    .map(([pkg]) => pkg);
}

describe('a 1.x package does not call itself pre-1.0', () => {
  it('flags a 1.x README that says pre-1.0, and passes a 0.x one', () => {
    expect(staleStatus({ a: { version: '1.0.0', readme: '**Released, pre-1.0.**' }, b: { version: '0.3.1', readme: 'pre-1.0' } })).toEqual(['a']);
  });

  it('holds for every published package', () => {
    const readmes = Object.fromEntries(
      readdirSync(join(ROOT, 'packages'))
        .filter((p) => existsSync(join(ROOT, 'packages', p, 'README.md')))
        .map((p) => [p, { version: (JSON.parse(readFileSync(join(ROOT, 'packages', p, 'package.json'), 'utf8')) as { version: string }).version, readme: readFileSync(join(ROOT, 'packages', p, 'README.md'), 'utf8') }]),
    );
    expect(staleStatus(readmes)).toEqual([]);
  });
});
