/**
 * Vendors a host's own test suite and points it at our shim.
 *
 * The rewrite is one specifier and nothing else, scripted so it is reproducible
 * from a clean checkout (C6/R2). The upstream commit is recorded beside the
 * tests, and a scheduled job re-runs this to make the treadmill visible.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob, relative, resolve, sep } from 'node:path';

import { testFiles } from './discover.js';
import { type Host } from './hosts.js';
import { fieldsFromRecord, PROVENANCE_FILE, renderProvenance } from './provenance.js';
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
/**
 * A ref this may hand to `git`. Two properties, and the second is the one that matters.
 *
 * The version reaching this function came from `npm view <pkg> version` — a remote answer,
 * which makes the tag built from it second-order input to a command line (CodeQL's
 * `js/second-order-command-line-injection`). `execFileSync` already rules out a shell, so
 * the live hazard is not a metacharacter but a **leading dash**: a ref named `--upload-pack=…`
 * is read by git as an option, not a ref. So: no leading dash, and nothing outside the
 * characters a git ref may legally contain.
 */
const SAFE_REF = /^[A-Za-z0-9][\w./@+-]*$/;

function cloneRelease(host: Host, version: string, clone: string): { commit: string; tag: string | null } {
  const tag = `${host.tagPrefix ?? 'v'}${version}`;
  const head = (): string => execFileSync('git', ['-C', clone, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  // `--` before the positionals, so a repo URL cannot be read as an option either.
  const shallow = (ref?: string): void => {
    execFileSync('git', ['clone', '--depth', '1', ...(ref === undefined ? [] : ['--branch', ref]), '--', host.repo, clone], { stdio: 'ignore' });
  };
  try {
    if (!SAFE_REF.test(tag)) throw new Error(`refusing to pass ${JSON.stringify(tag)} to git as a ref`);
    shallow(tag);
    return { commit: head(), tag };
  } catch {
    rmSync(clone, { recursive: true, force: true });
    mkdirSync(clone, { recursive: true });
    shallow();
    return { commit: head(), tag: null };
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
export function shimName(index: number, packageType?: string, shim?: Host['shim']): string {
  let ext = packageType === 'module' ? 'js' : 'mjs';
  if (shim === 'cjs') ext = 'cjs';
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
    const shimHere = dotted(relative(fileDir, join(hostDir, shimName(i, packageType, host.shim))));
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
  // One or more `../`: a test in a subdirectory writes the same module one level deeper,
  // and reading it as "not an internal import" is how a nested internal-only file would
  // slip into the gate.
  lib: /(?:from|require\()\s*['"](?:\.\.\/)+((?:build\/)?lib\/[^'"]+)['"]/g,
  src: /(?:from|require\()\s*['"](?:\.\.\/)+((?:build\/)?src\/[^'"]+)['"]/g,
  // A host that ships only its *compiled* output and tests it there. `signal-exit`'s suite
  // imports `../dist/cjs/index.js` and `../dist/cjs/signals.js`, and its published tarball's
  // `files` array is `["dist"]` — so for the control the shim points at a file the package
  // really does ship, which is the case `internalShimFrom`'s fallback exists for the
  // opposite of.
  dist: /(?:from|require\()\s*['"](?:\.\.\/)+((?:build\/)?dist\/[^'"]+)['"]/g,
};

/** Every internal module path a source imports, relative to the host's root. */
export function internalImports(source: string, internalDir = 'lib'): string[] {
  const pattern = INTERNAL_PATTERNS[internalDir];
  if (pattern === undefined) throw new Error(`no internal-import pattern for "${internalDir}" — add one to INTERNAL_PATTERNS`);
  return [...source.matchAll(pattern)].map((m) => m[1] ?? '').filter((p) => p !== '');
}

/**
 * The same list, minus the host's own public entry.
 *
 * `../src/index.js` is clack's *public* import and also matches the `src/` internal
 * pattern, so without this every one of its nineteen files would add `src/index.js` to
 * the internal list and the runner would write a shim at a path the rewrite has already
 * pointed elsewhere — a file nothing imports, and for the control a re-export of
 * `<installed>/src/index.js`, which a published package does not ship.
 */
function internalsOnly(source: string, host: Host): string[] {
  const publicPaths = new Set(host.imports.map(({ upstream }) => upstream.replace(/^(?:\.\.?\/)+/, '')));
  return internalImports(source, host.internalDir).filter((p) => !publicPaths.has(p));
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
  description?: string;
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
  const pkg: Record<string, unknown> = { name: `@vendored/${host.name}-suite`, private: true, type, main: `./${shimName(0, type, host.shim)}` };
  if (upstream.version !== undefined) pkg.version = upstream.version;
  if (upstream.license !== undefined) pkg.license = upstream.license;
  // Upstream's own description, because a suite may read it back. meow's help block opens
  // with `pkg.description`, so three of its cases assert the string "CLI app helper" — and
  // without this line they fail for the control exactly as for the target, which is a
  // ceiling this file put there rather than one either implementation earned.
  if (upstream.description !== undefined) pkg.description = upstream.description;
  if (upstream.repository !== undefined) pkg.repository = upstream.repository;
  // Written from `hosts.ts` rather than left to a human, so a re-vendor cannot drop it: the
  // whole file is regenerated on every run, and a hand-added dependency would survive exactly
  // until the next upstream release. A host declaring neither gets no key at all, so the
  // eight directories vendored before this existed still reproduce byte for byte.
  //
  // Two fields, because they answer different questions. `vendorDeps` names what the suite
  // reaches for and expects the hoist to supply; `suiteDeps` pins `name@version` and is
  // installed into `vendor/<host>/node_modules`, which is what a monorepo's suite needs when
  // it imports its own siblings. A host may declare either.
  const declared = { ...(host.vendorDeps ?? {}), ...(host.suiteDeps === undefined ? {} : Object.fromEntries(host.suiteDeps.map(splitSpec))) };
  if (Object.keys(declared).length > 0) pkg.devDependencies = declared;
  // ava reads its configuration from the nearest `package.json` above its cwd, and the run's
  // cwd is this directory — so upstream's own `ava` block belongs in the file this function
  // writes or it is simply lost. `terminal-link` declares `{ serial: true }` and every one of
  // its ten cases mutates one shared module object; without this the vendored copy runs them
  // concurrently and the rate reads the interleaving rather than the implementation.
  if (host.avaConfig !== undefined) pkg.ava = host.avaConfig;
  return pkg;
}

/**
 * `@clack/core@1.5.1` -> `['@clack/core', '1.5.1']`. The last `@` is the separator, because
 * the first one belongs to the scope.
 */
export function splitSpec(spec: string): [string, string] {
  const at = spec.lastIndexOf('@');
  if (at <= 0) throw new Error(`suite dependency "${spec}" has no pinned version`);
  return [spec.slice(0, at), spec.slice(at + 1)];
}

/** The suite-local dependencies a vendored directory declares, if it declares any. */
export function readSuiteDeps(hostDir: string): Record<string, string> {
  const at = join(hostDir, 'package.json');
  if (!existsSync(at)) return {};
  return (JSON.parse(readFileSync(at, 'utf8')) as { devDependencies?: Record<string, string> }).devDependencies ?? {};
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
 * Whether a directory inside the test dir is brought along.
 *
 * Two are not. A dot-directory, because a host whose `testDir` is the repo root (ora)
 * would otherwise vendor `.git`. And the host's own `internalDir`, because
 * `@inquirer/core`'s suite is one file sitting beside `src/` — copying that would vendor
 * the incumbent's implementation into this repository, and the specifier rewrite has
 * already made it unreachable by pointing every import of it at the generated shim.
 */
const copiesDir = (host: Host, name: string): boolean => !name.startsWith('.') && name !== (host.internalDir ?? 'lib');

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
      if (copiesDir(host, entry.name)) {
        cpSync(join(from, entry.name), join(dest, entry.name), { recursive: true, verbatimSymlinks: true });
        rewriteTree(join(dest, entry.name), host, hostDir, packageType);
      }
      continue;
    }
    // The host's own glob, so a repo-root suite does not vendor the implementation beside it.
    if (!matchesGlob(entry.name, host.testGlob)) continue;
    const source = readFileSync(join(from, entry.name), 'utf8');
    if (classify(source, host) === 'internal') internalFiles.push(entry.name);
    for (const p of internalsOnly(source, host)) internals.add(p);
    const rewritten = rewriteAt(source, host, { fileDir: dest, hostDir, packageType });
    // Read off the *rewritten* source: a specifier the rewrite already pointed at a
    // generated shim (ora's `./index.js`) is the host itself, not a sibling helper.
    for (const p of siblingImports(rewritten)) siblings.add(p);
    writeFileSync(join(dest, entry.name), rewritten);
    files += 1;
  }

  copySiblings(siblings, host, { from, dest, hostDir }, packageType);

  const nested = countNested(host, from, dest, { internalFiles, internals });
  return { files: files + nested, internalFiles, internals };
}

/**
 * The tests inside the directories copied whole above. `cpSync` brought them and
 * `rewriteTree` rewrote them, but nothing *read* them: `test/issues/` was vendored,
 * committed and counted by no one, so five gated cases sat outside both the record and the
 * denominator. The runner's own discovery decides what a test is, so the count, the
 * classification and the grade are one answer rather than three.
 */
function countNested(host: Host, from: string, dest: string, into: { internalFiles: string[]; internals: Set<string> }): number {
  let files = 0;
  for (const rel of testFiles(dest, host)) {
    if (!rel.includes('/')) continue;
    const source = readFileSync(join(from, rel), 'utf8');
    if (classify(source, host) === 'internal') into.internalFiles.push(rel);
    for (const p of internalsOnly(source, host)) into.internals.add(p);
    files += 1;
  }
  return files;
}

/**
 * Whatever the tests import from beside themselves (commander's `testHelpers.js`).
 * Vendored so the suite loads, and outside the `files` count because the runner's glob
 * will never pick it up: it is a helper, not a test.
 */
function copySiblings(siblings: Set<string>, host: Host, { from, dest, hostDir }: Paths, packageType: string): void {
  for (const name of siblings) {
    const at = siblingFile(from, name);
    if (matchesGlob(name, host.testGlob) || at === undefined) continue;
    writeFileSync(join(dest, at.name), rewriteAt(readFileSync(at.path, 'utf8'), host, { fileDir: dest, hostDir, packageType }));
  }
}

/**
 * The file a sibling specifier names, which is not always the file it spells.
 *
 * A TypeScript suite written for `"moduleResolution": "nodenext"` imports its helper as
 * `./test-utils.js` and the file on disk is `test-utils.ts` — the extension the *emitted*
 * module would have, not the one the source has. clack's nineteen files all reach one such
 * helper, and taking the specifier literally left every one of them unable to load: a
 * missing helper reads as nineteen failing files, which reads as a compatibility number.
 */
function siblingFile(from: string, name: string): { name: string; path: string } | undefined {
  const candidates = [name, ...(name.endsWith('.js') ? [`${name.slice(0, -'.js'.length)}.ts`] : [])];
  const found = candidates.find((c) => existsSync(join(from, c)));
  return found === undefined ? undefined : { name: found, path: join(from, found) };
}

/** Vendor the host's suite at its latest npm release (or the given version). */
export function vendor(host: Host, into: string, version = host.pinnedVersion ?? latestVersion(host.npmName ?? host.name)): VendorResult {
  const clone = mkdtempSync(join(tmpdir(), `vendor-${host.name}-`));
  try {
    const { commit, tag } = cloneRelease(host, version, clone);
    const previous = readRecord(join(into, host.name));

    const from = join(clone, host.testDir);
    // **Built beside the live directory, then swapped, so a failure leaves the previous
    // suite standing.** This used to `rmSync` the host directory and rebuild in place, and
    // on 2026-09-21 a run that produced nothing left `dotenv` with its `.source.json`,
    // `PROVENANCE`, `package.json` and every test file gone — the row reported "no test
    // files vendored" and four others lost their grades the same day. A vendor step that
    // deletes before it knows it can replace turns a bad fetch into data loss.
    const live = join(into, host.name);
    const staging = `${live}.vendoring`;
    rmSync(staging, { recursive: true, force: true });
    // Upstream's own directory name, because suites use cwd-relative paths into it.
    const dest = join(staging, host.testDir);
    mkdirSync(dest, { recursive: true });

    for (const extra of host.extraDirs ?? []) {
      cpSync(join(clone, extra), join(staging, extra), { recursive: true, verbatimSymlinks: true });
    }

    // Suites run from vendor/<host>/ as if it were the upstream repo root, and some read
    // ./package.json there (yargs uses it as a JSON config fixture; without one yargs
    // prints usage and process.exit()s, killing the runner before its summary). It gets a
    // minimal one with a *different* name: upstream's own name plus its exports map would
    // make Node's self-reference rule resolve `import 'yargs'` to a file that is not here.
    const upstream = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8')) as UpstreamPackage;
    writeFileSync(join(staging, 'package.json'), `${JSON.stringify(rootPackage(host, upstream), null, 2)}\n`);

    const packageType = upstream.type ?? 'commonjs';
    const { files, internalFiles, internals } = copyTests(host, { from, dest, hostDir: staging }, packageType);

    const record = snapshot(clone, host, {
      version,
      tag,
      commit,
      vendored: new Date().toISOString().slice(0, ISO_DATE),
      files,
      internalFiles,
      internals: [...internals].sort(),
    });
    writeFileSync(join(staging, '.source.json'), `${JSON.stringify(record, null, 2)}\n`);
    // **Beside the record, not instead of it.** `scripts/vendor-suite.ts` used to be the only
    // writer of `PROVENANCE`, so `compat --vendor` — which calls this function — replaced the
    // host directory and left the file behind in the old one. `provenance.test.ts` then went
    // red on a host nobody had touched by hand, naming a file the oracle had deleted itself.
    // Both files come from the same `record`, so writing one without the other was only ever
    // a division of labour between two callers, and the invariant the lock states is that a
    // vendored suite says where it came from.
    writeFileSync(join(staging, PROVENANCE_FILE), renderProvenance(fieldsFromRecord(host.name, record)));
    // A stale shim from a previous target would silently grade the wrong thing.
    // Both names: a re-vendor that changes the package's type must not leave the old one.
    host.imports.forEach((_, i) => {
      for (const type of ['module', 'commonjs']) rmSync(join(staging, shimName(i, type)), { force: true });
      rmSync(join(staging, shimName(i, undefined, 'cjs')), { force: true });
    });
    // The swap, and the refusal that makes staging worth the trouble: a run that produced
    // no graded files is a failed run, and it leaves what was there alone.
    if (files === 0) {
      rmSync(staging, { recursive: true, force: true });
      throw new Error(`vendor: ${host.name} produced no test files at ${version} — refusing to replace the vendored suite with nothing. Check the tag and the host's testDir/testGlob.`);
    }
    rmSync(live, { recursive: true, force: true });
    renameSync(staging, live);

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
