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

/**
 * An absolute "no dependencies" claim: `zero dependencies`, `0 runtime dependencies`, `no
 * external dependencies`, `zero-dependency`, and a table row `Runtime dependencies | **0**`.
 * Followed by *outside*, *beyond* or *except* it is qualified, not absolute — that is the
 * sentence a package with in-family dependencies should use. A "zero-dependency rival" or
 * "incumbent" describes somebody else's package, not this one.
 */
const ABSOLUTE = [
  /\b(?:zero|0|no)\s+(?:runtime\s+|external\s+|production\s+)?dependencies\b(?!\s+(?:outside|beyond|except))/giu,
  /\bzero[-\s]dep(?:endency|s)?\b(?!\s+(?:outside|beyond|except|rival|incumbent))/giu,
  /\|\s*runtime dependencies\s*\|\s*\**0\**\s*\|/giu,
];

/** Every absolute claim in `text`, whitespace collapsed. */
const absoluteClaims = (text: string): string[] => ABSOLUTE.flatMap((re) => [...text.matchAll(re)].map((m) => m[0].replaceAll(/\s+/gu, ' ')));

interface Surface {
  file: string;
  text: string;
}

/** Markdown and MDX pages under `dir`, recursively. */
const pages = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.mdx?$/u.test(f)).map((f) => join(dir, f)) : [];

/** The docs app a package owns, from `.github/vercel-apps.json`. */
const docsDir = (name: string): string | undefined => {
  const table = JSON.parse(readFileSync(join(ROOT, '.github', 'vercel-apps.json'), 'utf8')) as { apps: Record<string, { package?: string; dir?: string }> };
  return Object.values(table.apps).find((a) => a.package === name)?.dir;
};

/** Everything published about `name`: its README, its description, its docs site — and, for burgee, the root README. */
const surfaces = (name: string): Surface[] => {
  const read = (file: string): Surface[] => (existsSync(join(ROOT, file)) ? [{ file, text: readFileSync(join(ROOT, file), 'utf8') }] : []);
  const { description = '' } = JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as { description?: string };
  const site = docsDir(name);
  return [
    ...read(`packages/${name}/README.md`),
    ...(name === 'burgee' ? read('README.md') : []),
    { file: `packages/${name}/package.json#description`, text: description },
    ...(site ? pages(join(ROOT, site, 'content')).flatMap((f) => read(f.slice(ROOT.length + 1))) : []),
  ];
};

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
   * Prose is a claim too, and the count badges above cannot read it. On 2026-09-23 the root
   * README said burgee had **0** runtime dependencies in its Measured table, called its first
   * CLI "zero dependencies" and every package "zero-dependency" — over a manifest declaring
   * five, all in the family. The honest sentence is "no dependency outside the burgee
   * family", and that is the one wording this lets through for a package that declares any.
   *
   * Read: every published README (the root one speaks for `burgee`, whose manifest its badge
   * links), every package.json description, and every page of the package's docs site.
   */
  it.each(names)('%s: no README, description or docs page says "zero/no runtime dependencies" over a manifest that declares one', (name) => {
    const actual = dependencies(name);
    if (actual.length === 0) return;
    const found = surfaces(name).flatMap(({ file, text }) => absoluteClaims(text).map((claim) => `${file}: "${claim}"`));
    expect(found, `${name} declares ${String(actual.length)} dependenc${actual.length === 1 ? 'y' : 'ies'} (${actual.join(', ')}) — say "no dependency outside the burgee family" instead`).toEqual([]);
  });

  it('reads a claim in every shape it has taken, and lets the precise one through', () => {
    expect(absoluteClaims('| Runtime dependencies | **0** | 0 | 6 |')).toHaveLength(1);
    expect(absoluteClaims('One file, zero dependencies, help for free')).toHaveLength(1);
    expect(absoluteClaims('every one is\nzero-dependency.')).toHaveLength(1);
    expect(absoluteClaims('with zero runtime dependencies where yargs has six')).toHaveLength(1);
    expect(absoluteClaims('It has 0 runtime dependencies.')).toHaveLength(1);
    expect(absoluteClaims('No runtime dependencies at all.')).toHaveLength(1);
    expect(absoluteClaims('No dependency outside the burgee family.')).toEqual([]);
    expect(absoluteClaims('zero runtime dependencies beyond commander')).toEqual([]);
    expect(absoluteClaims('twenty lines and no dependency.')).toEqual([]);
    expect(absoluteClaims('because a zero-dependency\nrival already holds the weight pitch')).toEqual([]);
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
