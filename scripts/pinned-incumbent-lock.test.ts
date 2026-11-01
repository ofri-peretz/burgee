/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a benchmark incumbent pinned to an exact version is a version dependabot may not bump.
 *
 * `benchmarks/package.json` pins each B4 incumbent to the **exact release compat-oracle
 * grades**, because a weight ratio only means something if the thing we weigh against is the
 * release whose own suite we pass. `slice-ansi` is `7.1.2` there and `9.0.0` on npm for
 * precisely that reason.
 *
 * `.github/dependabot.yml` already carried an ignore list for the hosts and their suite
 * dependencies, with the rule written at the top of it: *"The hosts and their suite
 * dependencies move only through the re-vendor flow, never through a version bump here."*
 * #339 then added five more exact pins and did not add them to that list, and dependabot's
 * next grouped PR (#333) duly proposed `slice-ansi` 7.1.2 → 9.0.0 — which would have
 * re-pointed the comparison at a version the oracle does not grade, and moved a published
 * ratio for a reason nobody decided.
 *
 * The rule was prose in a comment. This is the rule.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, never by name: a bare `compat-oracle/*` resolves from another checkout's dist/ in an uninstalled worktree (compat-oracle R6)
import { HOSTS, PREVIOUS_MAJORS } from '../packages/compat-oracle/src/hosts.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** An exact pin: a bare version, no `^`, `~`, range or tag. */
const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** Every exact pin in the benchmark workspace's dependencies, production and dev alike. */
function exactPins(): string[] {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'benchmarks/package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  return Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })
    .filter(([, range]) => EXACT.test(range))
    .map(([name]) => name)
    .sort();
}

/** The names `.github/dependabot.yml` tells dependabot to leave alone. */
const ignored = (): Set<string> =>
  new Set([...readFileSync(join(ROOT, '.github/dependabot.yml'), 'utf8').matchAll(/^\s*- dependency-name: "([^"]+)"/gm)].map((m) => m[1] as string));

describe('every exactly-pinned benchmark incumbent is ignored by dependabot', () => {
  const pins = exactPins();

  it('finds pins at all — otherwise the case below asserts nothing', () => {
    expect(pins, 'benchmarks/package.json has no exact pins; either they were all loosened or this lock is looking in the wrong place').not.toHaveLength(0);
  });

  it('names each of them in dependabot.yml', () => {
    const missing = pins.filter((name) => !ignored().has(name));
    expect(
      missing,
      'these are pinned to the exact release compat-oracle grades and dependabot is free to bump them — add a `- dependency-name:` entry, or stop pinning them exactly',
    ).toEqual([]);
  });
});

/**
 * The `name@version` specs every host in compat-oracle's `hosts.ts` installs for its suite, by
 * name, and the release each row that pins its own incumbent (`pinnedVersion`) is vendored and
 * controlled at. The specs are read as text; the pins from the source module, so no build of
 * compat-oracle is needed either way.
 *
 * The pins were missing until 2026-11-01. slice-ansi's row grades the root install at its
 * `pinnedVersion` and declares no `slice-ansi@…` spec, so this lock only ever saw the 9.0.1 that
 * ink's suite happens to install — and at slice-ansi 10.0.0 it read the benchmark as weighing a
 * release nobody grades, when the slice-ansi row grades exactly that one (burgee#1392).
 */
function gradedVersions(): Map<string, Set<string>> {
  const src = readFileSync(join(ROOT, 'packages/compat-oracle/src/hosts.ts'), 'utf8');
  const out = new Map<string, Set<string>>();
  const add = (name: string, version: string): void => {
    out.set(name, (out.get(name) ?? new Set()).add(version));
  };
  for (const list of src.matchAll(/suiteDeps:\s*\[([^\]]*)\]/g)) {
    for (const [, name, version] of (list[1] ?? '').matchAll(/'((?:@[^@'/]+\/)?[^@']+)@([^']+)'/g)) add(name as string, version as string);
  }
  for (const host of [...HOSTS, ...PREVIOUS_MAJORS]) if (host.pinnedVersion !== undefined) add(host.npmName ?? host.name, host.pinnedVersion);
  return out;
}

/**
 * A pin is there so B4 weighs the release compat-oracle grades. The re-vendor of #1138 moved
 * dotenv to 18.0.8 and lilconfig to 3.1.4 and left the benchmark on 18.0.7 and 3.1.3, so
 * `seniority/dotenv` and `seniority/lilconfig` were graded against one release and weighed
 * against another, and nothing said so.
 */
describe('every exact pin an oracle suite also installs is a release that suite grades', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'benchmarks/package.json'), 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const pinned = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([, range]) => EXACT.test(range));
  const graded = gradedVersions();

  it('reads the oracle, so a broken reader cannot pass this', () => {
    expect(graded.get('dotenv')?.size ?? 0, 'no suiteDeps entry for dotenv was read out of hosts.ts').toBeGreaterThan(0);
    expect(graded.get('slice-ansi')?.has(HOSTS.find((h) => h.name === 'slice-ansi')?.pinnedVersion ?? ''), "slice-ansi's own pinnedVersion was not read").toBe(true);
  });

  it('pins each to a version the oracle grades', () => {
    const behind = pinned
      .filter(([name]) => graded.has(name))
      .filter(([name, version]) => !(graded.get(name)?.has(version) ?? false))
      .map(([name, version]) => `${name} ${version}, graded at ${[...(graded.get(name) ?? [])].join(' or ')}`);
    expect(behind, 'benchmarks/package.json weighs a release compat-oracle no longer grades: bump the pin and re-measure the pair').toEqual([]);
  });
});
