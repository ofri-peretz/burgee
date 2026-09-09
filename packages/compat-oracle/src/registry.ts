/**
 * `fromRegistry()` — the second way to build a `CompatRecord`, from the published tarball.
 *
 * `upstream-watch` design R3. The existing path clones a repo, which is right for a *suite*
 * (we need the tests) and wrong for a *surface*: the tarball carries the `.d.ts` and the
 * entry point, which is what an API diff and a weight number need, and it is what a user
 * actually installs. It also needs no knowledge of a repo's layout, which is the thing that
 * limits the clone path to hosts somebody hand-configured.
 *
 * Read-only, per intent constraint 1: download, verify, unpack in memory, read. No
 * `npm install`, so no upstream `postinstall` ever runs in a scheduled job holding a token.
 *
 * **Every number this produces is tied to the bytes it was computed from.** The tarball is
 * checked against the registry's own `dist.shasum`, and the `package.json` inside it must
 * name the package and version we asked for. Both are errors, not warnings: this repo has
 * already shipped a benchmark that resolved a hoisted package instead of the declared one
 * and reported a plausible number, and a fingerprint is the same shape of risk.
 */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

import { maxSatisfying } from './semver.js';
import { unpack } from './tar.js';
import { type CompatRecord, sha256, surfaceNames } from './upstream.js';

export interface RegistryManifest {
  name: string;
  version: string;
  main?: string;
  types?: string;
  typings?: string;
  dependencies?: Record<string, string>;
  exports?: unknown;
  repository?: string | { url?: string };
  dist: { tarball: string; shasum?: string; integrity?: string };
}

export interface Packument {
  name: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, RegistryManifest>;
}

/** The two network calls, injectable so every test in this package runs offline. */
export interface RegistryClient {
  packument: (name: string) => Promise<Packument>;
  download: (url: string) => Promise<Buffer>;
}

const REGISTRY = 'https://registry.npmjs.org';
const REQUEST_TIMEOUT_MS = 30_000;
/**
 * A ceiling on what one tarball may expand to. npm's own publish limit is far below this,
 * and the watch reads whatever a competitor chose to publish — an unbounded `gunzipSync` on
 * a remote archive is a decompression bomb away from taking the runner down.
 */
const MAX_UNPACKED_BYTES = 256 * 1024 * 1024;

/**
 * npm package names are `name` or `@scope/name` — nothing else, and nothing with a path
 * segment of its own. Checked rather than assumed: this string becomes a URL, and a name
 * that is not one of those two shapes is a request we would be building blind.
 */
const NPM_NAME_SHAPE = /^(?:@[^/@\s]+\/)?[^/@\s]+$/;

/**
 * A scoped name is *one* path segment on the registry, so its slash is encoded.
 *
 * `replaceAll` rather than `replace`: the latter encodes only the first slash, which is
 * correct for every name that passes the shape check above and silently wrong for anything
 * that does not. Depending on a guard two lines up to keep an encoder correct is how an
 * encoder stops being correct.
 */
export function packumentUrl(name: string): string {
  if (!NPM_NAME_SHAPE.test(name)) throw new Error(`not an npm package name: "${name}"`);
  return `${REGISTRY}/${name.replaceAll('/', '%2f')}`;
}

export const liveRegistry: RegistryClient = {
  packument: async (name) => {
    const response = await fetch(packumentUrl(name), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`registry: ${name} → HTTP ${response.status}`);
    return (await response.json()) as Packument;
  },
  download: async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`registry: ${url} → HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  },
};

/**
 * The same client, answering each distinct request once.
 *
 * A dependency closure revisits shared packages constantly — `string-width` sits under four
 * different parents in boxen's tree — and the watch runs over every competitor on a daily
 * schedule. Without this it is hundreds of redundant requests against a public registry.
 */
function memo<T>(store: Map<string, Promise<T>>, key: string, make: () => Promise<T>): Promise<T> {
  const existing = store.get(key);
  if (existing !== undefined) return existing;
  const created = make();
  store.set(key, created);
  return created;
}

export function cached(client: RegistryClient): RegistryClient {
  const packuments = new Map<string, Promise<Packument>>();
  const downloads = new Map<string, Promise<Buffer>>();
  return {
    packument: async (name) => memo(packuments, name, () => client.packument(name)),
    download: async (url) => memo(downloads, url, () => client.download(url)),
  };
}

export interface Fetched {
  name: string;
  version: string;
  /** sha1 of the tarball, as the registry publishes it and as we recomputed it. */
  shasum: string;
  manifest: RegistryManifest;
  files: Map<string, Buffer>;
}

const sha1 = (buf: Buffer): string => createHash('sha1').update(buf).digest('hex');

/** The version a tag or range resolves to *now*, recorded so a number can be traced to it. */
export function resolveVersion(packument: Packument, wanted: string): string {
  const tagged = packument['dist-tags'][wanted];
  if (tagged !== undefined) return tagged;
  if (wanted in packument.versions) return wanted;
  const best = maxSatisfying(Object.keys(packument.versions), wanted);
  if (best !== null) return best;
  throw new Error(`no published version of ${packument.name} satisfies "${wanted}"`);
}

/**
 * Download and unpack one published release.
 *
 * Three things must agree before anything is measured: the registry's `dist.shasum` and the
 * bytes we received, and the name and version inside the tarball's own `package.json`. A
 * disagreement throws. The alternative — reporting a number from whatever arrived — is how
 * a watch ends up fingerprinting `clack@0.1.0`, an unrelated placeholder, and calling it
 * the prompts library.
 */
export async function fetchPackage(name: string, wanted: string, client: RegistryClient = liveRegistry): Promise<Fetched> {
  const packument = await client.packument(name);
  const version = resolveVersion(packument, wanted);
  const manifest = packument.versions[version];
  if (manifest === undefined) throw new Error(`${name}@${version} is in dist-tags but not in versions`);

  const archive = await client.download(manifest.dist.tarball);
  const shasum = sha1(archive);
  const published = manifest.dist.shasum;
  if (published !== undefined && published !== shasum) {
    throw new Error(`${name}@${version}: tarball sha1 ${shasum} is not the published ${published}`);
  }

  const files = unpack(gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES }));
  const inner = files.get('package.json');
  if (inner === undefined) throw new Error(`${name}@${version}: tarball has no package.json`);
  const declared = JSON.parse(inner.toString('utf8')) as { name?: string; version?: string };
  if (declared.name !== name || declared.version !== version) {
    throw new Error(
      `${name}@${version}: the tarball declares ${String(declared.name)}@${String(declared.version)} — refusing to fingerprint a package we did not ask for`,
    );
  }
  return { name, version, shasum, manifest, files };
}

/**
 * Shipped code and data, the same rule the weight locks and the READMEs use: `.js`, `.mjs`,
 * `.cjs` and the `.json` a module imports, with `package.json` never counted.
 *
 * The published comparisons count a competitor *whole* across its resolved tree rather than
 * only the files an import reaches, and this reproduces them exactly — ora 9.4.1 at 113,577 B
 * across seventeen packages and log-update 8.0.0 at 113,368 across sixteen, both to the byte.
 * If this and the published claim ever disagree, the claim is what has gone stale.
 */
const SHIPPED = /\.(?:mjs|cjs|js|json)$/;
const isManifest = (path: string): boolean => path === 'package.json' || path.endsWith('/package.json');

export function shippedBytes(files: Map<string, Buffer>): number {
  let bytes = 0;
  for (const [path, body] of files) {
    if (SHIPPED.test(path) && !isManifest(path)) bytes += body.length;
  }
  return bytes;
}

export interface TreeWeight {
  /** Bytes shipped by the package itself. */
  self: number;
  /** Bytes across its whole resolved dependency closure, each package counted whole. */
  total: number;
  /** `name@version` → bytes, so an issue can say which dependency moved. */
  packages: Record<string, number>;
}

/**
 * The resolved dependency closure, measured from the registry rather than an install.
 *
 * Ranges resolve to the highest published version that satisfies them, which is what a
 * fresh `npm install` of that package alone would pick. A range we cannot parse — a git
 * URL, an alias — is skipped and named in `packages` with a `?` version, so it shows up as
 * a gap rather than silently lowering the number.
 */
export async function treeWeight(name: string, version: string, client: RegistryClient = liveRegistry): Promise<TreeWeight> {
  const packages = new Map<string, number>();
  const visited = new Set<string>();
  const shared = cached(client);
  let self = 0;

  const visit = async (pkg: string, range: string, depth: number): Promise<void> => {
    // Keyed by the *request*, so a range already walked is not re-resolved; `packages` is
    // keyed by the resolved version, which is what two majors of one package must not share.
    if (visited.has(`${pkg}@${range}`)) return;
    visited.add(`${pkg}@${range}`);
    let resolved: Fetched;
    try {
      resolved = await fetchPackage(pkg, range, shared);
    } catch {
      packages.set(`${pkg}@?`, 0);
      return;
    }
    const key = `${resolved.name}@${resolved.version}`;
    if (packages.has(key)) return;
    const bytes = shippedBytes(resolved.files);
    packages.set(key, bytes);
    if (depth === 0) self = bytes;
    for (const [dep, depRange] of Object.entries(resolved.manifest.dependencies ?? {})) {
      // Sequential on purpose: this walks a public registry on a daily schedule, and a
      // fan-out over a deep tree is a burst of requests nobody asked us to make.
      // eslint-disable-next-line reliability/no-await-in-loop -- deliberate: one request at a time
      await visit(dep, depRange, depth + 1);
    }
  };

  await visit(name, version, 0);
  const total = [...packages.values()].reduce((a, b) => a + b, 0);
  return { self, total, packages: Object.fromEntries(packages) };
}

/**
 * The export forms a published `.d.ts` uses that `surfaceNames()` does not read.
 *
 * `surfaceNames()` was written against a *cloned host's* source, where the surface is
 * declared inline (`export declare function ora(...)`). A published tarball's entry is more
 * often a barrel or a CommonJS shim, and four of the nineteen packages watched here came
 * back with **zero** names until this existed: `@clack/prompts` re-exports a clause
 * (`export { isCancel, settings } from '...'`), cli-table3 is `declare const X` +
 * `export = X`, yargs is `export default Yargs`, slice-ansi is
 * `export default function sliceAnsi`.
 *
 * A competitor whose surface reads as empty is a watch that can report a file hash moving
 * and never an API change — which is most of what the watch is for. Kept here rather than
 * folded into `surfaceNames()` so the vendored hosts' records keep diffing as they did.
 */
const REEXPORT_CLAUSE = /export\s*\{([^}]*)\}/g;
const EXPORT_ASSIGN = /^export\s*=\s*([A-Za-z_$][\w$]*)/m;
const EXPORT_DEFAULT = /^export\s+default\s+(?:function\s+|class\s+)?([A-Za-z_$][\w$]*)?/m;
const NAMESPACE = /^declare\s+namespace\s+([A-Za-z_$][\w$]*)/gm;

/** `a`, `b as c` → the name a consumer imports, so `c`. */
function clauseNames(clause: string): string[] {
  return clause
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const aliased = /\bas\s+(['"]?)([^'"\s]+)\1$/.exec(part);
      return (aliased?.[2] ?? part).replace(/^type\s+/, '').trim();
    })
    .filter((name) => name !== '' && name !== '*');
}

export function reexportedNames(source: string): string[] {
  const names = new Set<string>();
  for (const m of source.matchAll(REEXPORT_CLAUSE)) {
    for (const name of clauseNames(m[1] ?? '')) names.add(name);
  }
  for (const m of source.matchAll(NAMESPACE)) {
    if (m[1] !== undefined) names.add(m[1]);
  }
  if (EXPORT_ASSIGN.test(source) || EXPORT_DEFAULT.test(source)) names.add('default');
  return [...names].sort();
}

/** `.d.ts` first: a type-only addition is a real API addition and no runtime scan sees it. */
const DECLARATION = /\.d\.(?:m|c)?ts$/;
const ENTRY = /\.(?:mjs|cjs|js)$/;

/** Surface files worth fingerprinting, most-authoritative first, capped so a big package stays cheap. */
const SURFACE_LIMIT = 12;

export function surfaceFilesOf(files: Map<string, Buffer>, manifest: RegistryManifest): string[] {
  const declared = [manifest.types, manifest.typings, manifest.main].filter((p): p is string => typeof p === 'string');
  const normalized = declared.map((p) => p.replace(/^\.\//, ''));
  const declarations = [...files.keys()].filter((p) => DECLARATION.test(p)).sort();
  const roots = [...files.keys()].filter((p) => ENTRY.test(p) && !p.includes('/')).sort();
  const ordered = [...new Set([...normalized, ...declarations, ...roots])].filter((p) => files.has(p));
  return ordered.slice(0, SURFACE_LIMIT);
}

export interface RegistrySnapshot {
  record: CompatRecord;
  weight: TreeWeight;
  shasum: string;
}

/** The fields `CompatRecord` needs that only make sense for a clone, given honest values here. */
function registryRecord(fetched: Fetched, weight: TreeWeight): CompatRecord {
  const hashes = new Map<string, string>();
  for (const [path, body] of [...fetched.files].sort(([a], [b]) => a.localeCompare(b))) {
    hashes.set(path, sha256(body.toString('utf8')));
  }
  const surface = new Map<string, string[]>();
  for (const path of surfaceFilesOf(fetched.files, fetched.manifest)) {
    const source = fetched.files.get(path)?.toString('utf8') ?? '';
    surface.set(path, [...new Set([...surfaceNames(source), ...reexportedNames(source)])].sort());
  }
  const repo = fetched.manifest.repository;
  return {
    repo: (typeof repo === 'string' ? repo : repo?.url) ?? `npm:${fetched.name}`,
    version: fetched.version,
    tag: null,
    // The tarball's sha1 is this release's content identity, the way a commit is a clone's.
    commit: fetched.shasum,
    vendored: new Date().toISOString(),
    files: fetched.files.size,
    internalFiles: [],
    internals: [],
    hashes: Object.fromEntries(hashes),
    // A tarball carries no suite. `diffRecords()` handles an empty map on both sides, so
    // the same diff function serves both sources without a flag.
    tests: {},
    surface: Object.fromEntries(surface),
  };
}

/**
 * Fingerprint a published release: per-file sha256, the API surface from its `.d.ts` and
 * entry point, and the weight of its resolved tree.
 */
export async function fromRegistry(name: string, wanted = 'latest', client: RegistryClient = liveRegistry): Promise<RegistrySnapshot> {
  const fetched = await fetchPackage(name, wanted, client);
  const weight = await treeWeight(name, fetched.version, client);
  return { record: registryRecord(fetched, weight), weight, shasum: fetched.shasum };
}
