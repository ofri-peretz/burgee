/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * Lock — every public benchmark number links to where it is measured (`cli-benchmarks` B7).
 *
 * PRINCIPLES 4 has two halves: a number is measured, and a reader can get from the number to its
 * measurement. The first half is held by the claim gates. This holds the second, which is what
 * stops a figure going stale in prose: a figure with a link beside it is one click from being
 * caught wrong, and a figure without one is a sentence nobody re-reads.
 *
 * A benchmark figure is a ratio (`0.974×`, `1.47x`), a byte count (`24,484 bytes`, `10,452 B`,
 * `3.3 KB`), or a cold-start delta (`+19.1 ms`). Each must sit in a paragraph that links to
 * `/docs/benchmarks`, or in a table row that does, or in a table whose introducing paragraph — the
 * one directly above it — does: a ten-row claim table carries its link once, above it, not ten
 * times. Fenced code is not prose and is not read.
 *
 * Read over the root README, the comparison page and every package README: what npm and the docs
 * site show.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const FILES = [
  'README.md',
  'apps/docs/content/docs/comparison.mdx',
  ...readdirSync(join(ROOT, 'packages'))
    .map((name) => `packages/${name}/README.md`)
    .filter((file) => existsSync(join(ROOT, file))),
];

/** A ratio, a byte count, or a cold-start delta — the three kinds of figure the benchmarks publish. */
const FIGURE = [
  /(?<![\w.])\d+(?:\.\d+)?\s?×/u,
  /(?<![\w.#])\d+\.\d+x\b/u,
  /(?<![\w.])\d{1,3}(?:,\d{3})+ ?(?:bytes|B)\b/u,
  /(?<![\w.])\d+(?:\.\d+)? ?KB\b/u,
  /(?<![\w.])\+\d+(?:\.\d+)? ?ms\b/u,
];

/** A Markdown link, or an HTML one, whose target is the benchmarks page. */
const LINKS_TO_BENCHMARKS = /\]\([^)\s]*\/docs\/benchmarks[^)\s]*\)|href="[^"]*\/docs\/benchmarks[^"]*"/u;

const isRow = (line: string): boolean => line.trimStart().startsWith('|');

/** Fenced blocks out: example output is not a published figure. */
function prose(text: string): string {
  return text.replace(/^([ \t>]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1\2[ \t]*$/gmu, '');
}

const hasFigure = (line: string): boolean => FIGURE.some((f) => f.test(line));
const links = (text: string): boolean => LINKS_TO_BENCHMARKS.test(text);
const shown = (line: string): string => line.replace(/\s+/gu, ' ').trim().slice(0, 140);

/** The figures one block leaves unlinked: a paragraph as a whole, a table row by row, a table also through its intro. */
function unlinkedIn(lines: readonly string[], block: string, intro: string): string[] {
  if (!lines.every(isRow)) return hasFigure(block) && !links(block) ? [shown(block)] : [];
  return lines.filter((row) => hasFigure(row) && !links(row) && !links(intro)).map(shown);
}

/** Each figure that sits in no paragraph, row or introduced table linking to the benchmarks page. */
export function unlinked(text: string): string[] {
  const out: string[] = [];
  let intro = '';
  for (const block of prose(text).split(/\n[ \t]*\n/u)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    out.push(...unlinkedIn(lines, block, intro));
    // A table's introducing paragraph is the block directly above it; a table never introduces another.
    intro = lines.every(isRow) ? '' : block;
  }
  return out;
}

describe('every public benchmark number links to /docs/benchmarks (cli-benchmarks B7)', () => {
  it.each(FILES)('%s', (file) => {
    expect(unlinked(readFileSync(join(ROOT, file), 'utf8'))).toEqual([]);
  });
});

describe('the lock can fail', () => {
  it('finds each kind of figure in a paragraph with no link', () => {
    for (const figure of ['reads 0.974× of yargs', 'starts at 1.47x cac', 'is 24,484 bytes', 'is 10,452 B', 'ships 3.3 KB', 'adds +19.1 ms']) {
      expect(unlinked(`A sentence that ${figure}.`), figure).toHaveLength(1);
    }
  });

  it('passes a paragraph, a row, or a table introduced by a paragraph, that links', () => {
    expect(unlinked('It reads 0.974× ([Benchmarks](/docs/benchmarks)).')).toEqual([]);
    expect(unlinked('It reads 0.974× ([Benchmarks](https://burgee.interlace.tools/docs/benchmarks#weight)).')).toEqual([]);
    expect(unlinked('Text.\n\n| a | 0.974× [see](/docs/benchmarks) |\n| b | 1.4× |')).toEqual(['| b | 1.4× |']);
    expect(unlinked('Measured on [Benchmarks](/docs/benchmarks):\n\n| a | 0.974× |\n| b | 1.4× |')).toEqual([]);
  });

  it('does not let a table borrow a link from further up, or read a figure in fenced code', () => {
    expect(unlinked('See [Benchmarks](/docs/benchmarks).\n\nAn unrelated paragraph.\n\n| a | 0.974× |')).toEqual(['| a | 0.974× |']);
    expect(unlinked('```\n0.974× in an example\n```')).toEqual([]);
  });

  it('fails the README once one link is removed', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    const at = readme.search(LINKS_TO_BENCHMARKS);
    expect(at, 'the README links to the benchmarks page nowhere, so this proves nothing').toBeGreaterThan(-1);
    const without = readme.replace(LINKS_TO_BENCHMARKS, '(benchmarks)');
    expect(unlinked(without).length).toBeGreaterThan(0);
  });
});
