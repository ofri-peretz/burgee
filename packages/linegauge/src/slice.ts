/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * R4 — cut a styled string in **display columns**, never in code units.
 *
 * `"\u001B[31mred\u001B[39m".slice(0, 3)` returns three characters of an escape sequence
 * and no red at all; that is the bug this exists to remove, and it is the same bug in every
 * hand-rolled column-cutter. Three rules, none of which a code-unit slice can honour:
 *
 *   1. **Never split a grapheme cluster.** A cluster that straddles a boundary is included
 *      whole — the cut rounds *outward*, never inward, so a slice can be one column wider
 *      than asked but never returns half a family emoji.
 *   2. **Close what is open at the cut, and reopen it at the start.** A style opened before
 *      `start` is re-emitted at the front of the result, because the caller is going to
 *      print this fragment somewhere the opener never reached.
 *   3. **A hyperlink is a style too** (`OSC 8`), closed and reopened the same way.
 *
 * Built on the same stack `wrap` uses rather than a second copy of it, which is the whole
 * consolidation: `slice-ansi` and `wrap-ansi` each carry their own, and they disagree.
 */
import { applyParameters, closingSequence, hyperlink, matchEscape, openingSequence, segmenter, type ActiveStyle } from './style.js';
import { measure } from './width.js';

/**
 * `[start, end)` in display columns. A negative or reversed range is empty rather than an
 * error, matching `String.prototype.slice`'s temperament if not its units.
 */
/** The walk's state: where we are, what is open, and what has been emitted. */
interface Cut {
  active: ActiveStyle[];
  /** Explicitly `| undefined` rather than optional: `exactOptionalPropertyTypes` is on, and
   * clearing a closed hyperlink is an assignment of `undefined`, not a deletion. */
  link: { parameters: string; uri: string } | undefined;
  column: number;
  body: string;
  started: boolean;
}

/**
 * Rule 2. Deliberately without `wrap`'s `applyLeadingResets`: that optimisation drops a
 * style whose reset immediately follows the cut, which is right for a row boundary and
 * wrong here — by the time the first kept cluster is known the walk has already run past
 * the whole plain-text segment, so the "next" sequence it would inspect belongs to text
 * this slice still contains. Reopening a style that is about to be reset costs bytes;
 * dropping one that is not costs the colour.
 */
function open(cut: Cut): void {
  if (cut.started) return;
  cut.started = true;
  cut.body += openingSequence(cut.active);
  if (cut.link !== undefined) cut.body += hyperlink(cut.link.uri, cut.link.parameters);
}

/**
 * An escape sequence: it always moves the stack, and is copied through only when the cut
 * has started and has not finished. The stack is what gets re-emitted at `start`, which is
 * why a sequence outside the range is still read.
 */
function takeEscape(cut: Cut, escape: RegExpExecArray, end: number): void {
  const groups = escape.groups ?? {};
  if (groups['sgr'] !== undefined) applyParameters(groups['sgr'], cut.active);
  else if (groups['uri'] !== undefined) cut.link = groups['uri'].length === 0 ? undefined : { parameters: groups['parameters'] ?? '', uri: groups['uri'] };
  if (cut.started && cut.column < end) cut.body += escape[0];
}

/** One run of plain text, cluster by cluster. Returns true when the range has been filled. */
function takeText(cut: Cut, run: string, start: number, end: number): boolean {
  for (const { segment } of segmenter.segment(run)) {
    const columns = measure(segment);
    // Rule 1: a cluster is in when any column it occupies is in, so a zero-width mark rides
    // with the cluster it follows rather than falling off the front of a slice.
    if (cut.column + Math.max(columns, 1) > start && cut.column < end) {
      open(cut);
      cut.body += segment;
    }
    cut.column += columns;
    if (cut.column >= end && columns > 0) return true;
  }
  return cut.column >= end;
}

/**
 * `[start, end)` in display columns. A negative or reversed range is empty rather than an
 * error, matching `String.prototype.slice`'s temperament if not its units.
 */
export function slice(string: string, start = 0, end = Number.POSITIVE_INFINITY): string {
  if (end <= start || string.length === 0) return '';
  const cut: Cut = { active: [], link: undefined, column: 0, body: '', started: false };
  let index = 0;

  while (index < string.length) {
    const escape = matchEscape(string, index);
    if (escape !== undefined) {
      takeEscape(cut, escape, end);
      index += escape[0].length;
      continue;
    }
    let run = '';
    while (index < string.length && matchEscape(string, index) === undefined) {
      run += string[index];
      index += 1;
    }
    if (takeText(cut, run, start, end)) break;
  }

  if (!cut.started) return '';
  return cut.body + (cut.link === undefined ? '' : hyperlink('')) + closingSequence(cut.active);
}
