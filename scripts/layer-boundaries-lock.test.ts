/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * No package does a job another package in the family exists to do.
 *
 * This is PRINCIPLES rule 14 — each package an independent product, SOLID for packages — as a
 * check rather than an intention. The family splits nine ways precisely so a program can adopt
 * one layer without the other eight; the moment `burgee` measures a string's width itself, or
 * reaches for `chalk` instead of `roundel`, that split stops being real and the layers become
 * a directory layout.
 *
 * **The concern table is not written here.** `compat-oracle/src/demand.ts` already says which
 * incumbents each layer replaces — `linegauge` replaces `string-width`, `closeout` replaces
 * `signal-exit`, and so on — and that list *is* the definition of each layer's job. Restating
 * it would be a second copy to keep in step, which is the failure this repository has now
 * watched four times.
 *
 * So the rule is derived: **a package may not depend on an incumbent another layer replaces.**
 * Needing that job is the same thing as needing the sibling.
 *
 * What this deliberately does NOT forbid: the drop-in façades reproducing their own
 * incumbent's behaviour. `burgee/commander` spawns child processes and forwards five signals
 * because commander's `executableSubcommand` does, and commander's own 1360-case suite grades
 * exactly that. Reproducing the incumbent is the compatibility claim; it is the reason the
 * package exists, not a lapse. The line this draws is about *dependencies* — reaching outside
 * the family for a job the family already does — because that is the part a checker can decide
 * without guessing.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Layer {
  pkg: string;
  incumbents: string[];
}

/** The nine layers and what each replaces, read from the file that already declares them. */
function layers(): Layer[] {
  const src = readFileSync(join(ROOT, 'packages/compat-oracle/src/demand.ts'), 'utf8');
  const body = /export const LAYERS: Layer\[\] = \[([\s\S]*?)\n\];/.exec(src)?.[1] ?? '';
  return [...body.matchAll(/pkg: '([^']+)'[^}]*incumbents: \[([^\]]*)\]/g)].map((m) => ({
    pkg: m[1] as string,
    incumbents: [...(m[2] as string).matchAll(/'([^']+)'/g)].map((i) => i[1] as string),
  }));
}

const manifest = (pkg: string): { dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; devDependencies?: Record<string, string> } =>
  JSON.parse(readFileSync(join(ROOT, 'packages', pkg, 'package.json'), 'utf8')) as Record<string, never>;

const declared = (pkg: string): string[] => {
  const m = manifest(pkg);
  return Object.keys({ ...m.dependencies, ...m.peerDependencies, ...m.devDependencies });
};

describe('no layer reaches past a sibling to the thing that sibling replaces', () => {
  it('reads the nine layers from the file that declares them', () => {
    const found = layers();
    expect(found, 'LAYERS moved or changed shape — this lock is reading nothing').toHaveLength(9);
    expect(new Set(found.flatMap((l) => l.incumbents)).size).toBe(25);
  });

  it.each(layers().map((l) => l.pkg))('%s depends on no incumbent another layer replaces', (pkg) => {
    const deps = declared(pkg);
    const strays = layers()
      .filter((other) => other.pkg !== pkg)
      .flatMap((other) => other.incumbents.filter((i) => deps.includes(i)).map((i) => `${i} — that is ${other.pkg}'s job`));
    expect(strays, `${pkg} should use the sibling, not the package the sibling replaces`).toEqual([]);
  });

  it.each(layers().map((l) => l.pkg))('%s does not depend on the incumbent it replaces either', (pkg) => {
    // Grading happens in `compat-oracle` against vendored suites, with the incumbents resolved
    // from the root manifest. A layer that carried its own incumbent as a dependency would ship
    // the thing it replaces to every consumer — the drop-in claim inverted.
    const own = layers().find((l) => l.pkg === pkg)?.incumbents ?? [];
    expect(own.filter((i) => declared(pkg).includes(i)), `${pkg} ships the package it exists to replace`).toEqual([]);
  });

  it('holds zero external runtime dependencies across the family', () => {
    // PRINCIPLES rule 2. Stated everywhere, and worth one assertion: the rule above is only
    // interesting while this one is true, since a package free to add any dependency can reach
    // a sibling's job under a different name.
    const withDeps = layers()
      .map((l) => ({ pkg: l.pkg, deps: Object.keys({ ...manifest(l.pkg).dependencies }).filter((d) => !layers().some((o) => o.pkg === d)) }))
      .filter((r) => r.deps.length > 0);
    expect(withDeps, 'a runtime dependency outside the family').toEqual([]);
  });
});
