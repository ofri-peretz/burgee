/**
 * U10's fixture: a named import from a package's root bundles to exactly the bytes the same
 * import from its subpath does.
 *
 * A root that re-exports everything is only free if a bundler can drop what a caller does not
 * use. picocolors #70 and a run of chalk issues are users finding out it could not. This bundles
 * `import { x } from 'pkg'` and `import { x } from 'pkg/sub'` with esbuild — minified, ESM,
 * reading each package's `sideEffects` — for every name the root re-exports as the *same
 * binding* a subpath does, and requires the two to be equal to the byte.
 *
 * Subpaths a package lists in `sideEffects` are skipped: a `bin` runs when imported, which is
 * the point of listing it (`side-effects-lock.test.ts`). paratext contributes no pair: its root
 * `link` is a different function from `paratext/link`, the lightweight one, so there is no
 * same-binding pair to compare, and comparing different functions would measure nothing.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLISHED = ['bellpull', 'burgee', 'caique', 'closeout', 'flagstaff', 'linegauge', 'paratext', 'roundel', 'seniority'];
/** Fewer than this means the discovery broke, not that the packages got smaller. */
const MIN_PAIRS = 25;

interface Pair {
  pkg: string;
  subpath: string;
  name: string;
}

async function bytes(code: string): Promise<number> {
  const out = await build({ stdin: { contents: code, resolveDir: root }, bundle: true, minify: true, format: 'esm', platform: 'node', write: false, logLevel: 'silent' });
  return out.outputFiles[0]?.contents.length ?? 0;
}

/** Every same-binding root/subpath pair in one package. */
async function pairsOf(pkg: string): Promise<Pair[]> {
  const manifest = JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8')) as {
    exports: Record<string, string | { import?: string }>;
    sideEffects?: boolean | string[];
  };
  const effectful = new Set(Array.isArray(manifest.sideEffects) ? manifest.sideEffects : []);
  // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the specifier is one of this repository's own package names, from a constant list
  const rootModule = (await import(pkg)) as Record<string, unknown>;
  const subpaths = Object.entries(manifest.exports).filter(
    ([subpath, condition]) => subpath !== '.' && typeof condition !== 'string' && condition.import !== undefined && !effectful.has(condition.import),
  );
  const found = await Promise.all(
    subpaths.map(async ([subpath]) => {
      // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- the specifier comes from the package's own exports map
      const sub = (await import(`${pkg}${subpath.slice(1)}`)) as Record<string, unknown>;
      const name = Object.keys(sub).find((k) => k !== 'default' && rootModule[k] !== undefined && rootModule[k] === sub[k]);
      return name === undefined ? [] : [{ pkg, subpath, name }];
    }),
  );
  return found.flat();
}

const PAIRS = (await Promise.all(PUBLISHED.map(pairsOf))).flat();

describe('a root named import costs what the subpath import costs (U10)', () => {
  it(`finds at least ${MIN_PAIRS} same-binding pairs, so this cannot pass by comparing nothing`, () => {
    expect(PAIRS.length).toBeGreaterThanOrEqual(MIN_PAIRS);
  });

  it.each(PAIRS)('$pkg: { $name } from the root costs what it costs from $subpath', async ({ pkg, subpath, name }) => {
    const fromRoot = await bytes(`import { ${name} } from '${pkg}'; console.log(${name});`);
    const fromSub = await bytes(`import { ${name} } from '${pkg}${subpath.slice(1)}'; console.log(${name});`);
    expect(fromRoot, `the root import pulls ${fromRoot - fromSub} bytes the subpath does not`).toBe(fromSub);
  });
});
