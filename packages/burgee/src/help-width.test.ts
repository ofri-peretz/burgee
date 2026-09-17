/**
 * cli-help-renderer — help measures *display* width, not `String.length`.
 *
 * `help.ts` sized its term column, decided which terms overflow it, computed the padding
 * after a term, and word-wrapped every description with `.length`. That is the count of
 * UTF-16 code units, which is the number of columns a terminal draws only for the
 * Latin-1 subset. `yargs/cliui.ts` one directory over has imported `width` from
 * `linegauge` for exactly this job since it was ported, and its own comment records why:
 * a truecolor escape measured a 13-column string as 25.
 *
 * So a CJK or emoji command name mis-measured its own help column. The three failures
 * these cases pin, all of them visible on the unfixed renderer:
 *
 *  - a wide term's description is pushed right of the shared column, because the padding
 *    subtracts a code-unit count from a column count;
 *  - a wide term that *does* overflow the column is not detected as overflowing;
 *  - a description of wide characters is wrapped to `width` code units, so the rendered
 *    line is wider than the terminal the caller asked for.
 *
 * Every assertion here measures with `linegauge`'s `width`, never with `.length` — a
 * width test written with the instrument under test would pass on the broken code.
 */
import { width } from 'linegauge';
import { describe, expect, it } from 'vitest';

import { wrap } from './help.js';
import { defineCommand, defineProgram, renderHelp } from './index.js';

const ok = (): string => 'ok';

/**
 * Wide and narrow terms in one help screen. `部署` is two code units and four columns;
 * `🚀` is two code units (one surrogate pair) and two columns; `deploy-service` is
 * fourteen of each and sets the shared column.
 */
const program = defineProgram({
  name: 'app',
  description: 'A fixture whose command names are not all one column per code unit.',
  commands: [
    defineCommand({ name: 'deploy-service', description: 'ASCII: code units and columns agree', effects: 'withheld', run: ok }),
    defineCommand({ name: '部署', description: 'CJK: two code units, four columns', effects: 'withheld', run: ok }),
    defineCommand({ name: '🚀', description: 'emoji: two code units, two columns', effects: 'withheld', run: ok }),
    defineCommand({ name: 'describe', description: '说明 文字 也要 按照 终端 的 列宽 来 折行 而不是 按照 代码 单元 的 数量', effects: 'withheld', run: ok }),
  ],
});

const root = program.find(['app']);
if (root === undefined) throw new Error('fixture');

/** Two-column rows only: indented, and not an `$ example` line. */
const isRow = (l: string): boolean => /^ {2}\S/.test(l) && !l.startsWith('  $');

/**
 * The display column where a row's description begins — counted in terminal columns,
 * by measuring the text that precedes it, never by its index in the string.
 */
function descriptionColumn(line: string): number {
  const gap = line.slice(2).search(/ {2}\S/);
    if (gap === -1) return -1;
  return width(line.slice(0, 2 + gap + 2));
}

describe('help sizes its columns in display width, not code units', () => {
  it('starts every description at the same terminal column, whatever the term is made of', () => {
    const rows = renderHelp(program, root, { width: 100 }).split('\n').filter(isRow);
    const columns = rows.map(descriptionColumn).filter((c) => c !== -1);
    expect(columns.length).toBeGreaterThan(3);
    expect(new Set(columns).size).toBe(1);
  });

  it('never draws a line wider than the width it was given, at every width', () => {
    for (const w of [33, 60, 80, 120]) {
      for (const line of renderHelp(program, root, { width: w }).split('\n')) {
        expect(width(line)).toBeLessThanOrEqual(w);
      }
    }
  });

  it('wraps a description of wide characters to the columns available, not the code units', () => {
    const wide = defineProgram({
      name: 'app',
      commands: [defineCommand({ name: 'go', description: '这是 一段 很长 的 中文 说明 需要 在 终端 里 正确 地 折行', effects: 'withheld', run: ok })],
    });
    const node = wide.find(['app', 'go']);
    if (node === undefined) throw new Error('fixture');
    for (const line of renderHelp(wide, node, { width: 40 }).split('\n')) {
      expect(width(line)).toBeLessThanOrEqual(40);
    }
  });

  /**
   * What this renderer still does not do, in any character set: break a single token
   * longer than the row. `wrap('see https://…/no/spaces now', 20)` leaves the URL on one
   * over-long row today, and `linegauge`'s own `wrap` defaults to `hard: false` for the
   * same reason. Unspaced CJK is that same limitation, not a measurement fault — so the
   * width assertions above use spaced text, and hard-breaking stays out of this change
   * because it would re-draw the graded commander and yargs screens that contain URLs.
   */
  it('overflows an unbreakable token identically whatever it is made of (a known limit, not a width bug)', () => {
    const url = 'https://example.test/a/very/long/path/that/has/no/spaces';
    const han = '这是一段很长的没有空格的中文说明文字无法折行';
    expect(wrap(`see ${url} now`, 20)).toEqual(['see', url, 'now']);
    expect(wrap(`见 ${han} 完`, 20)).toEqual(['见', han, '完']);
  });

  it('detects a wide term overflowing the shared column and drops its description below', () => {
    const narrow = defineProgram({
      name: 'app',
      commands: [
        defineCommand({ name: 'go', description: 'short', effects: 'withheld', run: ok }),
        // Seven code units, fourteen columns: it fits 40% of a 30-column screen when
        // counted as code units and does not when counted as columns.
        defineCommand({ name: '部署到生产环境', description: 'to prod', effects: 'withheld', run: ok }),
      ],
    });
    const node = narrow.find(['app']);
    if (node === undefined) throw new Error('fixture');
    const lines = renderHelp(narrow, node, { width: 30 }).split('\n');
    const term = lines.findIndex((l) => l.includes('部署到生产环境'));
    expect(term).toBeGreaterThan(-1);
    expect(lines[term]?.trim()).toBe('部署到生产环境');
    expect(lines[term + 1]?.trim()).toBe('to prod');
  });
});
