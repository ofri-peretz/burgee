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
