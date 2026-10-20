/**
 * U12 — every layer installs and works alone.
 *
 * The family splits ten ways so a program can adopt one layer without the other nine. The
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
 * `npm test` both do before the root suite runs. Off CI, tarballs that already passed here are
 * not installed again: the per-package cases report skipped, naming the stamp (`installStamp`).
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { declaredBy, discard, type Edge, type InstallStamp, installStamp, installTarballs, type Manifest, ownerOf, packFamily, publishedManifests, readManifest, undeclaredReaches } from './family-install.js';

const run = promisify(execFile);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PUBLISHED = ['bellpull', 'burgee', 'caique', 'closeout', 'controlroom', 'flagstaff', 'linegauge', 'paratext', 'roundel', 'seniority'];

/** One pack of ten packages, then ten installs and their probes side by side. */
const SETUP_TIMEOUT_MS = 240_000;

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
const refused = [];
process.on('exit', () => writeFileSync(process.env.PROBE_OUT, JSON.stringify({ edges, loaded, refused })));
for (const specifier of JSON.parse(process.env.PROBE_SPECIFIERS)) {
  try {
    await import(specifier, specifier.endsWith('.json') ? { with: { type: 'json' } } : undefined);
    loaded.push(specifier);
  } catch (error) {
    if (error?.code !== 'E_PEER_MISSING') throw error;
    refused.push({ specifier, fix: error.fix });
  }
}
`;

interface Probe {
  code: number;
  stderr: string;
  edges: Edge[];
  loaded: string[];
  /** Entries that refused to load for a missing optional peer, with the `fix` each gave. */
  refused: { specifier: string; fix: string }[];
}

/**
 * The entries that need an optional peer the adopter did not install, and refuse without it.
 *
 * `controlroom/ink` renders the program's React through the program's `react-reconciler`,
 * both optional peers (controlroom spec R11), so installed alone it cannot load — and must not
 * load quietly broken either: it refuses on first import with `code: 'E_PEER_MISSING'` and a
 * `fix` naming the install line. That refusal is what is asserted for these, and every other
 * entry must still load.
 */
const NEEDS_OPTIONAL_PEERS: Readonly<Record<string, string>> = { 'controlroom/ink': 'npm install react react-reconciler' };

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
  const seen = existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as Pick<Probe, 'edges' | 'loaded' | 'refused'>) : { edges: [], loaded: [], refused: [] };
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
  await installTarballs(dir, files);
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
    loads: loads ?? { code: -1, stderr: 'no probe', edges: [], loaded: [], refused: [] },
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
  const manifests = publishedManifests(root);

  let base: string;
  let stamp: InstallStamp | undefined;
  const results = new Map<string, Install>();

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'burgee-independence-'));
    const tarballs = await packFamily(root, manifests.keys(), join(base, 'tarballs'));
    stamp = installStamp(fileURLToPath(import.meta.url), tarballs.values());
    if (stamp.skip !== undefined) return;
    const done = await Promise.all([...manifests.keys()].map((pkg) => installAlone(pkg, manifests, tarballs, base)));
    for (const r of done) results.set(r.pkg, r);
  }, SETUP_TIMEOUT_MS);

  afterAll(({}, suite) => {
    discard(base);
    stamp?.record(suite);
  });

  it('grades exactly the nine published packages', () => {
    expect([...manifests.keys()].toSorted()).toEqual(PUBLISHED);
  });

  describe.each(PUBLISHED)('%s', (pkg) => {
    beforeEach((ctx) => {
      if (stamp?.skip !== undefined) ctx.skip(stamp.skip);
    });
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
      expect(loads.loaded).toEqual(modules.filter((m) => NEEDS_OPTIONAL_PEERS[m] === undefined));
    });

    it('refuses, with the install line as its fix, exactly the entries that need an optional peer', () => {
      const { loads, modules } = result();
      const wanted = modules.filter((m) => NEEDS_OPTIONAL_PEERS[m] !== undefined);
      expect(loads.refused.map((r) => r.specifier)).toEqual(wanted);
      for (const { specifier, fix } of loads.refused) expect(fix).toContain(NEEDS_OPTIONAL_PEERS[specifier]);
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
