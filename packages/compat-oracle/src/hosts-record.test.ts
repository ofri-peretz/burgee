/**
 * Every row of `hosts.ts` against the suite it vendored.
 *
 * A row is read in two places. The compat ratchet's runs read it in another process, against
 * `baseline/<host>.json`, and nothing in this package's suite runs those. The vendor step
 * read it once, when it wrote `vendor/<host>/`: the clone it took (`repo`, the tag from
 * `tagPrefix` and `pinnedVersion`), the files it fingerprinted (`testDir`, `testGlob`,
 * `surfaceFiles`) and the `package.json` it generated (`npmName`, `selfExports`, `shim`,
 * `vendorDeps`, `suiteDeps`, `avaConfig`) are all committed beside the suite. A row edited after
 * that, by hand or by a slip, no longer describes the directory the ratchet grades, and the next
 * re-vendor quietly takes a different clone, fingerprints different files or installs different
 * dependencies. These locks say so the day the row moves, without a network or a grade.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { testFiles } from './discover.js';
import { type Host, HOSTS, PREVIOUS_MAJORS } from './hosts.js';
import { type CompatRecord, readRecord, sha256 } from './upstream.js';
import { classify, rootPackage, shimName, type UpstreamPackage } from './vendor.js';

const VENDOR = join(resolve(fileURLToPath(new URL('..', import.meta.url))), 'vendor');

/** Rows whose suite is on disk with the record the vendor step wrote, and that record. */
const recorded: (readonly [string, Host, CompatRecord])[] = [...HOSTS, ...PREVIOUS_MAJORS].flatMap((host) => {
  const record = readRecord(join(VENDOR, host.name));
  return record === undefined || !existsSync(join(VENDOR, host.name, '.source.json')) ? [] : [[host.name, host, record] as const];
});

describe('a row describes the clone its suite was vendored from', () => {
  it('finds a record for every active row', () => {
    const missing = HOSTS.filter((h) => h.status === 'active' && !recorded.some(([name]) => name === h.name)).map((h) => h.name);
    expect(missing).toEqual([]);
  });

  it.each(recorded)('%s: the repository it cloned', (_name, host, record) => {
    expect(host.repo).toBe(record.repo);
  });

  // An untagged release (rc 1.2.8) was cloned at HEAD and records no tag, so there is no prefix to hold.
  it.each(recorded.filter(([, , r]) => r.tag !== null))('%s: the tag its prefix and version name', (_name, host, record) => {
    expect(`${host.tagPrefix ?? 'v'}${record.version}`).toBe(record.tag);
  });

  it.each(recorded.filter(([, h]) => h.pinnedVersion !== undefined))('%s: the version it is pinned at', (_name, host, record) => {
    expect(host.pinnedVersion).toBe(record.version);
  });
});

describe('a row names the files its record fingerprinted', () => {
  it.each(recorded)('%s: every surface file, and no other', (_name, host, record) => {
    expect([...(host.surfaceFiles ?? [])].sort()).toEqual(Object.keys(record.surface).sort());
  });

  it.each(recorded)('%s: every graded test file, under its test directory', (_name, host, record) => {
    const graded = testFiles(join(VENDOR, host.name, host.testDir), host).map((rel) => `${host.testDir}/${rel}`);
    expect(graded.length).toBeGreaterThan(0);
    expect(graded.filter((key) => record.hashes[key] === undefined)).toEqual([]);
  });
});

/**
 * A graded file as upstream released it: every shim specifier the vendor step wrote turned back
 * into the row's own import, as it reads from that file's directory. Written out, not imported:
 * the lock is that the row's `imports`, in their order, undo `rewriteAt`, so it must not share it.
 */
/** A relative path as an import specifier writes it: forward slashes, and `./` before a bare name. */
const dotted = (p: string): string => {
  const posix = p.split(sep).join('/');
  return posix.startsWith('.') ? posix : `./${posix}`;
};

function released(host: Host, rel: string, packageType: string): string {
  const hostDir = join(VENDOR, host.name);
  const testDir = join(hostDir, host.testDir);
  const fileDir = dirname(join(testDir, rel));
  return host.imports.reduce((source, entry, i) => {
    const upstreamHere = entry.upstream.startsWith('.') ? dotted(relative(fileDir, resolve(testDir, entry.upstream))) : entry.upstream;
    const shimHere = dotted(relative(fileDir, join(hostDir, shimName(i, packageType, host.shim))));
    return source.replaceAll(`'${shimHere}'`, `'${upstreamHere}'`).replaceAll(`"${shimHere}"`, `"${upstreamHere}"`);
  }, readFileSync(join(testDir, rel), 'utf8'));
}

const packageTypeOf = (host: Host): string => (JSON.parse(readFileSync(join(VENDOR, host.name, 'package.json'), 'utf8')) as UpstreamPackage).type ?? 'commonjs';

describe('a row names the upstream files its suite reads beside the tests', () => {
  // `extraDirs` is read by the vendor step alone, which copies each entry beside the tests. One
  // the pinned release does not ship is skipped and reported (`VendorResult.missingExtras`), a
  // declaration to prune; every row's entries are on disk today, and this keeps them so.
  it.each(recorded.filter(([, h]) => (h.extraDirs ?? []).length > 0))('%s: every extra directory or file it vendored', (_name, host) => {
    const extras = host.extraDirs ?? [];
    expect(extras.filter((e) => e.trim() === '' || e === '.')).toEqual([]);
    expect(extras.filter((e) => !existsSync(join(VENDOR, host.name, e)))).toEqual([]);
  });
});

describe("a row's imports turn the vendored suite back into upstream's bytes", () => {
  it.each(recorded)('%s', (_name, host, record) => {
    const type = packageTypeOf(host);
    const wrong = testFiles(join(VENDOR, host.name, host.testDir), host).filter((rel) => sha256(released(host, rel, type)) !== record.hashes[`${host.testDir}/${rel}`]);
    expect(wrong).toEqual([]);
  });

  it.each(recorded)('%s: the files it reads as internal-only, and the internals it shims', (_name, host, record) => {
    const type = packageTypeOf(host);
    const sources = testFiles(join(VENDOR, host.name, host.testDir), host).map((rel) => [rel, released(host, rel, type)] as const);
    expect(sources.filter(([, s]) => classify(s, host) === 'internal').map(([rel]) => rel).sort()).toEqual([...record.internalFiles].sort());
  });
});

/** The test framework a runner's suites import by name; `undefined` for the runners whose suites import none. */
const FRAMEWORK: Readonly<Record<Host['runner'], string | undefined>> = {
  ava: 'ava',
  'node:test': 'node:test',
  tap: 'tap',
  uvu: 'uvu',
  tsd: 'tsd',
  twist: 'twist',
  // mocha's and vitest's globals need no import (yargs' suite imports mocha's types, cross-spawn
  // vitest's), and a suite graded by its exit code imports nothing of the kind.
  mocha: undefined,
  vitest: undefined,
  'exit-code': undefined,
};
const imported = (source: string, name: string): boolean => new RegExp(`['"]${name.replace(':', '\\:')}(?:/[^'"]*)?['"]`).test(source);

describe('a row names the runner its suite is written for', () => {
  it.each(recorded)('%s', (_name, host) => {
    expect(Object.keys(FRAMEWORK)).toContain(host.runner);
    const sources = testFiles(join(VENDOR, host.name, host.testDir), host).map((rel) => readFileSync(join(VENDOR, host.name, host.testDir, rel), 'utf8'));
    const own = FRAMEWORK[host.runner];
    // A suite imports its own framework somewhere, and never another runner's.
    if (own !== undefined) expect(sources.some((s) => imported(s, own))).toBe(true);
    const others = Object.values(FRAMEWORK).filter((f): f is string => f !== undefined && f !== own);
    expect(others.filter((f) => sources.some((s) => imported(s, f)))).toEqual([]);
  });
});

/** `import x from '<shim>'` or `import x, { y } from '<shim>'`, for the shim of import `i`. */
const defaultImportOf = (i: number): RegExp => new RegExp(`import\\s+[\\w$]+\\s*(?:,[^;]*?)?from\\s*['"][./]*shim${i === 0 ? '' : `-${String(i)}`}\\.(?:m?js|cjs)['"]`);

/** What a control run's shim re-exports for one import: `run.ts`'s rule, restated. */
const controlOf = (host: Host, entry: Host['imports'][number]): string => entry.control ?? `${host.npmName ?? host.name}${entry.subpath}`;

describe("a row's imports hand the suite the default it imports", () => {
  it.each(recorded)('%s: a default the suite imports is re-exported', (_name, host) => {
    const sources = testFiles(join(VENDOR, host.name, host.testDir), host).map((rel) => readFileSync(join(VENDOR, host.name, host.testDir, rel), 'utf8'));
    const dropped = host.imports.flatMap((entry, i) => (sources.some((s) => defaultImportOf(i).test(s)) && !entry.reexportDefault && entry.defaultExport === undefined ? [entry.upstream] : []));
    expect(dropped).toEqual([]);
  });

  // `export { default } from` an ES module with no default is a SyntaxError before any case runs.
  // Rows whose incumbent the workspace installs; a `suiteDeps` pin lands under
  // `vendor/<host>/node_modules` only when a grade installs it, which this suite never does.
  it.each(recorded.filter(([, h]) => h.status === 'active' && h.shim === undefined && h.suiteDeps === undefined))('%s: a default it re-exports, the incumbent has', async (_name, host) => {
    const specifiers = host.imports.filter((e) => e.reexportDefault).map((entry) => controlOf(host, entry));
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- each specifier is an incumbent a row of hosts.ts names, the module under test
    const loaded = (await Promise.all(specifiers.map(async (spec) => import(spec)))) as Record<string, unknown>[];
    expect(specifiers.filter((_spec, i) => !('default' in (loaded[i] ?? {})))).toEqual([]);
  });
});

const BASELINE = join(VENDOR, '..', 'baseline');
const WORKSPACE = join(VENDOR, '..', '..');

describe('a row is active exactly when the ratchet holds a baseline for it', () => {
  it.each(HOSTS.map((h) => [h.name, h] as const))('%s', (_name, host) => {
    expect(host.status === 'active').toBe(existsSync(join(BASELINE, `${host.name}.json`)));
  });

  it.each(PREVIOUS_MAJORS.map((h) => [h.name, h] as const))('%s (a previous major)', (_name, host) => {
    expect(host.status === 'active').toBe(existsSync(join(BASELINE, 'majors', `${host.name}.json`)));
  });
});

/** Every specifier a target run imports for a row, as `<package>/<subpath>`. */
const targetSpecifiers = (host: Host): string[] => [
  ...host.imports.map((entry) => entry.target ?? `${host.target}${entry.subpath}`),
  ...(host.entries ?? []).map((entry) => `${host.target}${entry.target}`),
];

describe("an active row's target run imports what the workspace exports", () => {
  it.each([...HOSTS, ...PREVIOUS_MAJORS].filter((h) => h.status === 'active').map((h) => [h.name, h] as const))('%s', (_name, host) => {
    const missing = targetSpecifiers(host).filter((spec) => {
      const [pkg = '', ...rest] = spec.split('/');
      const manifest = join(WORKSPACE, pkg, 'package.json');
      if (pkg === '' || !existsSync(manifest)) return true;
      const exports = (JSON.parse(readFileSync(manifest, 'utf8')) as { exports?: Record<string, unknown> }).exports ?? {};
      const subpath = rest.length === 0 ? '.' : `./${rest.join('/')}`;
      return !(subpath in exports);
    });
    expect(missing).toEqual([]);
  });
});

describe("a row generates the vendored root's package.json", () => {
  it.each(recorded)('%s', (_name, host) => {
    const written = JSON.parse(readFileSync(join(VENDOR, host.name, 'package.json'), 'utf8')) as Record<string, unknown> & UpstreamPackage;
    // The upstream fields rootPackage copies are read back from the file itself; everything else
    // in it is the row's.
    const upstream = Object.fromEntries(
      (['type', 'version', 'license', 'description', 'repository'] as const).flatMap((key) => (written[key] === undefined ? [] : [[key, written[key]]])),
    ) as UpstreamPackage;
    expect(rootPackage(host, upstream)).toEqual(written);
  });
});

/**
 * `majorOf` is read by nothing at runtime: it is the row's statement of which host it is an older
 * release of. These hold it to what that means — the same repository, the same package, and a
 * name that says the major its pin is at.
 */
describe('a previous major names the host it is an older release of', () => {
  it.each(PREVIOUS_MAJORS.map((h) => [h.name, h] as const))('%s', (_name, major) => {
    const current = HOSTS.find((h) => h.name === major.majorOf);
    expect(current, `majorOf "${String(major.majorOf)}" names no row of HOSTS`).toBeDefined();
    expect(major.repo).toBe(current?.repo);
    expect(major.npmName ?? major.name).toBe(current?.npmName ?? current?.name);
    expect(major.name).toBe(`${String(major.majorOf)}-${(major.pinnedVersion ?? '').split('.')[0] ?? ''}`);
  });
});

/**
 * `targetInternals` is read only by a target run, in the compat ratchet's process: it points an
 * internal module the suite imports at the target's own module of the same job. A path the
 * suite does not reach, a file the target does not have or a name it does not export each make
 * that run fail at link time, and nothing here would say so.
 */
describe("a row's target internals name a module the suite reaches, and the target's module that answers it", () => {
  const rows = [...HOSTS, ...PREVIOUS_MAJORS].filter((h) => h.status === 'active' && h.targetInternals !== undefined);

  it('there are rows to check', () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it.each(rows.flatMap((h) => Object.entries(h.targetInternals ?? {}).map(([rel, own]) => [`${h.name} ${rel}`, h, rel, own] as const)))('%s', async (_label, host, rel, { file, names }) => {
    expect(readRecord(join(VENDOR, host.name))?.internals, `the suite reaches no internal ${rel}`).toContain(rel);
    expect(Object.keys(names).length).toBeGreaterThan(0);
    // `file` is the built module; its source is the same path under src/.
    const source = join(WORKSPACE, host.target.split('/')[0] ?? '', file.replace(/^dist\//u, 'src/').replace(/\.js$/u, '.ts'));
    expect(existsSync(source), `${file} has no source at ${source}`).toBe(true);
    // eslint-disable-next-line node-security/no-dynamic-dependency-loading -- a source file of this workspace, named by a row of hosts.ts, the module under test
    const loaded = (await import(source)) as Record<string, unknown>;
    expect(Object.values(names).filter((name) => !(name in loaded))).toEqual([]);
  });
});
