#!/usr/bin/env node
/**
 * sync-platform-versions.mjs — keeps oxmutate and its six platform packages (`npm/*`) on one version.
 *
 * The platform packages are not npm workspaces, so changesets never versions them. Every one
 * carries oxmutate's version, and the oxmutate that reaches npm lists exactly them, at exactly
 * that version, as `optionalDependencies` (the napi-rs / oxc layout: npm installs the one whose
 * `os`/`cpu`/`libc` match, and nothing runs at install time).
 *
 *   node scripts/sync-platform-versions.mjs            # write npm/*\/package.json versions = oxmutate's
 *   node scripts/sync-platform-versions.mjs --check    # exit 1, naming each one out of step; writes nothing
 *   node scripts/sync-platform-versions.mjs --publish  # release job only: refuse a version out of step,
 *                                                      # then write oxmutate's optionalDependencies
 *                                                      # (the public platform packages; none while private)
 *
 * `--publish` is never committed. A committed `optionalDependencies` naming a package npm does not
 * serve yet cannot be recorded in package-lock.json, and `npm ci` then refuses the whole tree
 * ("Missing: oxmutate-darwin-arm64@ from lock file", EUSAGE; measured with npm 11 on 2026-10-27).
 * The monorepo never needs them: development loads `binding/` (see `src/native.ts`).
 *
 * `--root DIR` points at another copy of packages/oxmutate (the lock test's fixtures).
 * Plain Node, builtins only: the publish job has no node_modules.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
// Two-space JSON and a trailing newline: what npm and prettier both write.
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

/** `write` (the default), `check` or `publish`. */
function modeOf(args) {
  if (args.includes('--publish')) return 'publish';
  if (args.includes('--check')) return 'check';
  return 'write';
}

/** Every `npm/<dir>/package.json` under `root`, in directory order. */
function readPlatforms(root) {
  const npm = path.join(root, 'npm');
  return readdirSync(npm)
    .toSorted()
    .map((dir) => ({ dir, file: path.join(npm, dir, 'package.json') }))
    .filter(({ file }) => existsSync(file))
    .map(({ dir, file }) => ({ dir, file, manifest: read(file) }));
}

/** Moves each stale platform package to the parent's version. */
function writeVersions(parent, platforms, stale) {
  for (const p of stale) {
    p.manifest.version = parent.version;
    write(p.file, p.manifest);
    console.log(`npm/${p.dir}: ${p.manifest.name} → ${parent.version}`);
  }
  if (stale.length === 0) console.log(`${platforms.length} platform packages already at ${parent.version}`);
  return 0;
}

/**
 * Writes the published manifest's optionalDependencies: exactly the public platform packages, at
 * the parent's version. A private one is not on npm, so naming it would leave every install
 * resolving nothing for that platform; its core ships in the parent's `binding/` instead, and with
 * all six private (0.1) the manifest is left as it is.
 */
function writeOptional(parentFile, parent, platforms) {
  const published = platforms.filter(({ manifest }) => manifest.private !== true);
  if (published.length === 0) {
    console.log(`${parent.name}@${parent.version}: the ${platforms.length} platform packages are private, so no optionalDependencies; the cores ship in binding/`);
    return 0;
  }
  delete parent['//optionalDependencies'];
  parent.optionalDependencies = Object.fromEntries(published.map(({ manifest }) => [manifest.name, parent.version]));
  write(parentFile, parent);
  console.log(`${parent.name}@${parent.version} lists ${published.length} platform packages as optionalDependencies: ${Object.keys(parent.optionalDependencies).join(', ')}`);
  return 0;
}

function main(args) {
  const at = args.indexOf('--root');
  const root = at === -1 ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..') : path.resolve(args[at + 1] ?? '.');
  const mode = modeOf(args);
  const parentFile = path.join(root, 'package.json');
  const parent = read(parentFile);
  const platforms = readPlatforms(root);
  if (platforms.length === 0) {
    console.error(`sync-platform-versions: no platform package under ${path.join(root, 'npm')}`);
    return 1;
  }
  const stale = platforms.filter(({ manifest }) => manifest.version !== parent.version);
  if (mode === 'write') return writeVersions(parent, platforms, stale);
  if (stale.length > 0) {
    for (const p of stale)
      console.error(
        `::error::npm/${p.dir}/package.json is ${p.manifest.name}@${p.manifest.version}, but ${parent.name} is ${parent.version}. Run node packages/oxmutate/scripts/sync-platform-versions.mjs and commit.`,
      );
    return 1;
  }
  if (mode === 'publish') return writeOptional(parentFile, parent, platforms);
  console.log(`${platforms.length} platform packages at ${parent.version}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
