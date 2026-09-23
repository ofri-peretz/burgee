/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — one pitch, said the same way everywhere it is said.
 *
 * Roadmap `marketing-and-docs.md` 1.5. The go-to-market audit found the pitch in three
 * spellings on 2026-09-22: the root README's tagline, the docs layout's metadata ("…: help,
 * structured output, a typed schema, …") and `/llms.txt`'s head ("…projected from one
 * declaration"). A model asked "what is burgee?" quotes whichever one it met first, so three
 * spellings are three products.
 *
 * The canonical string is `PITCH`, exported from `apps/docs/src/lib/llms.ts` — the docs
 * layout's metadata and `/llms.txt` import it. What cannot import it is checked against it
 * here:
 *
 *   - the tagline under the lockup in the root `README.md`,
 *   - the same tagline in `packages/burgee/README.md`, which is what npm shows,
 *   - `TAGLINE` in `scripts/brand.mts`, which the Open Graph card and cover are drawn with.
 *
 * And the fourth variant — the failure this exists for — is caught by its opening words:
 * anywhere under `apps/docs/src` or in those READMEs, a sentence that starts like the pitch
 * must be the pitch.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const LLMS = join(ROOT, 'apps', 'docs', 'src', 'lib', 'llms.ts');
const DOCS_SRC = join(ROOT, 'apps', 'docs', 'src');
const READMES = ['README.md', 'packages/burgee/README.md'];

const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/** Every `const NAME = '…'` or `"…"` declaration, spanning a line break after the `=`. */
const DECLARATION = /const (\w+)\s*=\s*(["'])((?:\\.|(?!\2)[^\\])*)\2/gu;

/** A string constant's value, with its escapes undone, or `undefined` when it is not declared. */
const literal = (source: string, name: string): string | undefined => {
  const match = [...source.matchAll(DECLARATION)].find((m) => m[1] === name);
  return match?.[3]?.replaceAll(/\\(.)/gu, '$1');
};

/** The canonical pitch, read out of `llms.ts` rather than restated here. */
export function canonical(): string {
  const pitch = literal(readFileSync(LLMS, 'utf8'), 'PITCH');
  if (pitch === undefined) throw new Error('apps/docs/src/lib/llms.ts no longer declares `export const PITCH = "…"` as a string literal — update this lock with it');
  return pitch;
}

/** The tagline under a README's lockup: the first centred `<p>` that is text, not a link or badge. */
export function tagline(readme: string): string | undefined {
  for (const [, body] of readme.matchAll(/<p align="center">\s*([\s\S]*?)\s*<\/p>/gu)) {
    if (!/<(?:a|img|picture)\b/u.test(body!)) return body!.replaceAll(/\s+/gu, ' ').trim();
  }
  return undefined;
}

/** Every sentence that opens like the pitch, with its source — each must be the pitch whole. */
export function variants(text: string, pitch: string): string[] {
  const opener = pitch.split(' ').slice(0, 4).join(' ');
  const flat = text.replaceAll(/\s+/gu, ' ');
  const out: string[] = [];
  let at = flat.indexOf(opener);
  while (at !== -1) {
    if (!flat.startsWith(pitch, at)) out.push(flat.slice(at, at + pitch.length + 20));
    at = flat.indexOf(opener, at + opener.length);
  }
  return out;
}

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) sources(abs, found);
    else if (/\.(?:ts|tsx|mdx?)$/u.test(entry.name)) found.push(abs);
  }
  return found;
}

describe('one pitch, said the same way everywhere', () => {
  const pitch = canonical();

  it('has a pitch to check against', () => {
    expect(pitch).toMatch(/^Everything a CLI needs/u);
  });

  it.each(READMES)('%s carries it as its tagline', (path) => {
    expect(tagline(read(path)), `${path}'s tagline under the lockup differs from PITCH in apps/docs/src/lib/llms.ts`).toBe(pitch);
  });

  it('scripts/brand.mts draws the card with it', () => {
    expect(literal(read('scripts/brand.mts'), 'TAGLINE'), "scripts/brand.mts's TAGLINE differs from PITCH in apps/docs/src/lib/llms.ts — change one, then run `npm run brand`").toBe(pitch);
  });

  it('has no fourth variant in the docs source or the READMEs', () => {
    const found = [...sources(DOCS_SRC).map((abs) => relative(ROOT, abs)), ...READMES].flatMap((path) => variants(read(path), pitch).map((v) => `${path}: "${v}…"`));
    expect(found, 'a sentence opens like the pitch and then says something else — import PITCH from #/lib/llms, or say it whole').toEqual([]);
  });

  it('the docs layout and llms.txt import it rather than restating it', () => {
    expect(read('apps/docs/src/app/layout.tsx')).toMatch(/import \{[^}]*\bPITCH\b[^}]*\} from '#\/lib\/llms'/u);
    expect(read('apps/docs/src/lib/llms.ts')).toContain('`> ${PITCH}`');
  });
});

describe('the lock can fail', () => {
  const pitch = canonical();

  it('reads a tagline past the lockup and the badges', () => {
    const readme = ['<p align="center">', '  <a href="x"><picture><img src="y" /></picture></a>', '</p>', '', '<p align="center">', '  A tagline', '  on two lines.', '</p>'].join('\n');
    expect(tagline(readme)).toBe('A tagline on two lines.');
  });

  it('fails a README whose tagline drifted', () => {
    const drifted = read('README.md').replace(pitch, pitch.replace('humans and agents alike', 'humans and machines'));
    expect(drifted, 'the edit did not apply, so this proves nothing').not.toBe(read('README.md'));
    expect(tagline(drifted)).not.toBe(pitch);
  });

  it('catches a fourth variant by its opening words', () => {
    const fourth = "const DESCRIPTION = \"Everything a CLI needs that isn't your CLI: help, structured output, a typed schema.\";";
    expect(variants(fourth, pitch)).toHaveLength(1);
    expect(variants(`description: '${pitch}'`, pitch)).toEqual([]);
  });

  it('reads a string literal the way the source writes it', () => {
    expect(literal(String.raw`const TAGLINE = 'it\'s here';`, 'TAGLINE')).toBe("it's here");
    expect(literal('const TAGLINE =\n  "two words";', 'TAGLINE')).toBe('two words');
  });
});
