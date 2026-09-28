/**
 * Lock — two branches that move *different* ceilings merge without a conflict, and two that
 * move the *same* ceiling still conflict.
 *
 * `BUNDLED_CEILING` and `RATIO_CEILING` in `axes/weight.ts` are edited by most PRs that grow a
 * package, and `main` does not require a branch to be up to date before it merges. So a merge
 * conflict is the only thing that makes the second of two PRs re-measure on top of the first.
 *
 * - When both PRs moved the **same** ceiling, that conflict is what makes the second PR measure
 *   the combined tree before it lands. It must stay.
 * - When they moved **different** ceilings, the conflict forces a rebase and a second full CI
 *   run for a reason that has nothing to do with the numbers. Git treats edits to adjacent
 *   lines as one conflict. With no unchanged line between them, `linegauge` and
 *   `linegauge/wrap` were one conflict. Eleven neighbouring pairs were laid out like that.
 *
 * The check runs a real `git merge-file`; it does not measure line distances. Each neighbouring
 * pair is edited the way PRs in this file's history edit it: a new value with a history comment
 * above it, below it, or after a blank line, or a new value alone. The two edits are then
 * merged three ways. Pairs that are not neighbours need no check, because the entries between
 * them stay unchanged and keep the two edits apart.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { BUNDLED_CEILING, RATIO_CEILING } from './axes/weight.js';

const TABLES = { BUNDLED_CEILING, RATIO_CEILING } as const;
const SOURCE = readFileSync(new URL('axes/weight.ts', import.meta.url), 'utf8');
/** The one shape either table uses: one entry per line, `  key: value,` or `  'a/b': value,`. */
const ENTRY = /^ {2}(?:'([^']+)'|(\w+)): (.+),$/;

interface Entry {
  table: string;
  key: string;
  line: number;
}

function entries(source: string): Entry[] {
  const lines = source.split('\n');
  const found: Entry[] = [];
  for (const table of Object.keys(TABLES)) {
    const start = lines.findIndex((l) => l.startsWith(`export const ${table}:`));
    if (start === -1) continue;
    for (let i = start + 1; i < lines.length && !(lines[i] ?? '').startsWith('};'); i += 1) {
      const m = ENTRY.exec(lines[i] ?? '');
      if (m) found.push({ table, key: m[1] ?? m[2] ?? '', line: i });
    }
  }
  return found;
}

const moved = (line: string): string => line.replace(/: (.+),$/, ': $1 + 1,');
type Edit = (lines: string[], e: Entry, who: string) => void;
/** How a ceiling move has been written in this file's history. */
const EDITS: Record<string, Edit> = {
  'comment above': (l, e, who) => l.splice(e.line, 1, `  // ${who} moved ${e.key}, and why.`, moved(l[e.line] ?? '')),
  'comment below': (l, e, who) => l.splice(e.line, 1, moved(l[e.line] ?? ''), `  // ${who} moved ${e.key}, and why.`),
  'paragraph above': (l, e, who) => l.splice(e.line, 1, '', `  // ${who} moved ${e.key}, and why.`, moved(l[e.line] ?? '')),
  'value only': (l, e) => l.splice(e.line, 1, moved(l[e.line] ?? '')),
};

/**
 * The pairings checked. All sixteen pairings of the four styles were run against the padded
 * layout while it was being designed, and none conflicted. These four keep one `git`
 * spawn per style per neighbouring pair, and they include the pairings that put two new lines
 * closest together: a comment below one entry followed by a comment above the next.
 */
const PAIRINGS: [string, string][] = [
  ['comment above', 'comment above'],
  ['comment below', 'comment above'],
  ['comment below', 'paragraph above'],
  ['value only', 'value only'],
];

/** `git` with no `GIT_*` variables from a hook or a parent repository steering it. */
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
const scratch = mkdtempSync(join(tmpdir(), 'ceiling-layout-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Whether two edits of `base` merge three ways with no conflict. */
function merges(base: string, ours: string[], theirs: string[]): boolean {
  writeFileSync(join(scratch, 'base'), base);
  writeFileSync(join(scratch, 'ours'), ours.join('\n'));
  writeFileSync(join(scratch, 'theirs'), theirs.join('\n'));
  try {
    execFileSync('git', ['merge-file', '-p', join(scratch, 'ours'), join(scratch, 'base'), join(scratch, 'theirs')], { env, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Every neighbouring pair of different ceilings, in every pairing of edit styles, that conflicts. */
function conflicts(source: string): string[] {
  const found = entries(source);
  const bad: string[] = [];
  for (let i = 0; i + 1 < found.length; i += 1) {
    const [a, b] = [found[i] as Entry, found[i + 1] as Entry];
    if (a.table !== b.table) continue;
    for (const [ea, eb] of PAIRINGS) {
      const ours = source.split('\n');
      const theirs = source.split('\n');
      EDITS[ea]?.(ours, a, 'A');
      EDITS[eb]?.(theirs, b, 'B');
      if (!merges(source, ours, theirs)) bad.push(`${a.table}[${a.key}] (${ea}) × ${b.table}[${b.key}] (${eb})`);
    }
  }
  return bad;
}

/** Every ceiling two branches could move to two different values and merge without a conflict. */
function silentSameKeyMerges(source: string): string[] {
  return entries(source)
    .filter((e) => {
      const ours = source.split('\n');
      const theirs = source.split('\n');
      ours.splice(e.line, 1, moved(ours[e.line] ?? ''));
      theirs.splice(e.line, 1, moved(moved(theirs[e.line] ?? '')));
      return merges(source, ours, theirs);
    })
    .map((e) => `${e.table}[${e.key}]`);
}

describe('the ceilings in axes/weight.ts', () => {
  it('are all found, so none is left out of the merge check', () => {
    const found = entries(SOURCE);
    for (const [table, record] of Object.entries(TABLES)) {
      expect(
        found.filter((e) => e.table === table).map((e) => e.key),
        `${table} has an entry this lock cannot read. Keep one entry per line.`,
      ).toEqual(Object.keys(record));
    }
  });

  it('merge cleanly when two branches move two different ones', () => {
    expect(conflicts(SOURCE), 'put a blank line between these two entries').toEqual([]);
  });

  it('still conflict when two branches move the same one, which is what forces the re-measure', () => {
    expect(silentSameKeyMerges(SOURCE)).toEqual([]);
  });

  it('would catch two entries on adjacent lines, so the clean-merge check can fail', () => {
    const adjacent = ['export const BUNDLED_CEILING: Readonly<Record<string, number>> = {', '  first: 100,', "  'second/entry': 200,", '};', ''].join('\n');
    expect(conflicts(adjacent)).toHaveLength(PAIRINGS.length);
    const padded = ['export const BUNDLED_CEILING: Readonly<Record<string, number>> = {', '  first: 100,', '', "  'second/entry': 200,", '};', ''].join('\n');
    expect(conflicts(padded)).toEqual([]);
  });
});
