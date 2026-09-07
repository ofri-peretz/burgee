/**
 * Vendors a host's own test suite and points it at our shim.
 *
 * The rewrite is one specifier and nothing else, scripted so it is reproducible
 * from a clean checkout (C6/R2). The upstream commit is recorded beside the
 * tests, and a scheduled job re-runs this to make the treadmill visible.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

import { type Host } from './hosts.js';

/** Length of an ISO date, `YYYY-MM-DD`. */
const ISO_DATE = 10;

export interface VendorResult {
  host: string;
  commit: string;
  files: number;
  /** Test files that import only the host's internals: vendored and graded, informationally. */
  internalFiles: string[];
  /** Internal module paths the suite imports, shimmed per run (e.g. `lib/command.js`). */
  internals: string[];
}

/** Name of the generated shim for the n-th public import a host's tests use. */
export function shimName(index: number): string {
  return index === 0 ? 'shim.js' : `shim-${index}.js`;
}

/**
 * Rewrite each public specifier as it reads *from this file's directory*. The upstream
 * specifier is written relative to the test dir (`../index.js`); a fixture two levels
 * down writes the same module as `../../index.js`. Both must land on the one shim.
 */
export function rewriteAt(source: string, host: Host, fileDir: string, hostDir: string): string {
  const testDir = join(hostDir, host.testDir);
  const dotted = (p: string): string => (p.startsWith('.') ? p : `./${p}`);
  return host.imports.reduce((acc, entry, i) => {
    const upstreamHere = dotted(relative(fileDir, resolve(testDir, entry.upstream)));
    const shimHere = dotted(relative(fileDir, join(hostDir, shimName(i))));
    return acc.replaceAll(`'${upstreamHere}'`, `'${shimHere}'`).replaceAll(`"${upstreamHere}"`, `"${shimHere}"`);
  }, source);
}

const TEXT = /\.(m?js|cjs|ts|json)$|^[^.]+$/;

/** Rewrite every text file under a copied fixture tree, in place, keeping modes and symlinks. */
function rewriteTree(dir: string, host: Host, hostDir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) rewriteTree(at, host, hostDir);
    else if (entry.isFile() && TEXT.test(entry.name)) {
      const source = readFileSync(at, 'utf8');
      const out = rewriteAt(source, host, dir, hostDir);
      if (out !== source) writeFileSync(at, out);
    }
  }
}

const INTERNAL = /(?:from|require\()\s*['"]\.\.\/((?:build\/)?lib\/[^'"]+)['"]/g;

/** Every internal module path a source imports, relative to the host's root. */
export function internalImports(source: string): string[] {
  return [...source.matchAll(INTERNAL)].map((m) => m[1] ?? '').filter((p) => p !== '');
}

/**
 * `internal` when a file reaches into the host's internals AND never imports a public
 * entry: it is testing a helper module, not the surface we promise, and passing it would
 * mean copying the host's file layout. Such files are still vendored and graded — on a
 * separate, informational line. A public-surface test that *also* imports an internal
 * (yargs' 429 tests importing `YError`) is `public`; its internal import is shimmed.
 */
export function classify(source: string, host: Host): 'public' | 'internal' {
  if (internalImports(source).length === 0) return 'public';
  const hasPublic = host.imports.some(({ upstream }) => source.includes(`'${upstream}'`) || source.includes(`"${upstream}"`));
  return hasPublic ? 'public' : 'internal';
}

export function vendor(host: Host, into: string): VendorResult {
  const clone = mkdtempSync(join(tmpdir(), `vendor-${host.name}-`));
  try {
    execFileSync('git', ['clone', '--depth', '1', host.repo, clone], { stdio: 'ignore' });
    const commit = execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

    const from = join(clone, host.testDir);
    // Upstream's own directory name, because suites use cwd-relative paths into it.
    const dest = join(into, host.name, host.testDir);
    rmSync(join(into, host.name), { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });

    for (const extra of host.extraDirs ?? []) {
      cpSync(join(clone, extra), join(into, host.name, extra), { recursive: true, verbatimSymlinks: true });
    }

    // Suites run from vendor/<host>/ as if it were the upstream repo root, and some read
    // ./package.json there (yargs uses it as a JSON config fixture; without one yargs
    // prints usage and process.exit()s, killing the runner before its summary). It gets a
    // minimal one with a *different* name: upstream's own name plus its exports map would
    // make Node's self-reference rule resolve `import 'yargs'` to a file that is not here.
    const upstream = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8')) as { type?: string };
    writeFileSync(
      join(into, host.name, 'package.json'),
      `${JSON.stringify({ name: `@vendored/${host.name}-suite`, private: true, type: upstream.type ?? 'commonjs' }, null, 2)}\n`,
    );

    const internalFiles: string[] = [];
    const internals = new Set<string>();
    let files = 0;

    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        cpSync(join(from, entry.name), join(dest, entry.name), { recursive: true, verbatimSymlinks: true });
        rewriteTree(join(dest, entry.name), host, join(into, host.name));
        continue;
      }
      if (!/\.(m?js|cjs|ts)$/.test(entry.name)) continue;
      const source = readFileSync(join(from, entry.name), 'utf8');
      if (classify(source, host) === 'internal') internalFiles.push(entry.name);
      for (const p of internalImports(source)) internals.add(p);
      writeFileSync(join(dest, entry.name), rewriteAt(source, host, dest, join(into, host.name)));
      files += 1;
    }

    writeFileSync(
      join(into, host.name, '.source.json'),
      `${JSON.stringify(
        { repo: host.repo, commit, vendored: new Date().toISOString().slice(0, ISO_DATE), files, internalFiles, internals: [...internals].sort() },
        null,
        2,
      )}\n`,
    );
    // A stale shim from a previous target would silently grade the wrong thing.
    host.imports.forEach((_, i) => rmSync(join(into, host.name, shimName(i)), { force: true }));
    return { host: host.name, commit, files, internalFiles, internals: [...internals].sort() };
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}
