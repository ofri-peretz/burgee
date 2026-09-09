import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Workspace lock — the roadmap may not print a version that is not true.
 *
 * On 2026-09-09 `.sdlc/intents/README.md` said `roundel`, `flagstaff` and `caique` were
 * `0.0.1` on npm, in five places, hours after all three published `0.1.0` from CI. It also
 * carried an owner task to fix a publish credential that had already been fixed. Nothing
 * caught it, because a version in prose is a fact about the outside world and the repo had
 * no check that pointed outward.
 *
 * This lock is the offline half, and it works by making the claim machine-readable rather
 * than by reaching the network: **a version claim is written `pkg@X.Y.Z`**, and every one
 * of those for a workspace package is compared to that package's own `package.json`. A bare
 * semver on a line that names a workspace package is rejected with the same message, so the
 * form cannot be dodged by writing "0.0.1 on npm" instead.
 *
 * What it deliberately does not do: check npm or fetch a URL. A unit test that needs the
 * network fails on a plane and gets skipped, and a skipped lock is worse than none.
 * `scripts/refresh-facts.ts` is the online half; it rewrites the dated snapshot this test's
 * sibling band watches.
 */

import { describe, it, expect } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The documents that make claims a reader will act on. */
const DOCS = ['README.md', '.sdlc/intents/README.md'];

/** Workspace package name → the version its own manifest declares. */
function workspaceVersions(): Map<string, string> {
  const out = new Map<string, string>();
  const dir = join(REPO_ROOT, 'packages');
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const manifest = join(dir, e.name, 'package.json');
    if (!existsSync(manifest)) continue;
    const { name, version, private: isPrivate } = JSON.parse(readFileSync(manifest, 'utf-8'));
    if (name && version && !isPrivate) out.set(name, version);
  }
  return out;
}

const SEMVER = String.raw`\d+\.\d+\.\d+`;

/**
 * TS 5.9's lib does not type `Intl.DurationFormat`; Node 24 ships it. Narrow local type
 * rather than a global augmentation — one lock should not change the repo's ambient types.
 */
type DurationFormat = new (
  locale: string,
  options: { style: string },
) => { format(parts: { hours?: number; minutes?: number }): string };

describe('roadmap facts', () => {
  const versions = workspaceVersions();

  it('reads at least one publishable workspace package', () => {
    expect(versions.size).toBeGreaterThan(0);
  });

  it.each(DOCS)('%s prints no version that disagrees with its package', (doc) => {
    const text = readFileSync(join(REPO_ROOT, doc), 'utf-8');
    const wrong: string[] = [];

    for (const [name, version] of versions) {
      const claims = text.matchAll(new RegExp(String.raw`${name}@(${SEMVER})`, 'g'));
      for (const [, claimed] of claims) {
        if (claimed !== version) wrong.push(`${doc}: says ${name}@${claimed}, manifest says ${version}`);
      }
    }

    expect(
      wrong,
      'a version in prose is a fact about the outside world; update the doc or the package',
    ).toEqual([]);
  });

  it.each(DOCS)('%s writes every version claim as `pkg@X.Y.Z`, so it can be checked', (doc) => {
    const text = readFileSync(join(REPO_ROOT, doc), 'utf-8');
    const names = [...versions.keys()];
    const loose: string[] = [];

    text.split('\n').forEach((line, i) => {
      const named = names.filter((n) => line.includes(`\`${n}\``) || line.includes(`\`${n}@`));
      if (named.length === 0) return;
      // Strip the checkable form, then see whether a bare version survives.
      const rest = line.replace(new RegExp(String.raw`[a-z-]+@${SEMVER}`, 'g'), '');
      const bare = rest.match(new RegExp(SEMVER, 'g'));
      if (bare) loose.push(`${doc}:${i + 1} names ${named.join(', ')} beside a bare ${bare[0]}`);
    });

    expect(
      loose,
      'write it as `pkg@X.Y.Z` — a bare version next to a package name reads as a claim ' +
        'and cannot be checked, which is how five stale ones survived on 2026-09-09',
    ).toEqual([]);
  });

  /**
   * A Y4 verdict is a claim about the platform, and a platform moves.
   *
   * Until 2026-09-09 the roadmap's "layers considered" table said human formatting had
   * *no builtin substitutes*. Node 24 formats both a byte count and a duration on its own,
   * so the row was wrong in the expensive direction: it kept a ninth package alive as a
   * maybe. A verdict resting on a builtin has to be executed, not remembered — and this
   * fails the day a runtime upgrade takes either one away, which is exactly when the row
   * would have to be rewritten in the other direction.
   */
  it('the platform still substitutes for the human-formatting layer (Y4)', () => {
    const bytes = new Intl.NumberFormat('en', {
      style: 'unit',
      unit: 'megabyte',
      maximumFractionDigits: 1,
    }).format(1.5);
    expect(bytes, 'Intl no longer substitutes for pretty-bytes').toBe('1.5 MB');

    const { DurationFormat } = Intl as unknown as { DurationFormat: DurationFormat };
    const duration = new DurationFormat('en', { style: 'narrow' }).format({
      hours: 2,
      minutes: 5,
    });
    expect(duration, 'Intl no longer substitutes for pretty-ms').toBe('2h 5m');
  });
});
