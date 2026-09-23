/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every published README opens with the incumbent it replaces, then its agent surface.
 *
 * Roadmap `marketing-and-docs.md` 1.3. burgee is found by the thing a reader is leaving —
 * "chalk alternative", "cosmiconfig alternative" — and chosen for the thing no incumbent has.
 * On 2026-09-22 four of the nine npm READMEs did not name what they replace in their opening:
 * seniority and closeout said it in a `## Replaces` section two hundred lines down, paratext
 * sixty lines down, and burgee's own README in its FAQ. Six stated no agent surface there —
 * the one angle that sets each package apart (`gtm-audit.md`, AEO item 6).
 *
 * What this asserts is narrow on purpose:
 *
 *   - **the incumbents come from the manifest.** Each package's `description` already lists
 *     them — "Drop-in paths for ora, log-update, boxen and cli-table3", "Covers the OSC half
 *     of ansi-escapes, …". The README's opening must name at least one of that list, so a
 *     description and a README cannot drift onto different incumbents.
 *   - **the opening is the first 25 lines after the header block** — the centred `<p>` lockup,
 *     tagline, badges and docs link every README carries — which is what npm shows above the
 *     fold.
 *   - **the agent surface is named there too**: `--json`, an agent, a non-TTY caller or a
 *     static projection. Wording beyond that is not policed.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PACKAGES = join(ROOT, 'packages');

/** How many lines after the header block count as the opening. */
export const OPENING_LINES = 25;

interface Manifest {
  description?: string;
  private?: boolean;
}

const manifest = (name: string): Manifest => JSON.parse(readFileSync(join(PACKAGES, name, 'package.json'), 'utf8')) as Manifest;

/** Published packages with a README — `compat-oracle` is internal and ships to nobody. */
const published = (): string[] =>
  readdirSync(PACKAGES).filter((name) => existsSync(join(PACKAGES, name, 'package.json')) && manifest(name).private !== true && existsSync(join(PACKAGES, name, 'README.md')));

/**
 * The phrasings a description uses to list what it replaces. Each captures the list up to the
 * sentence's end; the list is then split and each item reduced to its last word, so "the OSC
 * half of ansi-escapes" reads as `ansi-escapes`.
 */
const LISTS = [/drop-in paths? for ([^.;]+)[.;]/giu, /\bcovers ([^.;]+)[.;]/giu, /drop-in compatible with ([^.;]+)[.;]/giu, /\ban? ([\w@/-]+) migration path\b/giu];

/** The incumbents a package's `description` names, in the order it names them. */
export function incumbents(description: string): string[] {
  const found = LISTS.flatMap((pattern) => [...description.matchAll(pattern)].map((m) => m[1]!))
    .flatMap((list) => list.split(/,\s*|\s+and\s+|\s+or\s+/u))
    .map((item) => /([@a-z0-9][\w@/.-]*)\s*$/iu.exec(item.trim())?.[1] ?? '')
    .filter((name) => name !== '');
  return [...new Set(found)];
}

/** The README with its centred header block — lockup, tagline, badges, docs link — removed. */
export function opening(readme: string, lines = OPENING_LINES): string {
  const all = readme.split('\n');
  let i = 0;
  while (i < all.length) {
    const line = all[i]!.trim();
    if (line === '') i += 1;
    else if (line.startsWith('<p')) {
      while (i < all.length && !all[i]!.includes('</p>')) i += 1;
      i += 1;
    } else break;
  }
  return all.slice(i, i + lines).join('\n');
}

/** A name as a whole word: `ora` must not match inside `ornate`, `chalk` must match `roundel/chalk`. */
const mentions = (text: string, name: string): boolean => new RegExp(String.raw`(?<![\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)}(?![\w-])`, 'u').test(text);

/** The agent surface, named: `--json`, an agent, a non-TTY caller, or a static projection. */
const AGENT_SURFACE = /--json\b|\bagents?\b|\bnon-TTY\b|\bstatic projection\b/iu;

/** What is wrong with one README's opening, or nothing. */
export function problems(name: string, readme: string, description: string): string[] {
  const names = incumbents(description);
  const head = opening(readme);
  const out: string[] = [];
  if (names.length === 0) out.push(`${name}'s package.json description names no incumbent in a form this lock reads ("Drop-in paths for …", "Covers …") — say what it replaces there first`);
  else if (!names.some((incumbent) => mentions(head, incumbent))) out.push(`${name}'s README does not name what it replaces in the ${String(OPENING_LINES)} lines after its header — its description lists ${names.join(', ')}; name at least one there`);
  if (!AGENT_SURFACE.test(head)) out.push(`${name}'s README does not state its agent surface in the ${String(OPENING_LINES)} lines after its header — say what --json, a pipe or an agent gets`);
  return out;
}

const readme = (name: string): string => readFileSync(join(PACKAGES, name, 'README.md'), 'utf8');

describe('every published README opens with the incumbent it replaces, then its agent surface', () => {
  const names = published();

  it('has published packages to check', () => {
    expect(names.length).toBeGreaterThanOrEqual(9);
  });

  it.each(names)('%s', (name) => {
    expect(problems(name, readme(name), manifest(name).description ?? '')).toEqual([]);
  });
});

describe('the lock can fail', () => {
  it('reads the incumbents out of every phrasing the manifests use', () => {
    expect(incumbents('Drop-in paths for ora, log-update, boxen and cli-table3. No dependency.')).toEqual(['ora', 'log-update', 'boxen', 'cli-table3']);
    expect(incumbents('Drop-in path for inquirer and clack.')).toEqual(['inquirer', 'clack']);
    expect(incumbents('Covers the OSC half of ansi-escapes, terminal-link and term-img; a drop-in path is not claimed.')).toEqual(['ansi-escapes', 'terminal-link', 'term-img']);
    expect(incumbents('An agent-native CLI framework, drop-in compatible with commander and yargs. One declaration.')).toEqual(['commander', 'yargs']);
    expect(incumbents('Semantic tokens, and a chalk migration path lighter than chalk.')).toEqual(['chalk']);
  });

  it('strips the header block and nothing after it', () => {
    const text = ['<p align="center">', '  <img src="x" />', '</p>', '', '<p align="center">tagline</p>', '', 'first', 'second'].join('\n');
    expect(opening(text, 1)).toBe('first');
  });

  it('fails a README whose opening names no incumbent', () => {
    const name = 'roundel';
    const description = manifest(name).description ?? '';
    const stripped = readme(name).replaceAll(/chalk|picocolors/gu, 'the incumbent');
    expect(stripped, 'the edit did not apply, so this proves nothing').not.toBe(readme(name));
    expect(problems(name, stripped, description).join('\n')).toMatch(/does not name what it replaces/u);
  });

  it('fails a README that only names the incumbent below the fold', () => {
    const padded = ['intro', ...Array.from({ length: OPENING_LINES }, () => 'filler about --json'), 'replaces chalk'].join('\n');
    expect(problems('roundel', padded, 'a chalk migration path.')).toEqual([expect.stringMatching(/does not name what it replaces/u)]);
  });

  it('fails a README whose opening states no agent surface', () => {
    expect(problems('roundel', 'replaces chalk, nothing else', 'a chalk migration path.')).toEqual([expect.stringMatching(/agent surface/u)]);
  });

  it('fails a description that lists no incumbent', () => {
    expect(problems('x', 'chalk and --json', 'A package.')).toEqual([expect.stringMatching(/names no incumbent/u)]);
  });
});
