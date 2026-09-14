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
import { builtinModules, createRequire } from 'node:module';
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

/**
 * A path a run writes under a host's *sub-package* directory: the vendored root for every
 * single-package host, `packages/prompts` for clack. Reading these off `host.name` alone
 * would check paths no run writes and leave the ones it does write unchecked.
 */
const at = (host: Host, rel: string): string => [`vendor/${host.name}`, host.packageDir ?? '', rel].filter((p) => p !== '').join('/');

/** `require('x')`, `import … from 'x'`, `import 'x'` — never the word "from" inside a test title. */
const SPECIFIERS = [/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, /^\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]/gm, /^\s*import\s*['"]([^'"]+)['"]/gm];
const SOURCE = /\.(m?js|cjs|ts)$/;
const BUILTIN = new Set(builtinModules);
/** First line of every file `run.ts` writes into `vendor/`, shim and config alike. */
const GENERATED_HEADER = '// generated per run';
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
    const source = readFileSync(at, 'utf8');
    // An internal shim is written at whatever path the host files its own modules, so it
    // cannot be recognised by name the way `shim.js` and `vitest.config.mjs` are. Its body
    // names the *target* of the run — `caique`, `roundel/chalk` — and reading that as a
    // package the suite requires would ask this workspace to declare its own packages.
    if (source.startsWith(GENERATED_HEADER)) continue;
    for (const name of packagesIn(source)) {
      // POSIX separators whatever the OS wrote: this string is both a message and the thing
      // the host name is read back out of, and on Windows a `\` made every undeclared entry
      // look like it belonged to no host — so the active-host scoping matched nothing and the
      // row went red there while passing everywhere else.
      if (!found.has(name)) found.set(name, at.slice(root.length + 1).split(sep).join('/'));
    }
  }
  return found;
}

/**
 * Packages a vendored suite requires that are **committed beside it**, under
 * `vendor/<host>/node_modules/`, rather than declared in a manifest.
 *
 * Read out of the git index, never off the filesystem, and that is the whole point. The
 * defect this whole lock exists for is `cli-table` resolving from a stray `~/node_modules`
 * and scoring 33 / 33 on the author's machine against 15 / 16 on `npm ci`. A directory that
 * merely *exists* here is that defect again wearing a different hat — someone's local
 * `npm install` inside `vendor/`. A directory that is **tracked** is not: it arrives with
 * the clone, before any install runs, on every machine.
 */
function committedBeside(): Set<string> {
  let tracked: string[];
  try {
    // Listed whole and filtered here rather than with a `vendor/*/node_modules` pathspec:
    // git wildmatches a pathspec containing `*` against the *full* path, so that spelling
    // matches the directory and none of the files under it, and the set comes back empty —
    // which would read as "nothing is committed beside a suite" rather than as a typo.
    tracked = execFileSync('git', ['ls-files', '--', 'vendor'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter((path) => path.includes('/node_modules/'));
  } catch {
    // No usable git: claim nothing. The manifest half of the check still runs, and a host
    // relying on a committed copy goes red here rather than silently green.
    return new Set();
  }
  // `vendor/<host>/node_modules/<name>/…` and the scoped form one segment deeper. Nested
  // copies (`…/node_modules/has-ansi/node_modules/ansi-regex`) land here too, on the last
  // `node_modules` in the path, which is what resolution from that file would find.
  return new Set(
    tracked.flatMap((path) => {
      const after = path.split('/node_modules/').at(-1) ?? '';
      const parts = after.split('/');
      const name = after.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? '');
      return name === '' ? [] : [name];
    }),
  );
}

/**
 * Every package name either manifest declares.
 *
 * Two manifests, because either one makes `npm ci` install the package: this package's own,
 * and the workspace root. The incumbents we grade against live at the root on purpose — one
 * pin each, so `string-width` cannot be ^8.1.0 here and ^8.2.2 there while the hoist quietly
 * decides which the suites actually load. That drift is not hypothetical: the control graded
 * v8's tests against a hoisted v5 and read 140 / 229 (#197).
 */
function declaredPackages(): Set<string> {
  const manifests = [join(root, 'package.json'), join(root, '../..', 'package.json')];
  return new Set(
    manifests.flatMap((path) => {
      const pkg = JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, string>>;
      return [...Object.keys(pkg['dependencies'] ?? {}), ...Object.keys(pkg['devDependencies'] ?? {}), ...Object.keys(pkg['peerDependencies'] ?? {})];
    }),
  );
}

/** Every `package.json` under a host's committed `node_modules`, nested copies included. */
function manifestsBeside(host: Host): { name?: string; dependencies?: Record<string, string> }[] {
  const modules = join(VENDOR, host.name, 'node_modules');
  if (!existsSync(modules)) return [];
  return readdirSync(modules, { recursive: true, withFileTypes: true })
    .filter((at) => at.isFile() && at.name === 'package.json')
    .map((at) => JSON.parse(readFileSync(join(at.parentPath, at.name), 'utf8')) as { name?: string; dependencies?: Record<string, string> });
}

/** Dependencies of a committed-beside package that are not themselves committed beside it. */
function incompleteBeside(beside: Set<string>): string[] {
  return onDisk.flatMap((host) =>
    manifestsBeside(host).flatMap((pkg) =>
      Object.keys(pkg.dependencies ?? {})
        .filter((dep) => !beside.has(dep))
        .map((dep) => `${pkg.name ?? '?'} needs ${dep}, which is not committed beside it`),
    ),
  );
}

/** Packages a host declares in `vendorDeps`, written into its vendored root's manifest. */
function vendorDeclared(): Map<string, string> {
  const found = new Map<string, string>();
  for (const host of onDisk) {
    const at = join(VENDOR, host.name, 'package.json');
    if (!existsSync(at)) continue;
    const pkg = JSON.parse(readFileSync(at, 'utf8')) as { devDependencies?: Record<string, string> };
    for (const name of Object.keys(pkg.devDependencies ?? {})) found.set(name, host.name);
  }
  return found;
}

describe('the oracle installs what its vendored suites require', () => {
  it('declares every package a vendored suite reaches for by name, or commits it beside the suite', () => {
    // The second way, added 2026-09-14 for wrap-ansi's `has-ansi` and slice-ansi's
    // `random-item`. Neither is a dependency of this workspace — they are *test* utilities
    // belonging to somebody else's suite — and declaring them in a manifest would put them
    // in the lockfile, where they read as ours. Committed under the suite that needs them
    // they are pinned harder than a range ever pins anything, and they cannot be confused
    // for a thing this repo depends on.
    //
    // This is a wider door than the original and not a weaker one: "declared" only promises
    // an install *would* fetch it, while "tracked" means the bytes are already here. What
    // stays refused is the case the lock was written for — a package that resolves on one
    // machine and nowhere else, which is why `committedBeside` reads the index and not the
    // disk. Proven 2026-09-14 by un-staging both directories: the row goes red naming them.
    // See the `.gitignore` in each of those two vendor directories.
    const declared = declaredPackages();
    // Resolution is not the test: `cli-table` resolved on the author's machine from a
    // stray `~/node_modules` and the suite scored 33/33, while `npm ci` gave 15/16. What
    // Three routes now, and each is a different strength of the same promise.
    //
    // `declared` — a workspace manifest. Strongest, and the right home, but adding one is a
    // `package-lock.json` change and the lockfile is the integrator's alone to touch.
    //
    // `beside` — committed under `vendor/<host>/node_modules/`, read out of the **git
    // index** and never off the disk. That is the whole point: a directory that merely
    // exists is the `cli-table` defect again wearing a hat, someone's local `npm install`
    // inside `vendor/`. A tracked one arrives with the clone, before any install runs.
    //
    // `vendorLocal` — declared in `vendor/<host>/package.json` from the host's `vendorDeps`.
    // Weakest: it says what the suite needs without putting it in the lockfile, and the
    // resolution test below is what pays for the weaker guarantee.
    const beside = committedBeside();
    const vendorLocal = vendorDeclared();
    const undeclared = [...requiredPackages(VENDOR)]
      .filter(([name]) => !declared.has(name) && !beside.has(name) && !vendorLocal.has(name))
      .map(([name, at]) => `${name} (${at})`);
    // Scoped to hosts that are **active**, and the reason is a measurement. `dotenv`'s suite
    // wants `tap`, and installing `tap` pulls 203 packages and 140 MB — which this
    // repository will not commit beside a suite and will not put in its lockfile. So that
    // host stays `planned`, its rate unpublished, and the blocker written into `hosts.ts`.
    // Requiring the dependencies of a suite nobody grades turns an honest "not measured yet"
    // into a red build, and the pressure that puts on the next agent is to fabricate a number.
    //
    // An **active** host has no such latitude: it publishes a rate, so everything it reaches
    // for must arrive with a clean checkout.
    const planned = new Set(HOSTS.filter((h) => !active().includes(h)).map((h) => h.name));
    const blocking = undeclared.filter((line) => !planned.has(line.slice(line.indexOf('(') + 1).split('/')[1] ?? ''));
    expect(blocking, 'an active host publishes a rate, so a clean checkout must have everything its suite reaches for').toEqual([]);
  });

  it('resolves every package declared vendor-locally, because nothing installs a vendored manifest', () => {
    // The weaker half of the bargain above, made loud. A root devDependency is installed by
    // `npm ci`; a name in `vendor/<host>/package.json` is not installed by anything, so it
    // is reaching us through the hoist — exactly how `@colors/colors` reached four of
    // cli-table3's test files, as an optional dependency of cli-table3 itself, one release
    // from vanishing. There the day it vanished would have arrived as a file that failed to
    // load and a rate that quietly dropped. Here it arrives as this.
    // Scoped to `vendorDeps`, which is the half that relies on the hoist. `suiteDeps` is a
    // different bargain: the vendor step *installs* those into `vendor/<host>/node_modules`
    // at exact pins, so they are absent from a fresh checkout by design and requiring them to
    // resolve here would fail on the one case the field exists for — a monorepo suite
    // importing its own siblings.
    const hoisted = new Set(HOSTS.flatMap((h) => Object.keys(h.vendorDeps ?? {})));
    const unresolvable = [...vendorDeclared()]
      .filter(([name]) => hoisted.has(name))
      .filter(([name, host]) => {
        try {
          createRequire(join(VENDOR, host, 'package.json')).resolve(name);
          return false;
        } catch {
          return true;
        }
      })
      .map(([name, host]) => `${name}, required by ${host}'s suite and declared in vendor/${host}/package.json, does not resolve — declare it at the workspace root`);
    expect(unresolvable).toEqual([]);
  });
});

describe('an active host is a measured host', () => {
  const baseline = readBaseline(join(root, 'baseline'));

  it.each(active().map((h) => [h.name] as const))('%s has a recorded baseline, so the ratchet is live', (name) => {
    // Without an entry `regressed()` returns false for anything, and `rate()`'s denominator
    // collapses to whatever registered — 15 / 16 rather than 15 / 33.
    expect(baseline[name], `${name} is active with no baseline entry: nothing ratchets and the denominator is whatever ran`).toBeDefined();
    expect(baseline[name]?.reference).toBeGreaterThan(0);
  });
});

/**
 * One `.gitignore` pattern, as a glob `matchesGlob` understands. The file uses three shapes
 * and no others; anything else is refused rather than quietly treated as "no match", because
 * a rule this lock cannot read is a rule it cannot enforce.
 */
function ignoreGlobs(line: string): string[] {
  if (line.startsWith('!') || line.includes('**')) throw new Error(`vendored-suite.test.ts cannot read the .gitignore rule "${line}" — teach it the shape or the lock is not enforcing it`);
  const body = line.endsWith('/') ? line.slice(0, -1) : line;
  const anchored = body.includes('/') ? body : `**/${body}`;
  return line.endsWith('/') ? [`${anchored}/**`] : [anchored];
}

describe('the generated files really are gitignored', () => {
  /** Every path a run writes into `vendor/`, as `run.ts` writes them, posix. */
  // The vitest config, its setup file and the internal shims are written at the
  // *sub-package's* directory, which is the vendored root for every single-package host
  // and `packages/prompts` for clack. Reading them off `host.name` alone would check paths
  // no run writes, and leave the ones it does write unchecked.
  const generated = onDisk.flatMap((host) => [
    ...host.imports.map((_, i) => `vendor/${host.name}/${shimName(i, 'module')}`),
    ...host.imports.map((_, i) => `vendor/${host.name}/${shimName(i, 'commonjs')}`),
    at(host, 'vitest.setup.mjs'),
    at(host, 'vitest.config.mjs'),
    ...(readInternals(host) ?? []).map((rel) => at(host, rel.split(sep).join('/'))),
  ]);

  const rules = readFileSync(join(root, '.gitignore'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'))
    .flatMap(ignoreGlobs);

  it('ignores every path a run writes, so `npm run compat` cannot dirty the worktree', () => {
    // Read off the rules rather than out of `git check-ignore`: the shipped defect was a
    // *missing rule* — `shim.mjs` and `vendor/*/src/` matched nothing — and a spawned git is
    // one more thing to behave differently on another OS than the rule it is checking.
    expect(generated.filter((p) => !rules.some((g) => matchesGlob(p, g)))).toEqual([]);
  });

  it('has none of them in the index, where an ignore rule no longer reaches', () => {
    // A path already committed stays tracked however well it is ignored, and four of these
    // were — carrying an absolute path from the author's machine inside them.
    let tracked: string[];
    try {
      tracked = execFileSync('git', ['ls-files', '--', 'vendor'], { cwd: root, encoding: 'utf8' }).split('\n').filter((l) => l !== '');
    } catch (cause) {
      // No usable git (a source tarball, a sandbox): the rule check above still holds, and
      // saying so beats a lock that looks green because it never ran.
      expect.soft(String(cause)).toBe('git unavailable — the index check did not run');
      return;
    }
    expect(tracked.filter((p) => generated.includes(p))).toEqual([]);
  });
});

function readInternals(host: Host): string[] | undefined {
  const at = join(VENDOR, host.name, '.source.json');
  if (!existsSync(at)) return undefined;
  return (JSON.parse(readFileSync(at, 'utf8')) as { internals?: string[] }).internals ?? [];
}
