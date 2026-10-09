/**
 * controlroom — full-screen, keyboard-driven terminal screens, each with a static
 * projection for pipes, CI, screen readers and `--json`, and a drop-in path for `ink`.
 *
 * This entry is the native API: `open()` and the runtime it takes, the layout arithmetic,
 * the tab, focus and collapse reducer with the hint line generated from a keymap, and the
 * compositor. It never loads React. ink's API is `controlroom/ink`, and plugins register
 * through `controlroom/plugin`.
 *
 * The approved intent and spec it is built to are `.sdlc/intents/controlroom/intent.md` and
 * `spec.md` in https://github.com/ofri-peretz/burgee (D-158, amended by D-168).
 */

/** The reserved release's one export, kept so a program that read it still loads. */
export const status = 'reserved' as const;

/** The only value {@link status} has. */
export type Status = typeof status;

export { distribute, layout, type Contents, type Layout, type Part, type Rect, type Size, type Split } from './layout.js';
export { hints, initial, reduce, type Action, type Keymap, type ScreenState } from './tabs.js';
export { collapse, compose, fit, render, type Frame, type Pane, type Panes } from './compose.js';
export { open, type Screen, ScreenError, type ScreenOptions } from './screen.js';
export { processRuntime, type Runtime } from './runtime.js';
