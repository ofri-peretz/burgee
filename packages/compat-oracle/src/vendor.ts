/**
 * Vendors a host's own test suite and points it at our shim.
 *
 * The rewrite is one specifier and nothing else, scripted so it is reproducible
 * from a clean checkout (C6/R2). The upstream commit is recorded beside the
 * tests, and a scheduled job re-runs this to make the treadmill visible.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob, relative, resolve, sep } from 'node:path';

import { type Host } from './hosts.js';
import { type CompatRecord, diffRecords, latestVersion, readRecord, type RecordDiff, snapshot } from './upstream.js';

/** Length of an ISO date, `YYYY-MM-DD`. */
const ISO_DATE = 10;

export interface VendorResult {
  host: string;
  commit: string;
  /** The npm release vendored, and its tag (null when HEAD had to be used). */
  version: string;
  tag: string | null;
  files: number;
  /** Test files that import only the host's internals: vendored and graded, informationally. */
  internalFiles: string[];
  /** Internal module paths the suite imports, shimmed per run (e.g. `lib/command.js`). */
  internals: string[];
  /** The record written, and how it differs from the one it replaced. */
  record: CompatRecord;
  previous?: CompatRecord;
  diff?: RecordDiff;
}

/**
 * Clone the release's tag; fall back to HEAD when the release was not tagged, and say so
 * in the record (`tag: null`) rather than pretend.
 */
function cloneRelease(host: Host, version: string, clone: string): { commit: string; tag: string | null } {
  const tag = `${host.tagPrefix ?? 'v'}${version}`;
  try {
    execFileSync('git', ['clone', '--depth', '1', '--branch', tag, host.repo, clone], { stdio: 'ignore' });
    return { commit: execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tag };
  } catch {
    rmSync(clone, { recursive: true, force: true });
    mkdirSync(clone, { recursive: true });
    execFileSync('git', ['clone', '--depth', '1', host.repo, clone], { stdio: 'ignore' });
    return { commit: execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tag: null };
  }
}

/**
 * Name of the generated shim for the n-th public import a host's tests use.
 *
 * **The extension has to say what the file is.** Every shim is ESM — it re-exports the
 * target and carries the `'module.exports'` binding that lets a `require()` reach a
 * callable. Under a vendored `package.json` that is `type: module` a `.js` file is already
 * ESM; under `type: commonjs` — cli-table3, whose own suite is CJS and must stay so — a
 * `.js` file is parsed as CommonJS and the shim is a syntax error. `.mjs` is ESM whatever
 * the package says, which is the only property that matters here.
 */
export function shimName(index: number, packageType?: string): string {
  const ext = packageType === 'module' ? 'js' : 'mjs';
  return index === 0 ? `shim.${ext}` : `shim-${index}.${ext}`;
}

/**
 * Rewrite each public specifier as it reads *from this file's directory*. The upstream
 * specifier is written relative to the test dir (`../index.js`); a fixture two levels
 * down writes the same module as `../../index.js`. Both must land on the one shim.
 */
// Specifiers are posix whatever the OS: `relative()` answers with backslashes on Windows,
// and a backslash never matches — or belongs in — an import specifier.
const dotted = (p: string): string => {
  const posix = p.split(sep).join('/');
  return posix.startsWith('.') ? posix : `./${posix}`;
};

export function rewriteAt(source: string, host: Host, { fileDir, hostDir, packageType = 'module' }: { fileDir: string; hostDir: string; packageType?: string }): string {
  const testDir = join(hostDir, host.testDir);
  return host.imports.reduce((acc, entry, i) => {
    // A bare specifier reads the same from every file; a relative one moves with the file.
    const upstreamHere = entry.upstream.startsWith('.') ? dotted(relative(fileDir, resolve(testDir, entry.upstream))) : entry.upstream;
    const shimHere = dotted(relative(fileDir, join(hostDir, shimName(i, packageType))));
    return acc.replaceAll(`'${upstreamHere}'`, `'${shimHere}'`).replaceAll(`"${upstreamHere}"`, `"${shimHere}"`);
  }, source);
}

const TEXT = /\.(m?js|cjs|ts|json)$|^[^.]+$/;

/** Rewrite every text file under a copied fixture tree, in place, keeping modes and symlinks. */
function rewriteTree(dir: string, host: Host, hostDir: string, packageType: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const at = join(dir, entry.name);
    if (entry.isDirectory()) rewriteTree(at, host, hostDir, packageType);
    else if (entry.isFile() && TEXT.test(entry.name)) {
      const source = readFileSync(at, 'utf8');
      const out = rewriteAt(source, host, { fileDir: dir, hostDir, packageType });
      if (out !== source) writeFileSync(at, out);
    }
  }
}

/** A sibling module a test imports by relative path — commander's `./testHelpers.js`. */
const SIBLING = /(?:from|require\()\s*['"]\.\/([^'"/]+)['"]/g;

/** Every same-directory module a source imports: vendored beside the tests, never run. */
export function siblingImports(source: string): string[] {
  return [...source.matchAll(SIBLING)].map((m) => m[1] ?? '').filter((p) => p !== '');
}

/**
 * Where a host keeps the modules it does not promise. `lib/` for commander and yargs,
 * `src/` for cli-table3 — which is host knowledge exactly as `testDir` and `testGlob` are,
 * and was a constant here until a host that files its internals elsewhere arrived.
 */
/**
 * The pattern per internal directory, written out rather than built — a closed set, because
 * a host declares its `internalDir` in `hosts.ts` and adding one should be a line somebody
 * wrote on purpose. `matchAll` clones the regex's state, so sharing these is safe.
 */
const INTERNAL_PATTERNS: Record<string, RegExp> = {
  lib: /(?:from|require\()\s*['"]\.\.\/((?:build\/)?lib\/[^'"]+)['"]/g,
  src: /(?:from|require\()\s*['"]\.\.\/((?:build\/)?src\/[^'"]+)['"]/g,
};

/** Every internal module path a source imports, relative to the host's root. */
export function internalImports(source: string, internalDir = 'lib'): string[] {
  const pattern = INTERNAL_PATTERNS[internalDir];
  if (pattern === undefined) throw new Error(`no internal-import pattern for "${internalDir}" — add one to INTERNAL_PATTERNS`);
  return [...source.matchAll(pattern)].map((m) => m[1] ?? '').filter((p) => p !== '');
}

/**
 * `internal` when a file reaches into the host's internals AND never imports a public
 * entry: it is testing a helper module, not the surface we promise, and passing it would
 * mean copying the host's file layout. Such files are still vendored and graded — on a
 * separate, informational line. A public-surface test that *also* imports an internal
 * (yargs' 429 tests importing `YError`) is `public`; its internal import is shimmed.
 */
export function classify(source: string, host: Host): 'public' | 'internal' {
  if (internalImports(source, host.internalDir).length === 0) return 'public';
  const hasPublic = host.imports.some(({ upstream }) => source.includes(`'${upstream}'`) || source.includes(`"${upstream}"`));
  return hasPublic ? 'public' : 'internal';
}

export interface UpstreamPackage {
  name?: string;
  type?: string;
  version?: string;
  license?: string;
  repository?: unknown;
}

/**
 * The vendored root's package.json. Suites run from there as if it were the upstream repo
 * root, and they read it: yargs' `.config('foo')` and `.pkgConf('repository')` tests load
 * `./package.json` and expect the upstream's own `license` and `repository`; commander's
 * and yargs' CJS fixtures `require('../')` the root itself, which needs a `main`. That
 * main is the generated shim, so a fixture reaches whatever the run is grading. The name
 * is *not* the upstream's: with its name and exports map, Node's self-reference rule would
 * resolve `import 'yargs'` to a file that is not here.
 */
export function rootPackage(host: Host, upstream: UpstreamPackage): Record<string, unknown> {
  const type = upstream.type ?? 'commonjs';
  const pkg: Record<string, unknown> = { name: `@vendored/${host.name}-suite`, private: true, type, main: `./${shimName(0, type)}` };
  if (upstream.version !== undefined) pkg.version = upstream.version;
  if (upstream.license !== undefined) pkg.license = upstream.license;
  if (upstream.repository !== undefined) pkg.repository = upstream.repository;
  return pkg;
}

/** Where a vendor run reads from and writes to: the clone's test dir, and ours. */
interface Paths {
  from: string;
  dest: string;
  hostDir: string;
}

interface Copied {
  files: number;
  internalFiles: string[];
  internals: Set<string>;
}

/**
 * Copy the test dir: every fixture directory whole, every file the host's glob calls a
 * test with its specifiers rewritten, and then whatever those tests import from beside
 * themselves.
 */
function copyTests(host: Host, { from, dest, hostDir }: Paths, packageType: string): Copied {
  const internalFiles: string[] = [];
  const internals = new Set<string>();
  const siblings = new Set<string>();
  let files = 0;

  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      // A host whose testDir is the repo root (ora) would otherwise vendor `.git`.
      if (entry.name.startsWith('.')) continue;
      cpSync(join(from, entry.name), join(dest, entry.name), { recursive: true, verbatimSymlinks: true });
      rewriteTree(join(dest, entry.name), host, hostDir, packageType);
      continue;
    }
    // The host's own glob, so a repo-root suite does not vendor the implementation beside it.
    if (!matchesGlob(entry.name, host.testGlob)) continue;
    const source = readFileSync(join(from, entry.name), 'utf8');
    if (classify(source, host) === 'internal') internalFiles.push(entry.name);
    for (const p of internalImports(source, host.internalDir)) internals.add(p);
    const rewritten = rewriteAt(source, host, { fileDir: dest, hostDir, packageType });
    // Read off the *rewritten* source: a specifier the rewrite already pointed at a
    // generated shim (ora's `./index.js`) is the host itself, not a sibling helper.
    for (const p of siblingImports(rewritten)) siblings.add(p);
    writeFileSync(join(dest, entry.name), rewritten);
    files += 1;
  }

  copySiblings(siblings, host, { from, dest, hostDir }, packageType);
  return { files, internalFiles, internals };
}

/**
 * Whatever the tests import from beside themselves (commander's `testHelpers.js`).
 * Vendored so the suite loads, and outside the `files` count because the runner's glob
 * will never pick it up: it is a helper, not a test.
 */
function copySiblings(siblings: Set<string>, host: Host, { from, dest, hostDir }: Paths, packageType: string): void {
  for (const name of siblings) {
    const at = join(from, name);
    if (matchesGlob(name, host.testGlob) || !existsSync(at)) continue;
    writeFileSync(join(dest, name), rewriteAt(readFileSync(at, 'utf8'), host, { fileDir: dest, hostDir, packageType }));
  }
}

/** Vendor the host's suite at its latest npm release (or the given version). */
export function vendor(host: Host, into: string, version = latestVersion(host.name)): VendorResult {
  const clone = mkdtempSync(join(tmpdir(), `vendor-${host.name}-`));
  try {
    const { commit, tag } = cloneRelease(host, version, clone);
    const previous = readRecord(join(into, host.name));

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
    const upstream = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8')) as UpstreamPackage;
    writeFileSync(join(into, host.name, 'package.json'), `${JSON.stringify(rootPackage(host, upstream), null, 2)}\n`);

    const packageType = upstream.type ?? 'commonjs';
    const { files, internalFiles, internals } = copyTests(host, { from, dest, hostDir: join(into, host.name) }, packageType);

    const record = snapshot(clone, host, {
      version,
      tag,
      commit,
      vendored: new Date().toISOString().slice(0, ISO_DATE),
      files,
      internalFiles,
      internals: [...internals].sort(),
    });
    writeFileSync(join(into, host.name, '.source.json'), `${JSON.stringify(record, null, 2)}\n`);
    // A stale shim from a previous target would silently grade the wrong thing.
    // Both names: a re-vendor that changes the package's type must not leave the old one.
    host.imports.forEach((_, i) => {
      for (const type of ['module', 'commonjs']) rmSync(join(into, host.name, shimName(i, type)), { force: true });
    });
    const result: VendorResult = { host: host.name, commit, version, tag, files, internalFiles, internals: [...internals].sort(), record };
    if (previous !== undefined) {
      result.previous = previous;
      result.diff = diffRecords(previous, record);
    }
    return result;
  } finally {
    rmSync(clone, { recursive: true, force: true });
  }
}
