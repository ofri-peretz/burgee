/**
 * Which checklist items a diff fires (triggerlist spec R2), and where. An item fires on a changed
 * file one of its globs matches; with a pattern, only on the added or removed lines the pattern
 * finds, each named so the reviewer reads the line that fired it and nothing else.
 */
import { matchesGlob } from 'node:path';

import { type Checklist, type Item } from './checklist.js';
import { type Changed } from './diff.js';

export interface Hit {
  readonly file: string;
  /** The line in the new file for an added line, in the old file for a removed one; absent for a file-level hit. */
  readonly line?: number;
  readonly side?: 'added' | 'removed';
}

export interface Fired {
  readonly item: Item;
  readonly at: readonly Hit[];
}

export const matchesAny = (path: string, globs: readonly string[]): boolean => globs.some((glob) => matchesGlob(path, glob));

/** A path-only item fires once per file: at its first added line, else its first removed one, else the file. */
const firstHit = (file: Changed): Hit => {
  const added = file.added[0];
  if (added !== undefined) return { file: file.path, line: added.line, side: 'added' };
  const removed = file.removed[0];
  if (removed !== undefined) return { file: file.path, line: removed.line, side: 'removed' };
  return { file: file.path };
};

const hitsIn = (item: Item, file: Changed): Hit[] => {
  const { pattern } = item.trigger;
  if (pattern === undefined) return [firstHit(file)];
  // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- the pattern is the repository's own checklist, read from the base branch and compiled once when it was parsed
  const regex = new RegExp(pattern, 'u');
  return [
    ...file.added.filter((line) => regex.test(line.text)).map((line): Hit => ({ file: file.path, line: line.line, side: 'added' })),
    ...file.removed.filter((line) => regex.test(line.text)).map((line): Hit => ({ file: file.path, line: line.line, side: 'removed' })),
  ];
};

/** The items that fire, in checklist order, each with every place it fired. */
export const match = (checklist: Checklist, files: readonly Changed[]): Fired[] =>
  checklist.items.flatMap((item) => {
    const at = files.filter((file) => matchesAny(file.path, item.trigger.paths)).flatMap((file) => hitsIn(item, file));
    return at.length === 0 ? [] : [{ item, at }];
  });

/** How many places a reviewer is shown per item before the rest are counted. */
export const SHOWN = 3;

export const where = (hit: Hit): string => {
  if (hit.line === undefined) return hit.file;
  const removed = hit.side === 'removed' ? ' (removed)' : '';
  return `${hit.file}:${String(hit.line)}${removed}`;
};

/** The text a reviewer prompt takes: per fired item, its question, its check and where it fired. */
export const toText = (fired: readonly Fired[], range: string): string => {
  if (fired.length === 0) return `no checklist item fires for ${range}`;
  const lines = [`${String(fired.length)} checklist item(s) fire for ${range}:`];
  for (const { item, at } of fired) {
    const more = at.length - SHOWN;
    lines.push('', `${item.id}: ${item.question}`, `  check: ${item.check}`, `  at: ${at.slice(0, SHOWN).map(where).join(', ')}${more > 0 ? ` and ${String(more)} more` : ''}`);
  }
  return lines.join('\n');
};
