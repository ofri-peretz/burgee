/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — a front page says what burgee does before it says what burgee replaces.
 *
 * `.sdlc/intents/positioning/` R1, R2 and R6. On 2026-10-09 the root README and the docs
 * landing both opened, straight after the tagline, with "a CLI framework that replaces
 * commander and yargs": the first thing a reader or a model learned was a rival's name. Six of
 * twelve front pages named an incumbent in their first paragraph
 * (`.sdlc/research/positioning-audit.md`).
 *
 * What this holds:
 *
 *   - **the first paragraph after the hero names no incumbent.** The hero is the lockup, the
 *     tagline and the chrome under it (badges, the docs line, the nav row), or an `.mdx` page's
 *     front matter. The paragraph and the incumbents come from `positioning-audit.ts`, so the
 *     lock and the audit cannot disagree about either. The incumbents are `compat.ts`'s `GRADED`
 *     and `DROP_INS`, the table `burgee migrate` acts on, so a newly graded drop-in is covered
 *     the day it is graded.
 *   - **the switch is still one command away (R6):** `npx burgee migrate` is on every page
 *     here.
 *   - **the root README's grades are `compat.ts`'s.** The hero quotes commander's and yargs'
 *     grades and the number of other graded hosts. Each is rebuilt from `GRADED` here, so a
 *     grade that moves without the prose moving fails.
 *
 * The package READMEs joined `PAGES` with R4, in the PR that rewrote their openings: a lock that
 * landed red over pages a later PR fixes would block every PR in between.
 *
 * Proven red on `fc0f897104`, the tree the intent was opened against: the root README and the
 * docs landing named `commander, yargs`; caique `clack, inquirer`; closeout `exit-hook,
 * restore-cursor, signal-exit`; controlroom `ink`; flagstaff `ink, ora`; roundel `chalk`.
 *
 * R7–R11 (the owner's neutral-voice follow-up, 2026-10-09) are held in the second half of this
 * file: the npm descriptions' three-sentence shape, no self-ranking words in a description or a
 * front-page heading, no `Replaces` column and one family section across the ten READMEs, no
 * roadmap section in a 1.x README, and a capability section before the migration. Proven red on
 * `e992fc7619`: 27 failures, every description among them.
 *
 * R13 (the owner's decision on titles, 2026-10-10) is the last section: every docs site's home
 * `<title>` says what the package does, each home page's meta description names the incumbents
 * in its last sentence only, and the front door's llms.txt package map leads each row with the
 * description rather than "— replaces X.". Read from `homeMetadata` and `llmsIndex`, the code the
 * sites render. Proven red on `d68f63a68d`: all ten titles and the package map, 11 failures.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type Metadata } from 'next';
import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path: the docs chassis is a private workspace under apps/, and R13 reads the code the sites render, not a copy of its output
import { APPS, type App, PENDING, type PendingApp } from '../apps/docs-chassis/src/config';
// eslint-disable-next-line import-next/no-relative-packages -- by path, as above: the llms.txt projection every site serves
import { llmsIndex } from '../apps/docs-chassis/src/llms';
// eslint-disable-next-line import-next/no-relative-packages -- by path, as above: the metadata every home page exports
import { homeMetadata } from '../apps/docs-chassis/src/package-home';
// eslint-disable-next-line import-next/no-relative-packages -- by path, as above: the package map the front door's llms.txt prints
import { publicPackages, type PublicPackage } from '../apps/docs-chassis/src/packages';
// eslint-disable-next-line import-next/no-relative-packages -- by path, as above: the site each app resolves from its row
import { defineSite, type Manifest, type Site } from '../apps/docs-chassis/src/site';
// eslint-disable-next-line import-next/no-relative-packages -- by path: the front door's meta description, `SUMMARY`, is not an export of a private app
import { SUMMARY } from '../apps/docs/src/lib/site';
// eslint-disable-next-line import-next/no-relative-packages -- by path, for the same reason as migrate-drop-ins-lock.test.ts: `compat.ts` is not an export
import { DROP_INS, GRADED } from '../packages/burgee/src/compat.js';

import { body, DOCS_LANDING, firstParagraph, incumbents, named, packageReadmes } from './positioning-audit.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (page: string): string => readFileSync(join(ROOT, page), 'utf8');

/** The pages R1 holds: the root README, every published package README (R4), the docs landing. */
export const PAGES = ['README.md', ...packageReadmes(), DOCS_LANDING];

/** What is wrong with one page's opening, or nothing. */
export function problems(page: string, text: string): string[] {
  const first = firstParagraph(text);
  if (first === undefined) return [`${page}: no paragraph after the hero — the reader found nothing to check, so this page is unchecked`];
  const names = named(first);
  return names.length === 0 ? [] : [`${page}: the first paragraph after the hero names ${names.join(', ')} — say what it does first, and move the incumbent to the switch section: "${first.slice(0, 160)}…"`];
}

describe('no front page opens on an incumbent', () => {
  it('reads its incumbents from compat.ts, not from a list of its own', () => {
    const all = incumbents();
    for (const host of Object.keys(GRADED)) expect(all, `GRADED's ${host}`).toContain(host);
    for (const { from } of DROP_INS) expect(all.some((name) => from === name || from.startsWith(`${name}/`)), `DROP_INS' ${from}`).toBe(true);
    expect(all).toEqual(expect.arrayContaining(['commander', 'yargs', 'chalk', 'ink', '@clack/prompts', 'clack', 'inquirer']));
  });

  it('holds every published package README', () => {
    expect(PAGES.filter((page) => page.startsWith('packages/')).length, 'the ten packages, minus any without a README').toBeGreaterThanOrEqual(10);
  });

  it.each(PAGES)('%s', (page) => {
    expect(problems(page, read(page))).toEqual([]);
  });
});

describe('the switch stays one command (R6)', () => {
  it.each(PAGES)('%s names `npx burgee migrate`', (page) => {
    expect(read(page)).toContain('npx burgee migrate');
  });

  it('the root README has the section the nav row links', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/^## 🔁 Switch in one command$/mu);
    expect(readme).toContain('href="#-switch-in-one-command"');
  });
});

/** A host's grade as the README's prose writes it: `1360 of 1360`. */
const grade = (host: string): string => `${String(GRADED[host]!.passed)} of ${String(GRADED[host]!.reference)}`;

describe("the root README's grades are compat.ts's", () => {
  const readme = read('README.md');

  it.each(['commander', 'yargs'])("quotes %s's grade as compat.ts holds it", (host) => {
    expect(readme, `the README should say "${host}'s ${grade(host)}" or "${host}' ${grade(host)}"`).toMatch(new RegExp(String.raw`${host}'s? ${grade(host)}`, 'u'));
  });

  it('counts the other graded hosts as compat.ts does', () => {
    const others = Object.keys(GRADED).length - 2;
    expect(readme).toContain(`${String(others)} more hosts`);
  });
});

describe('the lock can fail', () => {
  it('fails the opening it was written against', () => {
    const before = [
      '<p align="center">',
      '  Everything a CLI needs that isn\'t your CLI. Written once, served to humans and agents alike.',
      '</p>',
      '',
      '<p align="center">',
      '  <a href="https://www.npmjs.com/package/burgee"><img src="https://img.shields.io/npm/v/burgee" alt="npm version" /></a>',
      '</p>',
      '',
      '<p align="center">',
      '  A <strong>CLI framework that replaces commander and yargs</strong>, is drop-in compatible with both, and',
      '  serves every command through every format a caller wants.',
      '</p>',
    ].join('\n');
    expect(problems('README.md', before)).toEqual([expect.stringMatching(/names commander, yargs/u)]);
  });

  it('skips the lockup, the tagline, the badges and the docs line, and stops at the first paragraph', () => {
    const page = [
      '<p align="center">',
      '  <a href="x"><picture><img src="lockup.svg" alt="pkg" /></picture></a>',
      '</p>',
      '',
      '<p align="center">',
      '  The tagline, which is prose.',
      '</p>',
      '',
      '<p align="center">',
      '  <a href="x"><img src="badge" alt="npm version" /></a>',
      '</p>',
      '',
      '<p align="center">',
      '  Docs: <a href="https://x.dev">https://x.dev</a><br />',
      '  Migrating from: <a href="https://x.dev/a">chalk</a> · <a href="https://x.dev/b">ora</a>',
      '</p>',
      '',
      'The opening paragraph, which says what the package does.',
      '',
      'Drop-in for chalk: `npx burgee migrate`.',
    ].join('\n');
    expect(firstParagraph(page)).toBe('The opening paragraph, which says what the package does.');
    expect(problems('pkg', page)).toEqual([]);
  });

  it("treats an .mdx page's front matter as its hero", () => {
    const mdx = ['---', 'title: Overview', 'description: "replaces commander"', '---', '', '**burgee** is a CLI framework that replaces commander.'].join('\n');
    expect(problems(DOCS_LANDING, mdx)).toEqual([expect.stringMatching(/names commander/u)]);
  });

  it('reads `which` as a package only when it is code', () => {
    expect(named('A command which runs.')).toEqual([]);
    expect(named('Resolves a binary like `which` does.')).toEqual(['which']);
  });

  it('catches an incumbent written into the opening of the README as it stands', () => {
    const readme = read('README.md');
    const rest = body(readme);
    const [head = '', ...tail] = rest.split('\n');
    const injected = head.startsWith('<p') ? [head, '  A chalk replacement, first.', ...tail] : [`A chalk replacement, first. ${head}`, ...tail];
    const tampered = readme.replace(rest, injected.join('\n'));
    expect(tampered, 'the edit did not apply, so this proves nothing').not.toBe(readme);
    expect(problems('README.md', tampered)).toEqual([expect.stringMatching(/names chalk/u)]);
  });

  it('fails a page with no paragraph after the hero, rather than passing it', () => {
    expect(problems('empty', '<p align="center">\n  Only a tagline here.\n</p>\n\n## Install\n')).toEqual([expect.stringMatching(/no paragraph after the hero/u)]);
  });
});

// ── R7–R11: a neutral voice (requested by the owner, 2026-10-09) ──────────────────────────────
//
// The openings were fixed by R1–R6, and the rest of the voice was not: six npm descriptions led
// with the name's etymology, burgee's led with "drop-in compatible with commander and yargs",
// roundel's promised "a chalk migration path lighter than chalk", the dependency fact was worded
// three ways, the family table's column was headed `Replaces`, and the root README had a
// section titled "A better commander". What follows holds the shape that replaced them.

interface Described {
  name: string;
  version: string;
  description: string;
  dependencies: string[];
}

/** Every published package's manifest, as the npm registry shows it. */
const described = (): Described[] =>
  packageReadmes().map((readme) => {
    const name = readme.split('/')[1]!;
    const m = JSON.parse(read(`packages/${name}/package.json`)) as { version: string; description?: string; dependencies?: Record<string, string> };
    return { name, version: m.version, description: m.description ?? '', dependencies: Object.keys(m.dependencies ?? {}) };
  });

/** A description's sentences. A full stop inside a word (`util.styleText`, `Intl.Segmenter`) does not end one. */
export const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+(?=[A-Z@`])/u).filter((s) => s !== '');

/** The one dependency wording a package with none uses, and the one a package with in-family dependencies uses. */
export const NO_DEPENDENCIES = 'Zero dependencies.';
export const IN_FAMILY_ONLY = /^No dependency outside the burgee family[.;]/u;

/** The migration clause, last, in the form `readme-opening-lock` and the docs' package map read. */
const MIGRATION = /^Drop-in paths? for (.+)\.$/u;

/** Self-ranking words, which no measurement on a front page or in a description backs as written. */
const COMPARATIVE = /\b(?:a better|better than|lighter than|faster than|smaller than|superior|best-in-class|the alternatives do not)\b/iu;

/** The drop-ins `burgee migrate` moves to `pkg`, by the specifier a program imports today. */
const dropInsOf = (pkg: string): string[] => DROP_INS.filter(({ to }) => to.split('/')[0] === pkg).map(({ from }) => from);

/**
 * What is wrong with one npm description (R7): it is three sentences — what the package does, the
 * dependency fact, the migration clause — in that order. The first names no incumbent, the
 * second is one of two wordings and true of the manifest, and the third lists only drop-ins
 * `compat.ts` holds for this package. No sentence ranks the package against another (R8).
 */
export function descriptionProblems({ name, description, dependencies }: Described, dropIns: readonly string[] = dropInsOf(name)): string[] {
  const parts = sentences(description);
  const [first = '', dependency = '', migration = ''] = parts.length === 3 ? parts : [parts[0] ?? '', parts.at(-2) ?? '', parts.at(-1) ?? ''];
  const names = named(first);
  const ranked = COMPARATIVE.exec(description);
  return [
    ...(parts.length === 3 ? [] : [`${name}: the description is ${String(parts.length)} sentence(s); it should be three — what it does, the dependency fact, the migration clause — and nothing before the first (an etymology lead is a fourth): "${description}"`]),
    ...(names.length === 0 ? [] : [`${name}: the description's first sentence names ${names.join(', ')} — say what it does first; the incumbents belong in the last sentence`]),
    ...dependencyProblems(name, dependency, dependencies),
    ...migrationProblems(name, migration, dropIns),
    ...(ranked === null ? [] : [`${name}: the description says "${ranked[0]}" — state what it does and let the measurements compare`]),
  ];
}

/** The dependency sentence: one of two wordings, and the one the manifest makes true. */
function dependencyProblems(name: string, dependency: string, dependencies: readonly string[]): string[] {
  const none = dependencies.length === 0;
  if (none ? dependency === NO_DEPENDENCIES : IN_FAMILY_ONLY.test(dependency)) return [];
  const expected = none ? NO_DEPENDENCIES : 'No dependency outside the burgee family.';
  return [`${name}: the dependency sentence is "${dependency}" — with ${String(dependencies.length)} dependenc${dependencies.length === 1 ? 'y' : 'ies'} it should read "${expected}"`];
}

/** The migration clause: last, in the one form, listing only drop-ins compat.ts holds for this package. */
function migrationProblems(name: string, migration: string, dropIns: readonly string[]): string[] {
  const listed = MIGRATION.exec(migration)?.[1];
  if (listed === undefined) return [`${name}: the description should end with "Drop-in paths for X, Y and Z." — it ends "${migration}"`];
  const unknown = listed.split(/,\s*|\s+and\s+/u).filter((item) => !dropIns.includes(item));
  return unknown.length === 0 ? [] : [`${name}: the description lists ${unknown.join(', ')} as drop-in paths, and compat.ts's DROP_INS has none for ${name}`];
}

/** Every heading line, and an `.mdx` page's `title:`. */
const headings = (text: string): string[] => text.split('\n').filter((line) => /^#{1,6} |^title: /u.test(line));

/** What is wrong with one page's headings (R8): none ranks the package against another. */
export function headingProblems(page: string, text: string): string[] {
  return headings(text)
    .filter((line) => COMPARATIVE.test(line))
    .map((line) => `${page}: the heading "${line}" ranks rather than describes — title the section by what it shows`);
}

/** The header row of every Markdown table on a page. */
const tableHeaders = (text: string): string[] => {
  const lines = text.split('\n');
  return lines.filter((line, i) => line.trimStart().startsWith('|') && /^\s*\|\s*:?-{2,}/u.test(lines[i + 1] ?? ''));
};

/** What is wrong with one page's tables (R9): no column is headed `Replaces`. */
export function replacesColumnProblems(page: string, text: string): string[] {
  return tableHeaders(text)
    .filter((row) => row.split('|').some((cell) => /^\s*replaces\s*$/iu.test(cell)))
    .map((row) => `${page}: a table is headed "Replaces" — say "Migrates from" (or "incumbent" for a measurement): ${row.trim()}`);
}

/**
 * A README's `## The family` section with each row's first cell reduced to the package's name, so
 * the one difference a README is allowed — its own row is `**name** (this package)` where the
 * others link the sibling — is the only thing removed before the sections are compared.
 */
export function familySection(name: string, readme: string): string | undefined {
  const at = readme.indexOf('\n## The family\n');
  if (at === -1) return undefined;
  const rest = readme.slice(at + 1);
  const end = rest.indexOf('\n## ', 1);
  const section = end === -1 ? rest : rest.slice(0, end);
  if (!section.includes(`| **${name}** (this package) |`)) return `${section}\n(no "(this package)" row for ${name})`;
  return section.replaceAll(/^\| (?:\*\*([\w-]+)\*\* \(this package\)|\[([\w-]+)\]\([^)]*\)) \|/gmu, (_, own: string | undefined, sibling: string | undefined) => `| ${own ?? sibling ?? ''} |`);
}

/** A version at 1.0 or later. */
const stable = (version: string): boolean => Number(version.split('.')[0]) >= 1;

/** Section titles that describe a package that does not exist yet. */
const ROADMAP = /^## (?:What it will be|Following along|Coming soon|Roadmap)\b/imu;

/**
 * What is wrong with one README's sections (R10, R11): a 1.x package's README does not title a
 * section as a future, and the section after `## Quick start` says what the package does — it is
 * not `## Migrating`, `## Install` or `## Compatibility`.
 */
export function sectionProblems(name: string, version: string, readme: string): string[] {
  const out: string[] = [];
  const future = ROADMAP.exec(readme);
  if (stable(version) && future !== null) out.push(`${name}@${version}: "${future[0]}" titles a 1.x package's section as a future — say what is built in the present tense, and say plainly what is not`);
  const sections = readme.split('\n').filter((line) => line.startsWith('## '));
  const next = sections[sections.indexOf('## Quick start') + 1];
  if (sections.includes('## Quick start') && (next === undefined || /^## (?:Migrating|Install|Compatibility)\b/u.test(next))) {
    out.push(`${name}: the section after "## Quick start" is "${String(next)}" — add one that says what the package does before the migration`);
  }
  return out;
}

describe('the npm descriptions say what each package does, then the dependency fact, then the migration (R7, R8)', () => {
  it('holds every published package', () => {
    expect(described().length).toBeGreaterThanOrEqual(10);
  });

  it.each(described().map((d) => [d.name, d] as const))('%s', (_, pkg) => {
    expect(descriptionProblems(pkg)).toEqual([]);
  });
});

describe('no front page heading ranks a package against another (R8)', () => {
  it.each(['README.md', ...packageReadmes()])('%s', (page) => {
    expect(headingProblems(page, read(page))).toEqual([]);
  });
});

describe('no table is headed "Replaces" (R9)', () => {
  it.each(['README.md', ...packageReadmes(), 'apps/docs/content/docs/packages/index.md'])('%s', (page) => {
    expect(replacesColumnProblems(page, read(page))).toEqual([]);
  });

  it('the family section is one text in every package README, but for the "(this package)" row', () => {
    const sections = packageReadmes().map((page) => familySection(page.split('/')[1]!, read(page)));
    expect(sections.every((s) => s !== undefined), 'a package README has no "## The family" section').toBe(true);
    expect(new Set(sections).size, 'the family sections differ — run `npx tsx scripts/readme-benchmarks.ts`').toBe(1);
  });
});

describe('a 1.x README describes what is built, and says what the package does before how to switch (R10, R11)', () => {
  it.each(described().map((d) => [d.name, d] as const))('%s', (name, { version }) => {
    expect(sectionProblems(name, version, read(`packages/${name}/README.md`))).toEqual([]);
  });
});

/** A description to test the lock with, as roundel's manifest would carry it. */
const pkg = (description: string, dependencies: string[] = []): Described => ({ name: 'roundel', version: '1.0.3', description, dependencies });

describe('the voice lock can fail', () => {

  it("fails every description it was written against (origin/main, 2026-10-09)", () => {
    const etymology = pkg('Which source outranks the others. One resolution for flags, environment, project and home config files and defaults. Drop-in paths for cosmiconfig, dotenv and rc. Zero dependencies.');
    expect(descriptionProblems({ ...etymology, name: 'seniority' }, ['cosmiconfig', 'dotenv', 'rc']).join('\n')).toMatch(/4 sentence\(s\)[\s\S]*dependency sentence[\s\S]*should end with/u);
    const lighter = pkg('The colours a CLI carries. One output policy, semantic tokens, a theme, and a chalk migration path lighter than chalk. Zero dependencies.');
    expect(descriptionProblems(lighter, ['chalk']).join('\n')).toMatch(/names chalk|lighter than/u);
    expect(descriptionProblems(lighter, ['chalk']).join('\n')).toMatch(/"lighter than"/u);
    const rivalFirst = pkg('An agent-native CLI framework, drop-in compatible with commander and yargs. One declaration; help, --json, --schema, --mcp and completions all projected from it.', ['bellpull']);
    expect(descriptionProblems({ ...rivalFirst, name: 'burgee' }, ['commander', 'yargs']).join('\n')).toMatch(/first sentence names commander, yargs/u);
  });

  it('passes the shape it asks for, and refuses a drop-in compat.ts does not hold', () => {
    expect(descriptionProblems(pkg('Colour for a CLI, decided once. Zero dependencies. Drop-in path for chalk.'), ['chalk'])).toEqual([]);
    expect(descriptionProblems(pkg('Colour for a CLI, decided once. Zero dependencies. Drop-in paths for chalk and kleur.'), ['chalk'])).toEqual([expect.stringMatching(/lists kleur/u)]);
    expect(descriptionProblems(pkg('Colour for a CLI, decided once. Zero dependencies. Drop-in path for chalk.', ['linegauge']), ['chalk'])).toEqual([expect.stringMatching(/No dependency outside the burgee family/u)]);
    expect(descriptionProblems(pkg('Colour for a CLI, decided once. No dependency outside the burgee family. Drop-in path for chalk.', ['linegauge']), ['chalk'])).toEqual([]);
  });

  it('reads a full stop inside a word as part of it', () => {
    expect(sentences('Tokens over util.styleText, grapheme-correct over Intl.Segmenter. Zero dependencies. Drop-in path for chalk.')).toHaveLength(3);
  });

  it('fails the heading and the table column it was written against', () => {
    expect(headingProblems('README.md', '## 🧭 A better commander, not another oclif\n')).toHaveLength(1);
    expect(headingProblems('bellpull', '## What it does that the alternatives do not\n')).toHaveLength(1);
    expect(headingProblems('README.md', '## 🧭 It starts as one file\n')).toEqual([]);
    expect(replacesColumnProblems('x', '| Package | What it is | Replaces |\n| :-- | :-- | :-- |\n| a | b | c |\n')).toHaveLength(1);
    expect(replacesColumnProblems('x', 'It replaces nothing.\n| Package | Migrates from |\n| :-- | :-- |\n')).toEqual([]);
  });

  it('fails a family section that differs between two READMEs', () => {
    const one = '# a\n\n## The family\n\nTen packages.\n\n| **a** (this package) | A |\n| [b](https://b) | B |\n\n## Contributing\n';
    const two = '# b\n\n## The family\n\nNine packages.\n\n| [a](https://a) | A |\n| **b** (this package) | B |\n\n## Contributing\n';
    expect(familySection('a', one)).not.toBe(familySection('b', two));
    expect(familySection('a', one)).toBe(familySection('b', two.replace('Nine', 'Ten')));
  });

  it('fails a 1.x roadmap heading, and a Quick start followed straight by Migrating', () => {
    expect(sectionProblems('caique', '1.0.3', '## Quick start\n\n## What it does\n\n## What it will be\n')).toEqual([expect.stringMatching(/titles a 1\.x package's section as a future/u)]);
    expect(sectionProblems('controlroom', '0.3.4', '## Install\n\n## Quick start\n\n## Migrating\n')).toEqual([expect.stringMatching(/after "## Quick start" is "## Migrating"/u)]);
    expect(sectionProblems('controlroom', '0.3.4', '## Quick start\n\n## What it does\n\n## Migrating\n')).toEqual([]);
  });
});

// ── R13: titles and llms.txt rows say what the package does (owner, 2026-10-10) ────────────────
//
// R1–R12 held the openings, the descriptions and the headings, and not the two strings a search
// result and an agent's map show first. Every docs site's home `<title>` read `<name> — replaces
// X` (burgee's: "the CLI framework that replaces commander and yargs"), and every row of the front
// door's llms.txt package map opened "— replaces X." before the description. What follows reads
// both from the code the sites render — `homeMetadata` and `llmsIndex`, over the rows in
// `.github/vercel-apps.json` and the manifests in `packages/` — never from a copy of their output.
// The search signal stays where R7 put it: each home page's meta description names the
// incumbents, in its last sentence.

/** Every published package's name: the family, whose subpaths are not incumbents. */
const FAMILY = packageReadmes().map((page) => page.split('/')[1]!);

/** Every docs app, deployable or pending: its row, the site it resolves, and its home page's source. */
const docsApps = (): { row: App | PendingApp; site: Site; page: string }[] =>
  [...APPS, ...PENDING].map((row) => ({
    row,
    site: defineSite(row.key, JSON.parse(read(`packages/${row.package}/package.json`)) as Manifest),
    page: read(`${row.dir}/src/app/(home)/page.tsx`),
  }));

/** The meta description a home page renders: the front door's is `SUMMARY`, a package site's its npm description. */
const homeDescription = (row: App | PendingApp, site: Site): string => (row.familyPages ? SUMMARY : site.description);

/** The length a search result shows of a title before it truncates. */
export const TITLE_LIMIT = 60;

/** Words that frame a package as a substitute rather than say what it does. */
const SUBSTITUTE = /\b(?:replaces?|replacement|alternative)\b/iu;

/**
 * What is wrong with one home `<title>` (R13): it reads `<name> — <what it does>`, and the part
 * after the dash names no incumbent, does not call the package a replacement or an alternative,
 * does not rank it (R8), and fits a search result.
 */
export function titleProblems(name: string, title: string): string[] {
  const prefix = `${name} — `;
  if (!title.startsWith(prefix)) return [`${name}: the home title "${title}" should read "${name} — <what it does, short>"`];
  const does = title.slice(prefix.length);
  const names = named(does);
  return [
    ...(names.length === 0 ? [] : [`${name}: the home title "${title}" names ${names.join(', ')} — say what ${name} does; the incumbents belong in the description's last sentence`]),
    ...(SUBSTITUTE.test(does) ? [`${name}: the home title "${title}" frames ${name} as a substitute — say what it does`] : []),
    ...(COMPARATIVE.test(does) ? [`${name}: the home title "${title}" ranks rather than describes`] : []),
    ...(title.length > TITLE_LIMIT ? [`${name}: the home title "${title}" is ${String(title.length)} characters; a search result shows about ${String(TITLE_LIMIT)}`] : []),
  ];
}

/** `text` with every family subpath (`controlroom/ink`) removed: it is the family's code, not the incumbent it shares a word with. */
const withoutFamilySubpaths = (text: string, family: readonly string[]): string =>
  family.reduce((out, name) => out.split(`${name}/`).map((part, i) => (i === 0 ? part : part.replace(/^[\w./-]+/u, ''))).join(name), text);

/**
 * What is wrong with one meta description (R13): every incumbent it names is in its last sentence,
 * and the last sentence names at least one — a reader searching "chalk alternative" still finds
 * the page, after it has said what the package does.
 */
export function placementProblems(page: string, description: string, family: readonly string[] = FAMILY): string[] {
  const parts = sentences(withoutFamilySubpaths(description, family));
  const early = [...new Set(parts.slice(0, -1).flatMap((s) => named(s)))];
  return [
    ...(early.length === 0 ? [] : [`${page}: the meta description names ${early.join(', ')} before its last sentence — the incumbents belong in the last sentence only: "${description}"`]),
    ...(named(parts.at(-1) ?? '').length > 0 ? [] : [`${page}: the meta description's last sentence names no incumbent, so a search for one no longer finds the page: "${description}"`]),
  ];
}

/**
 * What is wrong with the llms.txt package map (R13): each package's row is its link, then its npm
 * description whole, with nothing between them that names an incumbent or says "replaces".
 */
export function llmsRowProblems(map: string, packages: readonly PublicPackage[]): string[] {
  const rows = map.split('\n').filter((line) => line.startsWith('- ['));
  return packages.flatMap(({ name, url, description }) => {
    const link = `- [${name}](${url})`;
    const row = rows.find((line) => line.startsWith(link));
    if (row === undefined) return [`llms.txt: no package-map row for ${name}`];
    const at = row.indexOf(description);
    if (at === -1) return [`llms.txt: the ${name} row does not carry its npm description whole: "${row}"`];
    const lead = row.slice(link.length, at);
    const names = named(lead);
    return [
      ...(names.length === 0 ? [] : [`llms.txt: the ${name} row names ${names.join(', ')} before its description — the description's last sentence already names the drop-ins: "${row.slice(0, at)}…"`]),
      ...(SUBSTITUTE.test(lead) ? [`llms.txt: the ${name} row opens "${lead.trim()}" — lead with what it does`] : []),
    ];
  });
}

/** The `absolute` title a home page's metadata sets. */
const absoluteTitle = (title: Metadata['title']): string => (typeof title === 'object' && title !== null && 'absolute' in title ? title.absolute : String(title));

describe('every home title says what the package does (R13)', () => {
  it('holds every docs app, deployable or pending', () => {
    expect(docsApps().length).toBeGreaterThanOrEqual(10);
  });

  it.each(docsApps().map((app) => [app.row.package, app] as const))('%s', (name, { row, site, page }) => {
    expect(page, `${row.dir}'s home page should take its metadata from docs-chassis's homeMetadata, the one source this lock reads`).toMatch(/\bhomeMetadata\(site\b/u);
    const metadata = homeMetadata(site, homeDescription(row, site));
    expect(titleProblems(name, absoluteTitle(metadata.title))).toEqual([]);
    expect(metadata.description).toBe(homeDescription(row, site));
    expect(placementProblems(name, metadata.description ?? '')).toEqual([]);
  });
});

describe("the front door's llms.txt package map leads each row with what the package does (R13)", () => {
  const packages = publicPackages(join(ROOT, 'packages'));
  const front = docsApps().find(({ row }) => row.familyPages)!;
  const text = llmsIndex({ site: front.site, pages: [], packages });

  it('maps every published package', () => {
    expect(packages.length).toBeGreaterThanOrEqual(10);
  });

  it('opens no row on an incumbent', () => {
    expect(llmsRowProblems(text, packages)).toEqual([]);
  });
});

describe('the title lock can fail', () => {
  it('fails every title it was written against (live, 2026-10-10)', () => {
    expect(titleProblems('burgee', 'burgee — the CLI framework that replaces commander and yargs').join('\n')).toMatch(/names commander, yargs[\s\S]*substitute/u);
    expect(titleProblems('roundel', 'roundel — replaces chalk')).toHaveLength(2);
    expect(titleProblems('bellpull', 'bellpull — replaces cross-spawn and which').join('\n')).toMatch(/names cross-spawn/u);
  });

  it('passes the shape it asks for, and fails a misshapen, ranking or long one', () => {
    expect(titleProblems('roundel', 'roundel — colour for CLIs')).toEqual([]);
    expect(titleProblems('roundel', 'roundel: colour for CLIs')).toHaveLength(1);
    expect(titleProblems('roundel', 'roundel — colour for CLIs, lighter than the rest')).toHaveLength(1);
    expect(titleProblems('roundel', `roundel — ${'colour '.repeat(10)}`)).toEqual([expect.stringMatching(/characters/u)]);
  });

  it('fails a description that names an incumbent early, or none at all', () => {
    expect(placementProblems('roundel', 'A palette, unlike chalk. Zero dependencies. Drop-in path for chalk.')).toEqual([expect.stringMatching(/names chalk before/u)]);
    expect(placementProblems('roundel', 'Colour for a CLI. Zero dependencies.')).toEqual([expect.stringMatching(/names no incumbent/u)]);
    expect(placementProblems('roundel', 'Colour for a CLI. Zero dependencies. Drop-in path for chalk.')).toEqual([]);
  });

  it("reads a family subpath as the family's, not as the incumbent it shares a word with", () => {
    expect(placementProblems('controlroom', 'Terminal screens. Optional peers, loaded only by controlroom/ink. Drop-in path for ink.', ['controlroom'])).toEqual([]);
    expect(placementProblems('controlroom', 'Terminal screens, like ink. Drop-in path for ink.', ['controlroom'])).toEqual([expect.stringMatching(/names ink before/u)]);
  });

  it('fails the llms.txt row it was written against', () => {
    const bellpull: PublicPackage = { name: 'bellpull', url: 'https://bellpull.interlace.tools/docs', description: 'Runs a subprocess. Zero dependencies. Drop-in paths for cross-spawn and which.', replaces: 'cross-spawn and which', guides: [] };
    expect(llmsRowProblems(`- [bellpull](${bellpull.url}) — replaces cross-spawn and which. ${bellpull.description}`, [bellpull]).join('\n')).toMatch(/names cross-spawn[\s\S]*opens/u);
    expect(llmsRowProblems(`- [bellpull](${bellpull.url}): ${bellpull.description}`, [bellpull])).toEqual([]);
    expect(llmsRowProblems(`- [bellpull](${bellpull.url}): Runs a subprocess.`, [bellpull])).toEqual([expect.stringMatching(/whole/u)]);
  });
});
