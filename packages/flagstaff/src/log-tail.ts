/**
 * A log tail, as a component (controlroom R3): the last lines of a stream, each prefixed
 * `┊`, with `◆` marking the step in progress. It draws and reads no keys — a scrollable pane
 * is controlroom's, and key input is out of flagstaff's scope.
 *
 * **The static projection appends.** It is the whole stream, every line once, in order —
 * never the window. `staticProjection` prints only the lines past what it printed last, so a
 * stream that grows prints each new line once and repaints nothing. A static of the window
 * would slide, share no prefix with what was already printed, and print the window again on
 * every line; that is the one way to get this component wrong, and the suite holds it.
 *
 * Both marks are registry glyphs (`tail`, `step`), so a plugin that ships glyphs restyles
 * the tail as it restyles a task list. Importing this module registers the built-in
 * `log-tail` component through the public `register()`, the door a plugin uses to replace it.
 */
import { heading, muted } from 'roundel/tokens';

import { type Component, glyph, register } from './plugin.js';

/** One entry of the stream: a line of output, or the start of a step. */
export type LogLine = string | { step: string };

export interface LogTailState {
  /** Every entry the stream has produced so far, oldest first. */
  lines: readonly LogLine[];
}

export interface LogTailOptions {
  /** Rows the tail shows on a terminal. Default 5; anything below 1 is 1. */
  height?: number;
}

const HEIGHT = 5;

interface Row {
  text: string;
  /** The `◆` row of the step in progress — the one the window keeps in view. */
  current: boolean;
}

const tail = (text: string): Row => ({ text: `${muted(glyph('tail'))} ${text}`, current: false });

/** An entry as rows: a line of output is `┊` per line; a step is `◆`, its continuation `┊`. */
function rows(entry: LogLine, current: boolean): Row[] {
  if (typeof entry === 'string') return entry.split('\n').map(tail);
  const [first, ...rest] = entry.step.split('\n') as [string, ...string[]];
  const mark = current ? heading(glyph('step')) : muted(glyph('step'));
  return [{ text: `${mark} ${current ? heading(first) : first}`, current }, ...rest.map(tail)];
}

/** A log tail: the whole stream, appended, off a terminal; its last `height` rows on one. */
export function logTail({ height = HEIGHT }: LogTailOptions = {}): Component<LogTailState> {
  const shown = Math.max(1, Math.floor(height));
  return {
    name: 'log-tail',
    static: ({ lines }) =>
      lines
        .flatMap((entry) => rows(entry, false))
        .map((row) => row.text)
        .join('\n'),
    frame: (_t, { lines }) => {
      const current = lines.findLastIndex((entry) => typeof entry !== 'string');
      // From the end, only as far back as the window reaches: a long stream costs its tail.
      let window: Row[] = [];
      for (let i = lines.length - 1; i >= 0 && window.length < shown; i -= 1) window = [...rows(lines[i] as LogLine, i === current), ...window];
      window = window.slice(-shown);
      // The step in progress scrolled above the window: pin its `◆` row to the top.
      if (current >= 0 && !window.some((row) => row.current)) window = [...rows(lines[current] as LogLine, true).slice(0, 1), ...window.slice(window.length - (shown - 1))];
      return window.map((row) => row.text).join('\n');
    },
  };
}

const builtin = logTail();
register({
  name: 'flagstaff',
  components: {
    'log-tail': {
      static: builtin.static,
      frame: builtin.frame,
      sample: {
        running: { lines: [{ step: 'Installing packages' }, 'npm install', 'added 12 packages'] },
        done: { lines: [{ step: 'Installing packages' }, 'npm install', 'added 12 packages', { step: 'Done' }] },
      },
    },
  },
});
