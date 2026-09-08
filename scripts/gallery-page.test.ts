/**
 * The gallery says "Do not edit by hand", and this is what makes that true.
 *
 * A generated page nobody re-generates is a screenshot with extra steps: it rots the first
 * time the thing it depicts changes, and the rot is invisible because the page still reads
 * fine. So the committed file is compared against a fresh render on every `npm test`. It
 * caught two things the day it was written — a `|` frame closing a table cell, and a count
 * that included the two styles flagstaff already ships — which is the argument for it.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { gallery, OUT } from './gallery-page.js';

/** A Windows checkout carries CRLF; the page is its content, not its line endings. */
const read = (): string => readFileSync(OUT, 'utf8').replaceAll('\r\n', '\n');

describe('the gallery is a projection, not a document', () => {
  it('matches what the components render right now', () => {
    expect(read(), 'the gallery is stale — run `npm run gallery:page`').toBe(gallery());
  });

  it('never claims a static projection that carries an escape', () => {
    // The page's whole argument: every row but `tty` is text. If one of them grows an
    // escape sequence, the argument is gone and this fails before anyone publishes it.
    const rows = read()
      .split('\n')
      .filter((line) => /^\| `(?:pipe|ci|json|accessible)` \|/.test(line));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row, row).not.toContain('␛');
  });
});
