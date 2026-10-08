#!/usr/bin/env node
/**
 * Write `dist/family-versions.json` for burgee: every published package in this repository at
 * the version its own `package.json` declares. Run from `packages/burgee`, after tsc.
 *
 * `burgee migrate` prints the install command a migration needs, and since U12-2
 * (D-20261008-migrate-u12-findings) it pins each family package to the version that carries the
 * drop-in it graded: `roundel@^1.0.0`, not a bare `roundel` a package manager may resolve to
 * 0.6.2. Those versions are the manifests beside burgee's own in this repository, and the
 * published package has no such directory, so the build copies them here. Read at build time
 * and never typed, so a release that bumps a package moves the pin with it.
 *
 * Turbo cannot serve a stale copy from its cache: `package-lock.json` is a global dependency
 * (`turbo.json`) and records every workspace package's version, so a bump re-runs this build.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const packages = join(process.cwd(), '..');
const versions = {};
for (const entry of readdirSync(packages, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(packages, entry.name, 'package.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') continue;
    throw error;
  }
  if (manifest.private !== true) versions[manifest.name] = manifest.version;
}
mkdirSync('dist', { recursive: true });
writeFileSync(join('dist', 'family-versions.json'), `${JSON.stringify(versions, null, 2)}\n`);
