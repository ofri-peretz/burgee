/**
 * A progress bar, as a component (R2, R4).
 *
 * The static projection is the point. A bar drawn with block characters is unreadable off
 * a terminal — a pipe gets a row of `█` per state change, a screen reader gets nothing it
 * can say — so `static()` here is the count and the percentage, which is what an agent
 * parses and a person hears, and `frame()` is the bar. The two agree on the number; only
 * the drawing differs.
 *
 * There is no spinner in the bar and no elapsed-time estimate: a rate computed from two
 * samples is a guess presented as a fact, and it is the first thing to go wrong in a
 * pipeline that stalls. If a caller wants one, `label` is theirs to write.
 */
import { muted, ok } from 'roundel/tokens';

import { type Component } from './plugin.js';

export interface ProgressState {
  /** Units done so far; clamped into `[0, total]` on the way out. */
  done: number;
  total: number;
  /** What is being counted, e.g. `files`. Read in both projections. */
  label?: string;
}

export interface ProgressOptions {
  /** Cells the bar occupies on a terminal. Default 24. */
  width?: number;
  /** The two characters the bar is drawn with. Default `█` and `░`. */
  glyphs?: { filled: string; empty: string };
}

const DEFAULT_WIDTH = 24;
const PERCENT = 100;
const FILLED = '█';
const EMPTY = '░';

/** `done` inside `[0, total]`, and a total of zero reads as complete rather than as NaN. */
function ratio(state: ProgressState): number {
  if (state.total <= 0) return 1;
  return Math.min(1, Math.max(0, state.done / state.total));
}

function suffix(state: ProgressState): string {
  const label = state.label === undefined || state.label === '' ? '' : ` ${state.label}`;
  return `${state.done}/${state.total}${label}`;
}

/** A progress bar: `12/30 files · 40%` off a terminal, a drawn bar on one. */
export function progress({ width = DEFAULT_WIDTH, glyphs = { filled: FILLED, empty: EMPTY } }: ProgressOptions = {}): Component<ProgressState> {
  const percentage = (state: ProgressState): string => `${Math.round(ratio(state) * PERCENT)}%`;
  return {
    name: 'progress',
    static: (state) => `${suffix(state)} · ${percentage(state)}`,
    frame: (_t, state) => {
      const filled = Math.round(ratio(state) * width);
      return `${ok(glyphs.filled.repeat(filled))}${muted(glyphs.empty.repeat(Math.max(0, width - filled)))} ${suffix(state)}`;
    },
  };
}
