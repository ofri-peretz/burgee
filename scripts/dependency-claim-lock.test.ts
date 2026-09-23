/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a README may not claim a dependency count its own manifest contradicts.
 *
 * Three claims were false on 2026-09-17, all of them on the front page of something:
 *
 *   - the root README said *"Eight packages … and zero runtime dependencies in every one of
 *     them"*. Nine packages, and three of them declare dependencies.
 *   - `burgee`'s badge read `runtime dependencies-0`. It declares **four**.
 *   - `flagstaff`'s badge read `dependencies-roundel`, *"One dependency: roundel"*. It
 *     declares **four** — `paratext` was adopted the day before and the badge did not move.
 *
 * None was ever a lie; each was true when written and none had a check. A dependency arrow
 * is exactly the kind of fact that changes in a `package.json` and is restated in prose
 * somewhere nobody re-reads — PRINCIPLES rule 2 is the repository's loudest claim, so its
 * README should not be the least checked thing about it.
 *
 * What this asserts is narrow on purpose: **a numeric claim must match the manifest.** It
 * does not police wording, and it says nothing about a package that makes no claim.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

/** Published packages only — `compat-oracle` is internal and ships to nobody. */
const published = (): string[] =>
  readdirSync(PACKAGES).filter((name) => {
    const manifest = join(PACKAGES, name, 'package.json');
    return existsSync(manifest) && (JSON.parse(readFileSync(manifest, 'utf8')) as { private?: boolean }).private !== true;
  });

const dependencies = (name: string): string[] =>
  Object.keys((JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }).dependencies ?? {});

/**
 * A shields.io badge that states a dependency count: `dependencies-0`, `runtime
 * dependencies-0`, `dependencies-4 in--family`. The number is what is checked; a badge that
 * names packages instead of counting them is read for its names.
 */
const COUNT_BADGE = /img\.shields\.io\/badge\/(?:runtime%20)?dependencies-(\d+)/g;

/** The same badge read for its alt text: `alt="Four dependencies, all in this repository"`. */
const ALT_COUNT = /alt="(Zero|One|Two|Three|Four|Five|Six|Seven|Eight|Nine)(?: runtime)? dependenc(?:y|ies)\b/gu;

/** A badge that names its dependencies rather than counting them: `dependencies-closeout`. */
const NAMED_BADGE = /img\.shields\.io\/badge\/dependencies-([a-z][a-z%20,·-]*?)-[\da-f]{6}/gu;

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

describe('a README may not claim a dependency count its manifest contradicts', () => {
  const names = published();

  it('has published packages to check', () => {
    expect(names).not.toHaveLength(0);
  });

  it.each(names)('%s', (name) => {
    const readme = join(PACKAGES, name, 'README.md');
    if (!existsSync(readme)) return;
    const claimed = [...readFileSync(readme, 'utf8').matchAll(COUNT_BADGE)].map((m) => Number(m[1]));
    const actual = dependencies(name);
    for (const n of claimed) {
      expect(n, `${name}'s README badge claims ${String(n)} dependenc${n === 1 ? 'y' : 'ies'} and its package.json declares ${String(actual.length)}${actual.length === 0 ? '' : `: ${actual.join(', ')}`}`).toBe(actual.length);
    }
  });

  /**
   * The badge's alt text is a claim too, and it is the one a screen reader reads. caique's
   * said *"One dependency: closeout"* over a manifest declaring two on 2026-09-22 — the
   * count badge above could not see it, because that badge names its package instead of
   * counting. So both are read: the alt text's number word, and the names in the badge.
   */
  it.each(names)('%s: the badge alt text and the names it lists match the manifest', (name) => {
    const readme = join(PACKAGES, name, 'README.md');
    if (!existsSync(readme)) return;
    const text = readFileSync(readme, 'utf8');
    const actual = dependencies(name);
    for (const [, word] of text.matchAll(ALT_COUNT)) {
      expect(WORDS.indexOf(word!), `${name}'s badge alt text says "${String(word)}" dependencies and its package.json declares ${String(actual.length)}`).toBe(actual.length);
    }
    for (const [, list] of text.matchAll(NAMED_BADGE)) {
      expect(decodeURIComponent(list!).split(/[\s,·]+/u).toSorted(), `${name}'s badge names its dependencies`).toEqual(actual.toSorted());
    }
  });

  /**
   * The npm description is the first sentence anyone reads, and it is restated nowhere a
   * reviewer looks. flagstaff's said *"Zero dependencies."* for a week after it took four.
   */
  it.each(names)('%s: a description that says "Zero dependencies" means it', (name) => {
    const { description = '' } = JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as { description?: string };
    if (!/\bzero dependencies\b/iu.test(description)) return;
    expect(dependencies(name), `${name}'s package.json description says "Zero dependencies"`).toEqual([]);
  });

  /**
   * The root README counts the packages and characterises them in one sentence. Both halves
   * were wrong at once, which is the argument for checking the number rather than the prose:
   * a count is unambiguous, and it was the count that gave the sentence away.
   */
  it('the root README counts the published packages correctly', () => {
    const COUNTS = [...WORDS, 'Ten', 'Eleven', 'Twelve'];
    const stated = /^\s*(\w+) packages, one repository/m.exec(readFileSync(join(ROOT, 'README.md'), 'utf8'))?.[1];
    expect(stated, 'the root README no longer opens with "<N> packages, one repository" — update this case with it').toBeDefined();
    expect(stated, `the root README says "${String(stated)} packages" and there are ${String(names.length)}`).toBe(COUNTS[names.length]);
  });
});
