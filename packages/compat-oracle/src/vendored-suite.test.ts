/**
 * Locks on the *state* of the oracle rather than on its logic.
 *
 * Every defect these catch shipped green: a suite requiring a package the oracle does not
 * install (33/33 here, 15/16 on a clean `npm ci`), a test directory copied and committed and
 * never graded (five cases missing from the denominator), a host activated with no baseline
 * so the ratchet is inert, and generated files a comment claimed were gitignored and were not.
 * None of them make a runner throw, so nothing but a lock like this can see them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, matchesGlob, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { testFiles } from './discover.js';
import { active, type Host, HOSTS } from './hosts.js';
import { readBaseline } from './run.js';
import { shimName } from './vendor.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const VENDOR = join(root, 'vendor');

const vendored = (host: Host): string | undefined => {
  const dir = join(VENDOR, host.name, host.testDir);
  return existsSync(dir) ? dir : undefined;
};

/** Hosts whose suite is on disk — every active one in CI, and whatever a contributor has. */
const onDisk = HOSTS.filter((h) => vendored(h) !== undefined);

/**
 * An independent recursive walk, written out rather than reusing `walkFiles`, because the
 * bug being locked was in the walk: a lock that shares the implementation it is checking
 * proves the implementation agrees with itself.
 */
function everyTestFile(dir: string, glob: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') return [];
      return everyTestFile(join(dir, entry.name), glob, rel);
    }
    return entry.isFile() && matchesGlob(entry.name, glob) ? [rel] : [];
  });
}

describe('every vendored test file is graded or named', () => {
  it.each(onDisk.map((h) => [h.name, h] as const))('%s grades every file its own glob matches', (_name, host) => {
    const dir = vendored(host) ?? '';
    const declared = new Set((host.ungradedDirs ?? []).map((d) => d.dir));
    const copied = everyTestFile(dir, host.testGlob).filter((rel) => rel !== host.preamble);
    // A file is accounted for when the runner grades it, or when the directory it sits in
    // is declared ungraded. Anything else is copied, committed and invisible.
    const graded = new Set(testFiles(dir, host));
    const orphaned = copied.filter((rel) => !graded.has(rel) && ![...declared].some((d) => rel.startsWith(`${d}/`)));
    expect(orphaned).toEqual([]);
  });

  it.each(onDisk.filter((h) => (h.ungradedDirs ?? []).length > 0).map((h) => [h.name, h] as const))(
    "%s's ungraded directories exist, hold tests, and say why",
    (_name, host) => {
      const dir = vendored(host) ?? '';
      for (const { dir: sub, why } of host.ungradedDirs ?? []) {
        expect(existsSync(join(dir, sub)), `${host.name}: ungraded directory ${sub} is not vendored`).toBe(true);
        // A declaration that no longer matches anything is dead weight that reads as a decision.
        expect(everyTestFile(join(dir, sub), host.testGlob).length, `${host.name}: ${sub} holds no ${host.testGlob}`).toBeGreaterThan(0);
        expect(why.length, `${host.name}: ${sub} has no reason written`).toBeGreaterThan(20);
      }
    },
  );
});

/** `require('x')`, `import … from 'x'`, `import 'x'` — never the word "from" inside a test title. */
const SPECIFIERS = [/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, /^\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]/gm, /^\s*import\s*['"]([^'"]+)['"]/gm];
const SOURCE = /\.(m?js|cjs|ts)$/;
const BUILTIN = new Set(builtinModules);
const GENERATED = new Set([...HOSTS.flatMap((h) => h.imports.map((_, i) => [shimName(i, 'module'), shimName(i, 'commonjs')]).flat()), 'vitest.setup.mjs', 'vitest.config.mjs']);

/** The package a specifier belongs to: `@colors/colors/safe` → `@colors/colors`. */
function packageOf(id: string): string | undefined {
  if (id.startsWith('.') || id.startsWith('/') || id.includes(':')) return undefined;
  const parts = id.split('/');
  const name = id.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
  return name === '' || BUILTIN.has(name) ? undefined : name;
}

/** Every bare package a source file names, in order. */
function packagesIn(source: string): string[] {
  return SPECIFIERS.flatMap((pattern) => [...source.matchAll(pattern)].map((m) => packageOf(m[1] ?? ''))).filter((name): name is string => name !== undefined);
}

/** Package name to the first vendored file that reaches for it. */
function requiredPackages(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && SOURCE.test(e.name) && !GENERATED.has(e.name))
    .map((e) => join(e.parentPath, e.name))
    .filter((at) => !at.includes('node_modules'));
  for (const at of files) {
    for (const name of packagesIn(readFileSync(at, 'utf8'))) {
      if (!found.has(name)) found.set(name, at.slice(root.length + 1));
    }
  }
  return found;
}

describe('the oracle installs what its vendored suites require', () => {
  it('declares every package a vendored suite reaches for by name', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string>>;
    const declared = new Set([...Object.keys(pkg['dependencies'] ?? {}), ...Object.keys(pkg['devDependencies'] ?? {}), ...Object.keys(pkg['peerDependencies'] ?? {})]);
    // Resolution is not the test: `cli-table` resolved on the author's machine from a
    // stray `~/node_modules` and the suite scored 33/33, while `npm ci` gave 15/16. What
    // has to hold is that the package is *declared*, so a clean install has it.
    const undeclared = [...requiredPackages(VENDOR)].filter(([name]) => !declared.has(name)).map(([name, at]) => `${name} (${at})`);
    expect(undeclared).toEqual([]);
  });
});

describe('an active host is a measured host', () => {
  const baseline = readBaseline(join(root, 'baseline.json'));

  it.each(active().map((h) => [h.name] as const))('%s has a recorded baseline, so the ratchet is live', (name) => {
    // Without an entry `regressed()` returns false for anything, and `rate()`'s denominator
    // collapses to whatever registered — 15 / 16 rather than 15 / 33.
    expect(baseline[name], `${name} is active with no baseline entry: nothing ratchets and the denominator is whatever ran`).toBeDefined();
    expect(baseline[name]?.reference).toBeGreaterThan(0);
  });
});

describe('the generated files really are gitignored', () => {
  /** Every path a run writes into `vendor/`, as `run.ts` writes them. */
  const generated = onDisk.flatMap((host) => [
    ...host.imports.map((_, i) => join('vendor', host.name, shimName(i, 'module'))),
    ...host.imports.map((_, i) => join('vendor', host.name, shimName(i, 'commonjs'))),
    join('vendor', host.name, 'vitest.setup.mjs'),
    join('vendor', host.name, 'vitest.config.mjs'),
    ...(readInternals(host) ?? []).map((rel) => join('vendor', host.name, rel)),
  ]);

  it('ignores every path a run writes, so `npm run compat` cannot dirty the worktree', () => {
    // One invocation, not one per path: `git check-ignore` prints back the paths its rules
    // ignore, and exits 1 when that is none. No `--no-index`, because a path that is
    // *tracked* is not ignored whatever the rules say — and four generated files carrying
    // `/Users/…/burgee-wave3/…` inside them were tracked.
    let ignored: string[] = [];
    try {
      ignored = execFileSync('git', ['check-ignore', ...generated], { cwd: root, encoding: 'utf8' }).split('\n').filter((l) => l !== '');
    } catch {
      ignored = [];
    }
    const seen = new Set(ignored.map((p) => p.split(sep).join('/')));
    expect(generated.map((p) => p.split(sep).join('/')).filter((p) => !seen.has(p))).toEqual([]);
  });
});

function readInternals(host: Host): string[] | undefined {
  const at = join(VENDOR, host.name, '.source.json');
  if (!existsSync(at)) return undefined;
  return (JSON.parse(readFileSync(at, 'utf8')) as { internals?: string[] }).internals ?? [];
}
