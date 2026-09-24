/**
 * U12 — every layer installs and works alone.
 *
 * The family splits nine ways so a program can adopt one layer without the other eight. The
 * design names the check that makes that a fact rather than a layout: *"locks when the
 * independence install test passes for every layer"*. This is that test.
 *
 * For each published package it does what a stranger does — `npm install` the tarball into an
 * empty directory — and gives npm **nothing else**: the package's own tarball, plus the tarballs
 * of the in-family packages it declares (and theirs), all packed from this tree, installed
 * `--offline` so the registry cannot fill a gap. Then it imports every entry in the package's
 * `exports` map under Node and asserts two things:
 *
 * 1. **it loads** — a sibling the package imports but does not declare is simply not there, so
 *    the import fails with `ERR_MODULE_NOT_FOUND`;
 * 2. **no undeclared package is reached** — every module resolution Node performs is recorded
 *    by a `module.registerHooks` resolve hook, and each edge that crosses a package boundary
 *    must land on a package the importing package itself declares.
 *
 * The second is not redundant with the first. npm hoists: when flagstaff declares `paratext`,
 * `paratext` sits at the top of `node_modules` where burgee can import it too, and the install
 * loads — until someone installs burgee without flagstaff. Only the per-edge check sees that,
 * and the `undeclaredReaches` cases below pin it.
 *
 * What it does not do: run the programs. A subpath that is also a `bin` runs when it is loaded
 * (`side-effects-lock.test.ts`), so it is imported in a process of its own with `--help` and
 * graded on exiting 0. The one-file programs themselves are each package's `shape.test.ts`.
 *
 * It reads `dist/`, so it needs the packages built — which the pre-push battery and CI's
 * `npm test` both do before the root suite runs.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLISHED = ['bellpull', 'burgee', 'caique', 'closeout', 'flagstaff', 'linegauge', 'paratext', 'roundel', 'seniority'];

/** One pack of nine packages, then nine installs and their probes side by side. */
const SETUP_TIMEOUT_MS = 240_000;

interface Manifest {
  name: string;
  private?: boolean;
  bin?: string | Record<string, string>;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const readManifest = (dir: string): Manifest => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;

/** Every name a manifest lets its code import. */
export const declaredBy = (m: Manifest): string[] => Object.keys({ ...m.dependencies, ...m.peerDependencies, ...m.optionalDependencies });

/** One module resolution Node performed: who asked, for what, and the URL it got. */
export interface Edge {
  from: string | null;
  specifier: string;
  to: string;
}

/** The installed package a file URL belongs to, or `undefined` when it is outside `modules`. */
export function ownerOf(url: string, modules: string): string | undefined {
  const rel = relative(modules, fileURLToPath(url));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return undefined;
  const parts = rel.split(sep);
  const rest = parts.slice(parts.lastIndexOf('node_modules') + 1);
  const [first = '', second = ''] = rest;
  return first.startsWith('@') ? `${first}/${second}` : first;
}

/**
 * Every edge that reaches a package its importer does not declare.
 *
 * `entry` is the probe — the adopter — which declares exactly the package under test. A builtin
 * (`node:`) is always allowed; a file outside the install is never allowed, because that is a
 * package found by walking up past the adopter's own `node_modules`.
 */
export function undeclaredReaches(
  edges: Edge[],
  { modules, entry, pkg, declared }: { modules: string; entry: string; pkg: string; declared: (name: string) => string[] },
): string[] {
  const found = new Set<string>();
  for (const { from, specifier, to } of edges) {
    if (!to.startsWith('file:')) continue;
    const asker = from === null || from === entry ? undefined : ownerOf(from, modules);
    const allowed = asker === undefined ? [pkg] : [asker, ...declared(asker)];
    const target = ownerOf(to, modules);
    const who = asker ?? 'the adopter';
    if (target === undefined) found.add(`${who} reaches ${fileURLToPath(to)}, outside the install ('${specifier}')`);
    else if (!allowed.includes(target)) found.add(`${who} reaches ${target} without declaring it ('${specifier}')`);
  }
  return [...found].toSorted();
}

/** The plain paths an `exports` target or a `bin` names, without `./`. */
const norm = (p: string): string => p.replace(/^\.\//, '');
function importTarget(target: unknown): string | undefined {
  if (typeof target === 'string') return norm(target);
  if (target === null || typeof target !== 'object') return undefined;
  const t = target as Record<string, unknown>;
  const pick = t['import'] ?? t['default'];
  return typeof pick === 'string' ? norm(pick) : undefined;
}

/** Every specifier an adopter can import from `m`, split into modules and the ones that are a `bin`. */
function entries(m: Manifest): { modules: string[]; bins: string[] } {
  const binFiles = new Set(Object.values(typeof m.bin === 'string' ? { [m.name]: m.bin } : (m.bin ?? {})).map(norm));
  const modules: string[] = [];
  const bins: string[] = [];
  for (const [subpath, target] of Object.entries(m.exports ?? {})) {
    if (subpath === './package.json') continue;
    const specifier = subpath === '.' ? m.name : `${m.name}/${subpath.slice(2)}`;
    (binFiles.has(importTarget(target) ?? '') ? bins : modules).push(specifier);
  }
  return { modules, bins };
}

/** The in-family packages `name` needs installed beside it: what it declares, and what those declare. */
function closure(name: string, manifests: Map<string, Manifest>): string[] {
  const seen = new Set<string>();
  const visit = (n: string): void => {
    for (const dep of declaredBy(manifests.get(n) ?? { name: n })) {
      if (!manifests.has(dep) || seen.has(dep)) continue;
      seen.add(dep);
      visit(dep);
    }
  };
  visit(name);
  return [...seen].toSorted();
}

/**
 * The adopter's program. It registers the recording hook, imports each specifier it is given,
 * and writes what it saw on exit — including an exit a `bin` takes on its own.
 */
const PROBE = `import { registerHooks } from 'node:module';
import { writeFileSync } from 'node:fs';
const edges = [];
const loaded = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    edges.push({ from: context.parentURL ?? null, specifier, to: result.url });
    return result;
  },
});
process.on('exit', () => writeFileSync(process.env.PROBE_OUT, JSON.stringify({ edges, loaded })));
for (const specifier of JSON.parse(process.env.PROBE_SPECIFIERS)) {
  await import(specifier, specifier.endsWith('.json') ? { with: { type: 'json' } } : undefined);
  loaded.push(specifier);
}
`;

/**
 * npm, without assuming a POSIX shell — the reasoning is `pack-list-lock.test.ts`'s. Only a
 * `npm_execpath` naming `npm-cli.js` is run through this Node; any other value is not npm's own
 * entry, so it falls back to `npm` on the PATH.
 */
const NPM_CLI = process.env['npm_execpath'];
const WINDOWS = process.platform === 'win32';
function npm(args: string[], cwd: string): Promise<{ stdout: string }> {
  const io = { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 } as const;
  if (NPM_CLI?.endsWith('npm-cli.js') === true) return run(process.execPath, [NPM_CLI, ...args], io);
  return run(WINDOWS ? 'npm.cmd' : 'npm', args, { ...io, shell: WINDOWS });
}

interface Probe {
  code: number;
  stderr: string;
  edges: Edge[];
  loaded: string[];
}

async function probe(dir: string, tag: string, specifiers: string[], argv: string[]): Promise<Probe> {
  const out = join(dir, `probe-${tag}.json`);
  const env = { ...process.env, PROBE_OUT: out, PROBE_SPECIFIERS: JSON.stringify(specifiers) };
  let code = 0;
  let stderr = '';
  try {
    await run(process.execPath, ['probe.mjs', ...argv], { cwd: dir, env, encoding: 'utf8' });
  } catch (e) {
    const err = e as { code?: number; stderr?: string };
    code = typeof err.code === 'number' ? err.code : 1;
    stderr = err.stderr ?? String(e);
  }
  const seen = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as { edges: Edge[]; loaded: string[] }) : { edges: [], loaded: [] };
  return { code, stderr, ...seen };
}

interface Install {
  pkg: string;
  expected: string[];
  installed: string[];
  modules: string[];
  bins: string[];
  loads: Probe;
  binRuns: Probe[];
  undeclared: string[];
}

/** Install one package alone, from tarballs, and probe every entry it exports. */
async function installAlone(pkg: string, manifests: Map<string, Manifest>, tarballs: Map<string, string>, base: string): Promise<Install> {
  const dir = join(base, pkg);
  const siblings = closure(pkg, manifests);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `adopter-of-${pkg}`, private: true, type: 'module' }));
  const files = [pkg, ...siblings].map((n) => tarballs.get(n) ?? '');
  await npm(['install', '--offline', '--no-package-lock', '--no-audit', '--no-fund', '--silent', ...files], dir);
  writeFileSync(join(dir, 'probe.mjs'), PROBE);

  const nodeModules = realpathSync(join(dir, 'node_modules'));
  const installed = readdirSync(nodeModules)
    .filter((f) => !f.startsWith('.'))
    .toSorted();
  const { modules, bins } = entries(manifests.get(pkg) ?? { name: pkg });
  const [loads, ...binRuns] = await Promise.all([
    probe(dir, 'modules', modules, []),
    ...bins.map((bin, i) => probe(dir, `bin-${String(i)}`, [bin], ['--help'])),
  ]);
  const entry = pathToFileURL(join(realpathSync(dir), 'probe.mjs')).href;
  const declared = (name: string): string[] => declaredBy(readManifest(join(nodeModules, name)));
  const edges = [loads, ...binRuns].flatMap((p) => p?.edges ?? []);
  return {
    pkg,
    expected: [pkg, ...siblings].toSorted(),
    installed,
    modules,
    bins,
    loads: loads ?? { code: -1, stderr: 'no probe', edges: [], loaded: [] },
    binRuns,
    undeclared: undeclaredReaches(edges, { modules: nodeModules, entry, pkg, declared }),
  };
}

describe('undeclaredReaches', () => {
  const modules = join(tmpdir(), 'adopter', 'node_modules');
  const url = (...p: string[]): string => pathToFileURL(join(modules, ...p)).href;
  const entry = pathToFileURL(join(tmpdir(), 'adopter', 'probe.mjs')).href;
  const deps: Record<string, string[]> = { burgee: ['roundel'], flagstaff: ['paratext'] };
  const check = (edges: Edge[]): string[] => undeclaredReaches(edges, { modules, entry, pkg: 'burgee', declared: (n) => deps[n] ?? [] });

  it('allows the adopter its package, a package its own files and declared deps, and builtins', () => {
    expect(
      check([
        { from: entry, specifier: 'burgee', to: url('burgee', 'dist', 'index.js') },
        { from: url('burgee', 'dist', 'index.js'), specifier: './run.js', to: url('burgee', 'dist', 'run.js') },
        { from: url('burgee', 'dist', 'run.js'), specifier: 'roundel', to: url('roundel', 'dist', 'index.js') },
        { from: url('burgee', 'dist', 'run.js'), specifier: 'node:fs', to: 'node:fs' },
      ]),
    ).toEqual([]);
  });

  it('refuses a sibling that is installed only because another package hoisted it', () => {
    expect(check([{ from: url('burgee', 'dist', 'index.js'), specifier: 'paratext', to: url('paratext', 'dist', 'index.js') }])).toEqual([
      "burgee reaches paratext without declaring it ('paratext')",
    ]);
  });

  it('refuses the adopter reaching a package it did not install', () => {
    expect(check([{ from: entry, specifier: 'roundel', to: url('roundel', 'dist', 'index.js') }])).toEqual([
      "the adopter reaches roundel without declaring it ('roundel')",
    ]);
  });

  it('refuses a file found outside the install, by walking up past it', () => {
    const outside = pathToFileURL(join(tmpdir(), 'node_modules', 'paratext', 'index.js')).href;
    expect(check([{ from: url('burgee', 'dist', 'index.js'), specifier: 'paratext', to: outside }])).toEqual([
      `burgee reaches ${fileURLToPath(outside)}, outside the install ('paratext')`,
    ]);
  });

  it('reads a nested and a scoped package by their own names', () => {
    expect(ownerOf(url('burgee', 'node_modules', 'roundel', 'dist', 'x.js'), modules)).toBe('roundel');
    expect(ownerOf(url('@scope', 'name', 'x.js'), modules)).toBe('@scope/name');
  });
});

describe('U12 — each published package installs and loads alone', () => {
  const manifests = new Map<string, Manifest>();
  for (const dir of readdirSync(join(root, 'packages'))) {
    const at = join(root, 'packages', dir);
    if (!existsSync(join(at, 'package.json'))) continue;
    const m = readManifest(at);
    if (m.private !== true) manifests.set(m.name, m);
  }

  let base: string;
  const results = new Map<string, Install>();

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'burgee-independence-'));
    const packs = join(base, 'tarballs');
    const workspaces = [...manifests.keys()].map((name) => `--workspace=packages/${name}`);
    mkdirSync(packs);
    const { stdout } = await npm(['pack', '--json', '--pack-destination', packs, ...workspaces], root);
    const tarballs = new Map((JSON.parse(stdout) as { name: string; filename: string }[]).map((p) => [p.name, join(packs, p.filename)]));
    const done = await Promise.all([...manifests.keys()].map((pkg) => installAlone(pkg, manifests, tarballs, base)));
    for (const r of done) results.set(r.pkg, r);
  }, SETUP_TIMEOUT_MS);

  afterAll(() => rmSync(base, { recursive: true, force: true }), SETUP_TIMEOUT_MS);

  it('grades exactly the nine published packages', () => {
    expect([...manifests.keys()].toSorted()).toEqual(PUBLISHED);
  });

  describe.each(PUBLISHED)('%s', (pkg) => {
    const result = (): Install => {
      const r = results.get(pkg);
      if (r === undefined) throw new Error(`${pkg} was not installed`);
      return r;
    };

    it('installs nothing but itself and the in-family packages it declares', () => {
      expect(result().installed).toEqual(result().expected);
    });

    it('loads every module entry in its `exports` map', () => {
      const { loads, modules } = result();
      expect(modules.length, 'no entries were found — the reader is broken').toBeGreaterThan(0);
      expect(loads.stderr).toBe('');
      expect(loads.code).toBe(0);
      expect(loads.loaded).toEqual(modules);
    });

    it('runs every `bin` it exports as a module', () => {
      const { bins, binRuns } = result();
      expect(binRuns.map((p, i) => [bins[i], p.code, p.stderr])).toEqual(bins.map((b) => [b, 0, '']));
    });

    it('reaches no package it does not declare', () => {
      const { loads, undeclared } = result();
      expect(loads.edges.length, 'no resolutions were recorded — the hook is broken').toBeGreaterThan(0);
      expect(undeclared).toEqual([]);
    });
  });
});
