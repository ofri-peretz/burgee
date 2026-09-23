/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a README's install example resolves to the package it is about.
 *
 * linegauge's README told readers to override `string-width` with `npm:linegauge@^0.2` while
 * the package was at 0.4: a reader who copied it got a version two minors old, missing every
 * fix since. `sync-doc-versions` keeps exact `name@x.y.z` honest; a caret range inside an
 * `npm:` alias is a different shape and nothing read it.
 *
 * What this asserts is narrow: every `npm:<workspace package>@<range>` in a published
 * package's README must be satisfied by that package's current version.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6, scripts/oracle-import-lock.test.ts)
import { satisfies } from '../packages/compat-oracle/src/semver.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

const manifest = (dir: string): { name: string; version: string; private?: boolean } | null => {
  const path = join(PACKAGES, dir, 'package.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { name: string; version: string; private?: boolean }) : null;
};

const versions = new Map(
  readdirSync(PACKAGES)
    .map(manifest)
    .filter((m) => m !== null)
    .map((m) => [m.name, m.version] as const),
);

const ALIAS = /npm:([a-z][a-z-]*)@([~^]?[\d.x*]+)/gu;

describe('a README install example resolves to the current package', () => {
  const published = readdirSync(PACKAGES).filter((dir) => manifest(dir)?.private === false || manifest(dir)?.private === undefined);

  it('has READMEs to read', () => {
    expect(published.length).toBeGreaterThan(0);
  });

  it.each(published)('%s', (dir) => {
    const readme = join(PACKAGES, dir, 'README.md');
    if (!existsSync(readme)) return;
    for (const [, name, range] of readFileSync(readme, 'utf8').matchAll(ALIAS)) {
      const current = versions.get(name!);
      if (current === undefined) continue;
      expect(satisfies(current, range!), `packages/${dir}/README.md says npm:${String(name)}@${String(range)}, and ${String(name)} is ${current}`).toBe(true);
    }
  });
});
