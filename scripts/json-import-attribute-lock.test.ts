/**
 * Lock — no package source imports JSON the way Node refuses.
 *
 * `import()` of a `.json` file without `with { type: 'json' }` throws
 * ERR_IMPORT_ATTRIBUTE_MISSING under Node, and vitest's own loader imports JSON without the
 * attribute, so no in-process suite can see it. `burgee check` shipped that defect on the
 * example locale pack (#1232), and the nine other hosts' `check` commands shipped it too, found
 * on 2026-10-25 while stamping: `roundel check plugin.json` printed Node's message and nothing
 * else. A plugin is data, and JSON is the plainest form of data an author writes.
 *
 * Two shapes, both read off the source as text:
 *
 *   1. a literal import of a `.json` specifier, static or dynamic, carries the attribute;
 *   2. a source file that `import()`s a user-named path (`pathToFileURL`) reads a `.json` one
 *      as data first, as `burgee/src/check.ts` does.
 *
 * `plugin-check-lock.test.ts` spawns each built bin on a `.json` plugin, which is the behaviour
 * this holds the shape of.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PACKAGES = join(ROOT, 'packages');

/** Every shipped source file: `src/**` less tests and fixtures. */
function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__fixtures__' && entry.name !== '__snapshots__') walk(at);
      } else if (/\.(?:ts|tsx|mts|mjs|js)$/u.test(entry.name) && !/\.test\.|\.d\.ts$/u.test(entry.name)) {
        out.push(at);
      }
    }
  };
  for (const pkg of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (pkg.isDirectory()) {
      try {
        walk(join(PACKAGES, pkg.name, 'src'));
      } catch {
        // A package with no src has nothing to hold.
      }
    }
  }
  return out.sort();
}

const posix = (path: string): string => relative(ROOT, path).split('\\').join('/');

/** A literal `.json` specifier in an import or `import()`, and whether an attribute follows it. */
const LITERAL = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])[^'"\n]+\.json\1(?<rest>[^;\n]*)/gu;

function bareJsonImports(text: string): string[] {
  return [...text.matchAll(LITERAL)].filter((m) => !/^\s*(?:,\s*\{\s*)?with\s*:?\s*\{\s*type\s*:\s*['"]json['"]/u.test(m.groups?.rest ?? '')).map((m) => m[0]);
}

describe('JSON imports in package sources', () => {
  const files = sources();

  it('walks real sources, so the cases below cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => posix(f) === 'packages/flagstaff/src/plugin.ts')).toBe(true);
  });

  it('the matcher tells a bare import from one with the attribute', () => {
    expect(bareJsonImports("import schema from './schema.json';")).toHaveLength(1);
    expect(bareJsonImports("const x = await import('./x.json');")).toHaveLength(1);
    expect(bareJsonImports("import schema from './schema.json' with { type: 'json' };")).toEqual([]);
    expect(bareJsonImports("const x = await import('./x.json', { with: { type: 'json' } });")).toEqual([]);
  });

  it('every literal .json import carries `with { type: \'json\' }`', () => {
    const bare = files.flatMap((f) => bareJsonImports(readFileSync(f, 'utf8')).map((m) => `${posix(f)}: ${m}`));
    expect(bare).toEqual([]);
  });

  it('every file that import()s a user-named path reads a .json one as data first', () => {
    const unguarded = files.filter((f) => {
      const text = readFileSync(f, 'utf8');
      return /\bimport\s*\(\s*pathToFileURL\(/u.test(text) && !text.includes(".endsWith('.json')");
    });
    // seniority's three config loaders import a user's config by path and are not plugin checks:
    // each routes `.json` to its own JSON loader by an extension table, so `import()` sees scripts only.
    const TABLED = ['packages/seniority/src/cosmiconfig-defaults.ts', 'packages/seniority/src/lilconfig.ts', 'packages/seniority/src/load.ts'];
    expect(unguarded.map(posix).filter((f) => !TABLED.includes(f))).toEqual([]);
  });
});
