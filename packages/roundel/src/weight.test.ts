/**
 * R8 / U5: every subpath under a ceiling named after the incumbent it replaces. `./tokens`
 * stays under picocolors (2,663 B measured 2026-09-08; 3,300 allowed); the rest under
 * budgets that are a decision, not a drift. Walks `dist/`, so it measures what ships.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const pkgRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(pkgRoot, 'dist');
const manifest = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as { exports: Record<string, { import: string }> };

interface Rule {
  budget: number;
  /** What it may reach among the package's own files, beyond itself. */
  reach: string[];
}

const PICOCOLORS = 3_300;

const RULES: Record<string, Rule> = {
  // The CI vendor table and chalk's TERM rules: 3.3 KB measured.
  './policy': { budget: 4_000, reach: [] },
  './contrast': { budget: 3_000, reach: [] },
  './theme': { budget: 7_000, reach: ['contrast.js'] },
  // The tokens plus the theme they read and the hex maths they fall back through — all of it under picocolors.
  './tokens': { budget: PICOCOLORS + 7_000 + 4_000 + 3_000, reach: ['policy.js', 'theme.js', 'contrast.js'] },
  '.': { budget: 20_000, reach: ['policy.js', 'tokens.js', 'theme.js', 'contrast.js'] },
};

const SPECIFIER = /(?:from|import)\s*'([^']+)'/g;

function walk(entry: string): { reached: string[]; external: string[]; bytes: number } {
  const files = new Set<string>();
  const external = new Set<string>();
  const queue = [entry];
  let bytes = 0;
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || files.has(file)) continue;
    files.add(file);
    bytes += statSync(file).size;
    for (const m of readFileSync(file, 'utf8').matchAll(SPECIFIER)) {
      const spec = m[1] ?? '';
      if (spec.startsWith('.')) queue.push(resolve(dirname(file), spec));
      else if (spec !== '' && !spec.startsWith('node:')) external.add(spec);
    }
  }
  return { reached: [...files].map((f) => relative(dist, f)), external: [...external], bytes };
}

describe.each(Object.keys(RULES))('entry %s', (subpath) => {
  const rule = RULES[subpath] as Rule;
  const graph = walk(resolve(pkgRoot, manifest.exports[subpath]?.import ?? ''));

  it('imports nothing outside Node', () => {
    expect(graph.external).toEqual([]);
  });

  it('reaches only what its rule names', () => {
    const own = relative(dist, resolve(pkgRoot, manifest.exports[subpath]?.import ?? ''));
    expect(graph.reached.filter((f) => f !== own).sort()).toEqual([...rule.reach].sort());
  });

  it('stays inside its byte budget', () => {
    expect(graph.bytes).toBeLessThanOrEqual(rule.budget);
  });
});

describe('the tokens entry alone is under picocolors (U5)', () => {
  it('tokens.js by itself', () => {
    expect(statSync(resolve(dist, 'tokens.js')).size).toBeLessThanOrEqual(PICOCOLORS);
  });
});

describe('the lock grows with the package', () => {
  it('every published entry declares a weight rule', () => {
    expect(Object.keys(manifest.exports).sort()).toEqual(Object.keys(RULES).sort());
  });
});
