/**
 * `limitOptions` — the sliding window that decides which options a list shows when it is
 * taller than the terminal. Pure: options in, strings out, no terminal and no frame. It is
 * the whole of `limit-options.test.ts`, 14 cases, and every list prompt in `clack-prompts.ts`
 * draws through it.
 */
import { styleText } from 'node:util';

import { wrap } from 'linegauge/wrap';

import { type CommonOptions, type SizedOutput } from './clack-core.js';
import { processRuntime } from './runtime.js';

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 20;
const DEFAULT_ROW_PADDING = 4;
/** A list never collapses below five rows, however small the terminal claims to be. */
const MINIMUM_VISIBLE = 5;
/** How close to the bottom of the window the cursor may get before the window slides. */
const SCROLL_MARGIN = 3;

/** What `limitOptions` takes. Named as the incumbent names it, because callers import it. */
export interface LimitOptionsParams<TOption> extends CommonOptions {
  /** The list to display. */
  options: TOption[];
  /** The index of the active option. */
  cursor: number;
  /** Renders one option, told whether it is the active one. */
  style: (option: TOption, active: boolean) => string;
  /** The most options to show, before the terminal's own height is taken into account. */
  maxItems?: number | undefined;
  /** Columns taken by something else on the line — a bar, an indent. */
  columnPadding?: number | undefined;
  /** Rows taken by something else on the screen — a message, a footer. */
  rowPadding?: number | undefined;
}

const columnsOf = (output: SizedOutput): number => (typeof output.columns === 'number' ? output.columns : DEFAULT_COLUMNS);

const rowsOf = (output: SizedOutput): number => (typeof output.rows === 'number' ? output.rows : DEFAULT_ROWS);

/** One pass of `shrink`: which slice of the window to give up, and how much room there is. */
interface Shrink {
  rendered: string[][];
  lines: number;
  from: number;
  to: number;
  budget: number;
  /** Drop from the far end backwards — what "below the cursor" means. */
  fromEnd?: boolean;
}

/**
 * Drop whole options from one end of the window until the rendered lines fit.
 *
 * Counted in *lines*, not options, which is the whole reason this helper exists: one option
 * may wrap to four lines, and a window that counted options would overflow the screen by
 * three. Returns how many lines are left and how many options were given up to get there.
 */
function shrink({ rendered, lines, from, to, budget, fromEnd = false }: Shrink): { lineCount: number; removals: number } {
  let lineCount = lines;
  let removals = 0;
  const order = fromEnd ? [...Array.from({ length: Math.max(to - from, 0) }, (_unused, n) => to - 1 - n)] : [...Array.from({ length: Math.max(to - from, 0) }, (_unused, n) => from + n)];
  for (const i of order) {
    lineCount -= rendered[i]?.length ?? 0;
    removals++;
    if (lineCount <= budget) break;
  }
  return { lineCount, removals };
}

/** One window of options, styled and wrapped: what `draw` is asked for. */
interface Draw<TOption> {
  options: TOption[];
  style: (option: TOption, active: boolean) => string;
  cursor: number;
  from: number;
  to: number;
  columns: number;
}

/**
 * Style each option in `[from, to)` and wrap it, one array of lines per option.
 *
 * Kept as lines-per-option rather than one flat list because every decision after this one
 * — which end to cut, where the ellipsis goes — is made in whole options and counted in
 * lines, and flattening here would throw away the boundary both of those need.
 */
function draw<TOption>({ options, style, cursor, from, to, columns }: Draw<TOption>): string[][] {
  const rendered: string[][] = [];
  for (let i = from; i < to; i++) {
    const option = options[i];
    const styled = option === undefined ? '' : style(option, i === cursor);
    rendered.push(wrap(styled, columns, { hard: true, trim: false }).split('\n'));
  }
  return rendered;
}

/** What `fitToScreen` is given, and what it reports back once it has cut the window down. */
interface Fit {
  rendered: string[][];
  lineCount: number;
  /** The active option's position inside `rendered` — options are dropped away from it. */
  cursorIndex: number;
  budget: number;
  ellipsisAbove: boolean;
  ellipsisBelow: boolean;
}

/**
 * Cut `rendered` down until it fits, and say which ends now need an ellipsis.
 *
 * Mutates `rendered`, which is the incumbent's shape and the reason this is a function of
 * its own rather than a block inside `limitOptions`: the order of the two passes is the
 * behaviour, and it is easier to be wrong about it in the middle of eighty other lines.
 *
 * Which end is cut first depends on where the window already is. If there is an ellipsis
 * above, the options above the cursor go first; otherwise the ones below do, and the cut
 * only turns on the other end if the first pass was not enough. Each ellipsis that appears
 * costs a line of its own, taken out of the budget at the moment it becomes inevitable.
 */
function fitToScreen(fit: Fit): { ellipsisAbove: boolean; ellipsisBelow: boolean } {
  const { rendered, cursorIndex } = fit;
  let remaining = fit.lineCount;
  let budget = fit.budget;
  let ellipsisAbove = fit.ellipsisAbove;
  let ellipsisBelow = fit.ellipsisBelow;
  let removedAbove = 0;
  let removedBelow = 0;

  const above = (): { lineCount: number; removals: number } => shrink({ rendered, lines: remaining, from: 0, to: cursorIndex, budget });
  const below = (): { lineCount: number; removals: number } => shrink({ rendered, lines: remaining, from: cursorIndex + 1, to: rendered.length, budget, fromEnd: true });

  const fromAbove = (): void => {
    ({ lineCount: remaining, removals: removedAbove } = above());
    if (remaining <= budget) return;
    if (!ellipsisBelow) budget -= 1;
    ({ lineCount: remaining, removals: removedBelow } = below());
  };
  const fromBelow = (): void => {
    if (!ellipsisBelow) budget -= 1;
    ({ lineCount: remaining, removals: removedBelow } = below());
    if (remaining <= budget) return;
    budget -= 1;
    ({ lineCount: remaining, removals: removedAbove } = above());
  };

  (ellipsisAbove ? fromAbove : fromBelow)();

  if (removedAbove > 0) {
    ellipsisAbove = true;
    rendered.splice(0, removedAbove);
  }
  if (removedBelow > 0) {
    ellipsisBelow = true;
    rendered.splice(rendered.length - removedBelow, removedBelow);
  }
  return { ellipsisAbove, ellipsisBelow };
}

/**
 * The window of options a list should draw, as lines, with `...` where it was cut.
 *
 * The order of the four decisions is the behaviour, and every one of them is a graded case:
 *
 * 1. **How many options may show at all** — the smaller of `maxItems` and the rows left
 *    after `rowPadding`, but never fewer than five. "clamps to 5 rows minimum" is that
 *    floor, and it is why a list in a seven-row terminal still shows something.
 * 2. **Where the window starts** — it only slides once the cursor comes within three of the
 *    bottom, and it stops at the end of the list rather than running past it.
 * 3. **Which ends get an ellipsis** — each `...` costs a line, so it is counted before the
 *    options are, not after.
 * 4. **What to give up when the options wrapped** — options are dropped whole, away from the
 *    cursor first, and an ellipsis appears wherever something was dropped. The three
 *    "multi-line item clamping" cases are start, middle and end of that.
 */
export function limitOptions<TOption>({
  cursor,
  options,
  style,
  output = processRuntime().stdout,
  maxItems = Number.POSITIVE_INFINITY,
  columnPadding = 0,
  rowPadding = DEFAULT_ROW_PADDING,
}: LimitOptionsParams<TOption>): string[] {
  const columns = columnsOf(output) - columnPadding;
  const ellipsis = styleText('dim', '...');
  const availableRows = Math.max(rowsOf(output) - rowPadding, 0);
  const visible = Math.max(Math.min(maxItems, availableRows), MINIMUM_VISIBLE);

  let windowStart = 0;
  if (cursor >= visible - SCROLL_MARGIN) windowStart = Math.max(Math.min(cursor - visible + SCROLL_MARGIN, options.length - visible), 0);

  let ellipsisAbove = visible < options.length && windowStart > 0;
  let ellipsisBelow = visible < options.length && windowStart + visible < options.length;
  const windowEnd = Math.min(windowStart + visible, options.length);

  const first = windowStart + (ellipsisAbove ? 1 : 0);
  const last = windowEnd - (ellipsisBelow ? 1 : 0);
  const rendered = draw({ options, style, cursor, from: first, to: last, columns });
  let lineCount = (ellipsisAbove ? 1 : 0) + (ellipsisBelow ? 1 : 0) + rendered.reduce((total, lines) => total + lines.length, 0);

  if (lineCount > availableRows) {
    ({ ellipsisAbove, ellipsisBelow } = fitToScreen({ rendered, lineCount, cursorIndex: cursor - first, budget: availableRows, ellipsisAbove, ellipsisBelow }));
  }

  const out: string[] = [];
  if (ellipsisAbove) out.push(ellipsis);
  for (const lines of rendered) for (const line of lines) out.push(line);
  if (ellipsisBelow) out.push(ellipsis);
  return out;
}
