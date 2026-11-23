/**
 * Lock: every JSON Schema keyword the validator reads is one the generator either holds to or
 * reports (contract-properties constraints: never skipped in silence). The validator's reader is
 * read as text, so a keyword it learns is a red test here until the generator learns it too.
 *
 * The table this produces, `npx vitest run packages/contractdiff/src/props-keywords.test.ts`, is
 * the keyword coverage the intent's success criteria ask for: `GENERATED` and `REPORTED` in
 * `props-generate.ts`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { GENERATED, REPORTED } from './props-generate.js';

const READER = fileURLToPath(new URL('../../loadline/src/from-json-schema.ts', import.meta.url));

/** Keywords that annotate and constrain nothing. */
const ANNOTATIONS = new Set(['title', 'description', 'examples', 'readOnly']);
/** Keywords read only with `if`, which is reported. */
const WITH_IF = new Set(['then', 'else']);

/** Every keyword the reader names: its keyword lists, `schema['…']`, `members('…')`, `part('…')` and the ones it does not apply. */
const readKeywords = (text: string): Set<string> => {
  const found = new Set<string>(['type']);
  for (const [, list] of text.matchAll(/_KEYS = \[([^\]]+)\]/g)) for (const [, keyword] of (list as string).matchAll(/'([$\w]+)'/g)) found.add(keyword as string);
  for (const [, keyword] of text.matchAll(/(?:schema\[|members\(|part\()'([$\w]+)'/g)) found.add(keyword as string);
  const unread = /const UNREAD[^=]*= [^[]*\[([^\]]+)\]/.exec(text)?.[1] ?? '';
  for (const [, keyword] of unread.matchAll(/'([$\w]+)'/g)) found.add(keyword as string);
  return found;
};

describe('the generator covers every keyword the validator reads', () => {
  const keywords = readKeywords(readFileSync(READER, 'utf8'));

  it('finds the reader and its keywords', () => {
    expect(keywords.size).toBeGreaterThan(30);
    for (const keyword of ['minLength', 'properties', 'allOf', 'nullable', 'unevaluatedProperties']) expect(keywords).toContain(keyword);
  });

  it.each([...keywords].sort().map((keyword) => [keyword]))('`%s` is generated, reported or an annotation', (keyword) => {
    const handled = (GENERATED as readonly string[]).includes(keyword) || (REPORTED as readonly string[]).includes(keyword) || ANNOTATIONS.has(keyword) || WITH_IF.has(keyword);
    expect(handled, `${keyword}: add it to GENERATED (and make values for it) or REPORTED in props-generate.ts`).toBe(true);
  });

  it('lists no keyword twice', () => {
    const both = GENERATED.filter((keyword) => (REPORTED as readonly string[]).includes(keyword));
    expect(both).toEqual([]);
  });
});
