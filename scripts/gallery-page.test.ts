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

  /**
   * controlroom criterion 1: the reference dashboard is on the page in all five modes, by running
   * it. The `tty` screens show the wizard's layout; every other block is clean text.
   */
  it('shows the reference dashboard in all five modes, and only the tty screen draws', () => {
    const page = read();
    const section = page.slice(page.indexOf('## A whole screen'), page.indexOf('## Spinner styles'));
    const blocks = Object.fromEntries(
      section
        .split(/^### /mu)
        .slice(1)
        .map((b) => [b.slice(0, b.indexOf('\n')), b]),
    );
    expect(Object.keys(blocks)).toEqual(['tty', 'pipe', 'ci', 'json', 'accessible']);
    expect(blocks['tty']).toContain('[Status] · Tail logs · Visualizer · HN');
    expect(blocks['tty']).toContain('Status · [Tail logs] · Visualizer · HN');
    expect(blocks['tty']).toMatch(/◼ Detect the framework\n.*[▶▷] Install the SDK\n.*◻ Write the config/u);
    expect(blocks['tty']).toContain('┊ npm install posthog-js');
    expect(blocks['tty']).toContain('←→ switch tab  s toggle status  q/^C quit');
    for (const mode of ['pipe', 'ci', 'json', 'accessible']) {
      expect(blocks[mode], mode).not.toMatch(/[␛␍]/u);
      expect(blocks[mode], mode).not.toContain('switch tab');
    }
    for (const line of (blocks['json'] ?? '').split('\n').filter((l) => l.startsWith('{'))) expect(JSON.parse(line)).toHaveProperty('event');
  });
});
