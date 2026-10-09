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
 * The package READMEs join `PAGES` with R4. A lock that landed red over pages a later PR fixes
 * would block every PR in between.
 *
 * Proven red on `fc0f897104`, the tree the intent was opened against: both pages failed, the
 * root README naming `commander, yargs` and the docs landing the same.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// eslint-disable-next-line import-next/no-relative-packages -- by path, for the same reason as migrate-drop-ins-lock.test.ts: `compat.ts` is not an export
import { DROP_INS, GRADED } from '../packages/burgee/src/compat.js';

import { body, DOCS_LANDING, firstParagraph, incumbents, named } from './positioning-audit.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (page: string): string => readFileSync(join(ROOT, page), 'utf8');

/** The pages R1 holds today. */
export const PAGES = ['README.md', DOCS_LANDING];

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
