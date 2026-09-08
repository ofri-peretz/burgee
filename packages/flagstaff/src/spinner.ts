/**
 * The spinner, as a component (R2): a style from the registry, a state of `{ text, status }`,
 * a static line for every mode that does not animate, and a frame for the one that does.
 * The style's `static` is its own projection; the finished statuses take the registry's glyphs,
 * so a plugin that ships glyphs changes those.
 */
import { error, hint, ok, warn } from 'roundel/tokens';

import { type Component, glyph, lookupSpinner } from './plugin.js';

export type SpinnerStatus = 'running' | 'ok' | 'fail' | 'warn' | 'info';

export interface SpinnerState {
  text: string;
  /** `running` when omitted. */
  status?: SpinnerStatus;
}

const PAINT: Record<Exclude<SpinnerStatus, 'running'>, (s: string) => string> = { ok, fail: error, warn, info: hint };

function symbol(status: SpinnerStatus, def: { static: string }): string {
  // The style's own `static` is the projection *of that style*, and U3 makes it mandatory —
  // `register()` refuses a spinner without one. So it wins here; the `running` glyph is only
  // the fallback for a style that ships none. The other statuses have no per-style projection,
  // so they take the glyph. (Reversed on 2026-09-08: the glyph came first, which made every
  // third-party `static` unreachable, since the built-in plugin always registers a `running`.)
  if (status === 'running') return def.static || glyph('running');
  return PAINT[status](glyph(status));
}

/** A spinner in the named style (`dots` by default); every style is a registered plugin's. */
export function spinner(style = 'dots'): Component<SpinnerState> {
  const def = lookupSpinner(style);
  const line = (status: SpinnerStatus, text: string): string => `${symbol(status, def)} ${text}`;
  return {
    name: 'spinner',
    interval: def.interval,
    static: (state) => line(state.status ?? 'running', state.text),
    frame: (t, state) => {
      const status = state.status ?? 'running';
      if (status !== 'running') return line(status, state.text);
      const at = Math.floor(t / def.interval) % def.frames.length;
      return `${def.frames[at] ?? ''} ${state.text}`;
    },
  };
}
