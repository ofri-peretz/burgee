/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — no README and no source header claims a grade the oracle does not hold
 * (`graded-override-targets` R1, PRINCIPLES rule 3).
 *
 * `seniority`'s README said "each path is graded by its incumbent's own suite" while
 * `seniority/find-up` — documented in the same file, and whose header calls itself "the override
 * target for `find-up`" — had no vendored suite and no `GRADED` row. "Compatible" was a sentence
 * there, not a number.
 *
 * Two places make the claim, and both are read:
 *
 * 1. A published package's README, under `## Compatibility`: every `###` heading that names a
 *    path in code — a family subpath (`seniority/dotenv`) or the incumbent it stands for
 *    (`cosmiconfig`) — must be a `DROP_INS` pair whose host has a `GRADED` row.
 * 2. A published package's `src/*.ts` header: "override target for `x`" or "drop-in for `x`"
 *    must name an incumbent `DROP_INS` maps from, with a `GRADED` row.
 *
 * Either may instead say "not graded" in those words, which is the honest sentence while the
 * suite is not vendored yet. The tables are imported, not copied, so a host the oracle grades
 * tomorrow is covered the day it lands.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `burgee/*` resolves from another checkout's dist/ in an uninstalled worktree, and `compat.ts` is not an export
import { DROP_INS, GRADED } from '../packages/burgee/src/compat.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

const NOT_GRADED = /\bnot graded\b/iu;

/** Published family packages: the ones a reader installs, and so the ones whose words are claims. */
const published = readdirSync(PACKAGES).filter((dir) => {
  const manifest = join(PACKAGES, dir, 'package.json');
  return existsSync(manifest) && (JSON.parse(readFileSync(manifest, 'utf8')) as { private?: boolean }).private !== true;
});

/** A path is graded when a `DROP_INS` pair names it, on either side, and its host has a `GRADED` row. */
const graded = (path: string): boolean => DROP_INS.some((d) => (d.to === path || d.from === path) && GRADED[d.host] !== undefined);

interface Claim {
  where: string;
  path: string;
  honest: boolean;
}

/** `### …` sections under `## Compatibility`, each with the first path it names in code. */
const readmeClaims = (pkg: string, text: string): Claim[] => {
  const section = /^## Compatibility\s*$([\s\S]*?)(?=^## |(?![\s\S]))/mu.exec(text)?.[1] ?? '';
  return section
    .split(/^(?=### )/mu)
    .filter((part) => part.startsWith('### '))
    .flatMap((part) => {
      const heading = part.slice(0, part.indexOf('\n') === -1 ? undefined : part.indexOf('\n'));
      const path = /`([^`]+)`/u.exec(heading)?.[1];
      // A heading that names nothing in code is prose, and claims no path.
      return path === undefined ? [] : [{ where: `packages/${pkg}/README.md ${heading.trim()}`, path, honest: NOT_GRADED.test(part) }];
    });
};

/** The leading doc comment of a source file, where a module states what it stands in for. */
const headerClaims = (where: string, text: string): Claim[] => {
  const header = /^\s*\/\*\*([\s\S]*?)\*\//u.exec(text)?.[1] ?? '';
  return [...header.matchAll(/(?:override target|drop-in) for `([^`]+)`/giu)].map(([, path]) => ({ where, path: path!, honest: NOT_GRADED.test(header) }));
};

const claims: Claim[] = published.flatMap((pkg) => {
  const readme = join(PACKAGES, pkg, 'README.md');
  const fromReadme = existsSync(readme) ? readmeClaims(pkg, readFileSync(readme, 'utf8')) : [];
  const src = join(PACKAGES, pkg, 'src');
  const fromSource = existsSync(src)
    ? readdirSync(src)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
        .flatMap((file) => headerClaims(`packages/${pkg}/src/${file}`, readFileSync(join(src, file), 'utf8')).map((c) => ({ ...c, where: `${c.where} (${pkg}/${file.slice(0, -'.ts'.length)})` })))
    : [];
  return [...fromReadme, ...fromSource];
});

describe('a README or a source header claims a grade only where the oracle holds one', () => {
  it('found claims to check, so the assertion below cannot pass vacuously', () => {
    expect(claims.length).toBeGreaterThan(3);
  });

  it('every claimed path is graded, or says "not graded"', () => {
    const ungraded = claims.filter((c) => !c.honest && !graded(c.path)).map((c) => `${c.where}: \`${c.path}\` has no GRADED row behind a DROP_INS pair`);
    expect(ungraded).toEqual([]);
  });
});

describe('the reader itself', () => {
  it('reads a ### heading under ## Compatibility, and nothing outside it', () => {
    const text = '## Migrating\n\n### `x/out`\n\n## Compatibility\n\nprose\n\n### `x/in`\n\ngraded.\n\n### `x/honest`\n\nNot graded yet.\n\n## Benchmarks\n\n### `x/after`\n';
    expect(readmeClaims('x', text).map((c) => [c.path, c.honest])).toEqual([
      ['x/in', false],
      ['x/honest', true],
    ]);
  });

  it('reads a Compatibility section that runs to the end of the file', () => {
    expect(readmeClaims('x', '## Compatibility\n\n### `x/last`\n').map((c) => c.path)).toEqual(['x/last']);
  });

  it('reads an override-target or drop-in sentence from the leading comment only', () => {
    const text = '/**\n * `x/y` — the override target for `find-up`, and a drop-in for `locate-path`.\n */\n// a drop-in for `later` is not a header\n';
    expect(headerClaims('f', text).map((c) => c.path)).toEqual(['find-up', 'locate-path']);
    expect(headerClaims('f', '/** the drop-in for `z`. Not graded yet. */').map((c) => c.honest)).toEqual([true]);
  });

  it('holds a path graded only with a GRADED row behind its DROP_INS pair', () => {
    expect(graded('seniority/dotenv')).toBe(true);
    expect(graded('cosmiconfig')).toBe(true);
    expect(graded('nobody/nothing')).toBe(false);
  });
});
