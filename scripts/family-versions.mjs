#!/usr/bin/env node
/**
 * Write `dist/family-versions.json` for burgee: every published package in this repository at
 * the version its own `package.json` declares, and, for each package, the version from which
 * every one of its subpaths is exported. Run from `packages/burgee`, after tsc.
 *
 * `burgee migrate` prints the install command a migration needs, and since U12-2
 * (D-20261008-migrate-u12-findings) it pins each family package to the version that carries the
 * drop-in it graded: `roundel@^1.0.0`, not a bare `roundel` a package manager may resolve to
 * 0.6.2. Those versions are the manifests beside burgee's own in this repository, and the
 * published package has no such directory, so the build copies them here. Read at build time
 * and never typed, so a release that bumps a package moves the pin with it.
 *
 * `since` is migrate-pins-carry-the-drop-in. Under a release age `next` may pin below the graded
 * version, and on 2026-10-18 it pinned `roundel@^1.0.4` for an import of `roundel/picocolors`,
 * which first shipped in roundel 1.1.0: the migrated svgo could not start. So for each package
 * the build reads the `exports` keys of the `package.json` at every one of its release tags
 * (`<name>@<version>`, which `release.yml` pushes) in the current major, and records for each
 * subpath the oldest version from which every tagged release up to the current one exports it.
 * The table comes from this repository's own history; nothing asks the registry.
 *
 * A checkout without tags (a shallow CI clone) has no history, and each subpath's floor is then
 * the current version: never too low, only higher than it needs to be. `release.yml` re-runs
 * this script with full history and `--require-tags` before it ships, because turbo may have
 * restored this file from a build that ran without tags.
 *
 * Turbo cannot serve a stale copy from its cache: `package-lock.json` is a global dependency
 * (`turbo.json`) and records every workspace package's version, so a bump re-runs this build.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `[major, minor, patch]` of a plain `x.y.z`, or `undefined` for anything else (a prerelease, a range). */
export function parts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return match === null ? undefined : [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Ascending order of two plain versions. */
export function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

/** The subpaths a manifest exports: the `./…` keys of `exports`, or `.` alone when it has none or a bare string. */
export function subpathsOf(manifest) {
  // A string or an array has no `./` keys either, and an exports object of conditions only
  // (`{ import, require }`) is the root entry: each of them is `.` alone.
  const keys = Object.keys(manifest.exports ?? {}).filter((key) => key === '.' || key.startsWith('./'));
  return keys.length === 0 ? ['.'] : keys;
}

/**
 * For each subpath the current manifest exports, the oldest version of the current major from
 * which every tagged release up to the current one exports it. `history` is the tagged releases,
 * in any order; a tag outside the current major, newer than the current version, or not a plain
 * `x.y.z` is ignored. A release that dropped a subpath and a later one that brought it back
 * leave the floor at the later one: the floor is a run of releases, not a first appearance.
 */
export function sinceOf(current, history) {
  const subpaths = subpathsOf(current.manifest);
  const at = parts(current.version);
  // A version that is not a plain `x.y.z` has no major to read tags in: every floor is that version.
  if (at === undefined) return Object.fromEntries(subpaths.map((subpath) => [subpath, current.version]));
  const [major] = at;
  const releases = history
    .filter((r) => parts(r.version)?.[0] === major && compare(r.version, current.version) < 0)
    .sort((a, b) => compare(b.version, a.version));
  const since = {};
  for (const subpath of subpaths) {
    let floor = current.version;
    for (const release of releases) {
      if (!subpathsOf(release.manifest).includes(subpath)) break;
      floor = release.version;
    }
    since[subpath] = floor;
  }
  return since;
}

/** Every published package under `packages`: its directory, name, version and manifest. */
export function published(packages) {
  const out = [];
  for (const entry of readdirSync(packages, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(packages, entry.name, 'package.json'), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (manifest.private !== true) out.push({ dir: entry.name, name: manifest.name, version: manifest.version, manifest });
  }
  return out;
}

/** Every tagged manifest of every package fits in this, many times over. */
const MAX_BUFFER = 1 << 26;
const NEWLINE = 0x0a;

/** git's answer, or nothing where there is no git or no repository: a missing history is a fact this script reports, not a crash. */
function git(root, args, input) {
  try {
    return execFileSync('git', ['-C', root, ...args], { input, stdio: ['pipe', 'pipe', 'ignore'], maxBuffer: MAX_BUFFER });
  } catch {
    return Buffer.alloc(0);
  }
}

/**
 * The manifest at each release tag of `pkg`, read in one `git cat-file --batch`. Tags are
 * `<unscoped name>@<version>`, as `release.yml` writes them. A tag whose tree has no manifest
 * at `packages/<dir>/package.json` is left out, not counted as a release without the subpath.
 */
export function historyOf(root, pkg) {
  const unscoped = pkg.name.split('/').at(-1);
  const tags = git(root, ['tag', '--list', `${unscoped}@*`])
    .toString('utf8')
    .split('\n')
    .filter((tag) => parts(tag.slice(unscoped.length + 1)) !== undefined);
  const batch = git(root, ['cat-file', '--batch'], `${tags.map((tag) => `${tag}:packages/${pkg.dir}/package.json`).join('\n')}\n`);
  const out = [];
  let at = 0;
  for (const tag of tags) {
    // `--batch` answers every input line with one header line, so there is always one to read.
    const end = batch.indexOf(NEWLINE, at);
    const header = batch.subarray(at, end).toString('utf8').split(' ');
    at = end + 1;
    if (header[1] !== 'blob') continue;
    // `--batch` gives the size in bytes, and a description may not be ASCII, so the body is cut from the bytes.
    const size = Number(header[2]);
    const body = batch.subarray(at, at + size).toString('utf8');
    at += size + 1;
    out.push({ version: tag.slice(unscoped.length + 1), manifest: JSON.parse(body) });
  }
  return out;
}

/** The whole file: `{ versions, since }`, and how many tags the history had. */
export function familyTable(root) {
  const packages = published(join(root, 'packages'));
  const versions = {};
  const since = {};
  let tags = 0;
  for (const pkg of packages) {
    versions[pkg.name] = pkg.version;
    const history = historyOf(root, pkg);
    tags += history.length;
    since[pkg.name] = sinceOf(pkg, history);
  }
  return { table: { versions, since }, tags };
}

const isMain = resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(process.cwd(), '..', '..');
  const { table, tags } = familyTable(root);
  if (tags === 0) {
    if (process.argv.includes('--require-tags')) {
      process.stderr.write('family-versions: no release tags in this checkout, so every subpath floor would be the current version. Fetch the tags (actions/checkout fetch-depth: 0, fetch-tags: true) before shipping.\n');
      process.exit(1);
    }
    process.stderr.write('family-versions: no release tags in this checkout; each subpath floor is the current version.\n');
  }
  mkdirSync('dist', { recursive: true });
  // Minified, as `strip-comments.mjs` leaves every shipped JSON file: `release.yml` runs this after it.
  writeFileSync(join('dist', 'family-versions.json'), JSON.stringify(table));
}
