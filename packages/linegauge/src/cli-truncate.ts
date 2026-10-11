/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `linegauge/cli-truncate` — the drop-in path for `cli-truncate` 6 (`graded-override-targets` R5).
 *
 * cli-truncate's default export and its options — `position`, `space`,
 * `preferTruncationOnSpace`, `truncationCharacter` — graded by cli-truncate's own suite in
 * `compat-oracle`. Its arithmetic is cli-truncate's, step for step, because the suite asserts
 * exact strings at every edge: where a middle cut splits an odd budget, how a padded mark
 * gives up its padding, which side of a closing SGR the mark lands on. The measuring and the
 * slicing are linegauge's own `width` and `slice`, each graded level with the incumbent
 * cli-truncate depends on (`string-width`, `slice-ansi`).
 *
 * `linegauge/truncate` stays the family's API. It counts the mark inside the budget and cuts by
 * measured width, which is a different rule at the edges, and other packages depend on it.
 */
import { slice } from './slice.js';
import { width } from './width.js';

/** cli-truncate's options. */
export interface Options {
  /** Which end loses characters. Default `'end'`. */
  readonly position?: 'start' | 'middle' | 'end';
  /** A space between the text and the mark. Default `false`. */
  readonly space?: boolean;
  /** Cut at a space within three characters of the break, when there is one. Default `false`. */
  readonly preferTruncationOnSpace?: boolean;
  /** The mark that says something was removed. Default `'…'`. */
  readonly truncationCharacter?: string;
}

const POSITIONS = new Set(['start', 'middle', 'end']);
const ESC = 27;
const LEFT_BRACKET = 91;
const LETTER_M = 109;
const DIGIT_ZERO = 48;
const DIGIT_NINE = 57;
const SEMICOLON = 59;

/** A space at `wanted`, or within three characters of it in one direction, or `wanted` itself. */
function nearestSpace(string: string, wanted: number, right = false): number {
  const step = right ? 1 : -1;
  for (let offset = 0; offset <= 3; offset += 1) {
    if (string.charAt(wanted + offset * step) === ' ') return wanted + offset * step;
  }
  return wanted;
}

function validate(text: unknown, columns: unknown, position: unknown, mark: unknown): void {
  if (typeof text !== 'string') throw new TypeError(`Expected \`input\` to be a string, got ${typeof text}`);
  if (typeof columns !== 'number') throw new TypeError(`Expected \`columns\` to be a number, got ${typeof columns}`);
  if (!Number.isFinite(columns)) throw new TypeError(`Expected \`columns\` to be a finite number, got ${columns}`);
  if (!POSITIONS.has(position as string)) throw new TypeError(`Expected \`options.position\` to be either \`start\`, \`middle\` or \`end\`, got ${String(position)}`);
  if (typeof mark !== 'string') throw new TypeError(`Expected \`options.truncationCharacter\` to be a string, got ${typeof mark}`);
}

const isSgrParameter = (code: number | undefined): boolean => code !== undefined && ((code >= DIGIT_ZERO && code <= DIGIT_NINE) || code === SEMICOLON);

/** Where the run of SGR sequences at the start of `string` ends. */
function leadingSgrEnd(string: string): number {
  let index = 0;
  while (index + 2 < string.length && string.codePointAt(index) === ESC && string.codePointAt(index + 1) === LEFT_BRACKET) {
    let next = index + 2;
    while (next < string.length && isSgrParameter(string.codePointAt(next))) next += 1;
    if (next >= string.length || string.codePointAt(next) !== LETTER_M) break;
    index = next + 1;
  }
  return index;
}

/** Where the run of SGR sequences at the end of `string` starts. */
function trailingSgrStart(string: string): number {
  let start = string.length;
  while (start > 1 && string.codePointAt(start - 1) === LETTER_M) {
    let next = start - 2;
    while (next >= 0 && isSgrParameter(string.codePointAt(next))) next -= 1;
    if (next < 1 || string.codePointAt(next - 1) !== ESC || string.codePointAt(next) !== LEFT_BRACKET) break;
    start = next - 1;
  }
  return start;
}

/**
 * The mark placed inside the run of styles at `at` — the closing run for an end cut, the opening
 * run for a start cut — so it is drawn in the text's own style.
 */
const markAt = (visible: string, mark: string, at: number): string => visible.slice(0, at) + mark + visible.slice(at);

/** One truncation: the text, its budget and measured width, the options and the mark. */
interface Cut {
  text: string;
  columns: number;
  length: number;
  options: Options;
  mark: string;
}

function fromStart({ text, columns, length, options, mark }: Cut): string {
  if (options.preferTruncationOnSpace === true) {
    const visible = slice(text, nearestSpace(text, length - columns + width(mark), true), length).trim();
    return markAt(visible, mark, leadingSgrEnd(visible));
  }
  const spaced = options.space === true ? `${mark} ` : mark;
  const visible = slice(text, length - columns + width(spaced), length);
  return markAt(visible, spaced, leadingSgrEnd(visible));
}

function fromMiddle({ text, columns, length, options, mark }: Cut): string {
  let spaced = mark;
  if (options.space === true) {
    spaced = ` ${mark} `;
    // The padding goes before the mark itself does: the mark never exceeds the budget.
    if (width(spaced) >= columns) spaced = spaced.trim();
  }
  const markWidth = width(spaced);
  // Room for the mark first, then the budget split, so a small budget cannot overflow.
  const half = Math.min(Math.floor(columns / 2), Math.max(0, columns - markWidth));
  if (options.preferTruncationOnSpace === true) {
    const first = nearestSpace(text, half);
    const second = nearestSpace(text, length - (columns - half) + markWidth, true);
    return slice(text, 0, first) + spaced + slice(text, second, length).trim();
  }
  return slice(text, 0, half) + spaced + slice(text, length - (columns - half) + markWidth, length);
}

function fromEnd({ text, columns, options, mark }: Cut): string {
  const spaced = options.space === true && options.preferTruncationOnSpace !== true ? ` ${mark}` : mark;
  const end = options.preferTruncationOnSpace === true ? nearestSpace(text, columns - width(mark)) : columns - width(spaced);
  const visible = slice(text, 0, end);
  return markAt(visible, spaced, trailingSgrStart(visible));
}

/** Truncate `text` to `columns` terminal columns, as cli-truncate does. */
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is a default export, and it is the whole point of this file
export default function cliTruncate(text: string, columns: number, options: Options = {}): string {
  const { position = 'end', truncationCharacter = '…' } = options;
  validate(text, columns, position, truncationCharacter);
  if (columns < 1) return '';
  const length = width(text);
  if (length <= columns) return text;
  if (columns === 1) return truncationCharacter;
  const cut: Cut = { text, columns, length, options, mark: truncationCharacter };
  if (position === 'start') return fromStart(cut);
  if (position === 'middle') return fromMiddle(cut);
  return fromEnd(cut);
}
