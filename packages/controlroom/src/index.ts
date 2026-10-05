/**
 * controlroom — full-screen, keyboard-driven terminal screens, each with a static
 * projection for pipes, CI, screen readers and `--json`, and a drop-in path for `ink`.
 *
 * **Reserved, and not usable yet.** This entry exports one constant and nothing else: no
 * screen, no layout, no key handling, and no `controlroom/ink`. None of it is stubbed here,
 * because an API that exists only as a signature is a claim the package cannot keep.
 *
 * What it will be, in what order, and what it must prove before it ships, is the approved
 * intent: `.sdlc/intents/controlroom/intent.md` and `spec.md` in
 * https://github.com/ofri-peretz/burgee (D-158, amended by D-168).
 */

/** Where the package stands. It changes when the first requirement ships, not before. */
export const status = 'reserved' as const;

/** The only value {@link status} has today. */
export type Status = typeof status;

export { distribute, layout, type Contents, type Layout, type Part, type Rect, type Size, type Split } from './layout.js';
export { hints, initial, reduce, type Action, type Keymap, type ScreenState } from './tabs.js';
