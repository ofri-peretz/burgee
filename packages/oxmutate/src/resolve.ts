/**
 * Resolve a bare specifier the way `import` would, from the project under test (not from this
 * package). `createRequire().resolve` follows the `require` condition and lands on Vitest's
 * CommonJS entry, which Vitest refuses to load; this follows `import`, then `default`.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Exports = string | { [condition: string]: Exports } | null | undefined;

function pick(entry: Exports): string | undefined {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return undefined;
  for (const condition of ['import', 'node', 'default']) {
    const found = pick(entry[condition]);
    if (found) return found;
  }
  return undefined;
}

export function resolveEsm(specifier: string, fromDir: string): string {
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier);
  const subpath = `.${specifier.slice(name.length)}` || '.';
  const req = createRequire(path.join(fromDir, 'package.json'));
  const pkgJson = req.resolve(`${name}/package.json`);
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8')) as { exports?: Record<string, Exports> | string; module?: string; main?: string };
  const exportsMap = typeof pkg.exports === 'string' ? { '.': pkg.exports } : pkg.exports;
  let target: string | undefined;
  if (exportsMap) target = pick(exportsMap[subpath]);
  else target = subpath === '.' ? (pkg.module ?? pkg.main) : subpath;
  if (!target) throw new Error(`oxmutate: cannot resolve ${specifier} from ${fromDir}`);
  return pathToFileURL(path.join(path.dirname(pkgJson), target)).href;
}
