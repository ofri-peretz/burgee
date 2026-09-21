/**
 * The keypress predicates `@inquirer/core` publishes, and the keybinding sets they read.
 *
 * These are the one part of the incumbent's surface that is pure data: a `KeypressEvent` in,
 * a boolean out, no store and no terminal. `core.test.ts` grades five cases here — vim,
 * emacs, both, neither, and the theme default — and all five are about *which* names count
 * as "up" and "down", never about drawing.
 *
 * The default set is read from `INQUIRER_KEYBINDINGS` at call time rather than at import,
 * because the suite sets it with `vi.stubEnv` inside a case — and through `runtime.ts`,
 * which is the one file in caique allowed to name `process` (Y9, locked by
 * `runtime.test.ts`). A call-time read is exactly what that seam exists to make possible.
 */
import { processRuntime } from './runtime.js';

/** What `node:readline` hands a keypress listener. Widened to what the predicates read. */
export interface KeypressEvent {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  sequence?: string;
}

/** The two named keybinding sets the incumbent understands. Anything else is ignored. */
export type Keybinding = 'emacs' | 'vim';

const KEYBINDINGS = new Set<string>(['emacs', 'vim']);

const isKeybinding = (value: string): value is Keybinding => KEYBINDINGS.has(value);

/**
 * `INQUIRER_KEYBINDINGS` split on whitespace or commas, lowercased, unknown names dropped
 * and duplicates collapsed — so `'vim emacs unknown vim'` is `['vim', 'emacs']`.
 */
export function getDefaultKeybindings(): Keybinding[] {
  const env = processRuntime().env['INQUIRER_KEYBINDINGS'];
  if (env === undefined || env === '') return [];
  return [
    ...new Set(
      env
        .toLowerCase()
        .split(/[\s,]+/)
        .filter(isKeybinding),
    ),
  ];
}

/** The up arrow always; `k` under vim; `Ctrl-P` under emacs. Nothing else, ever. */
export const isUpKey = (key: KeypressEvent, keybindings: readonly Keybinding[] = []): boolean =>
  key.name === 'up' || (keybindings.includes('vim') && key.name === 'k') || (keybindings.includes('emacs') && key.ctrl === true && key.name === 'p');

/** The down arrow always; `j` under vim; `Ctrl-N` under emacs. */
export const isDownKey = (key: KeypressEvent, keybindings: readonly Keybinding[] = []): boolean =>
  key.name === 'down' || (keybindings.includes('vim') && key.name === 'j') || (keybindings.includes('emacs') && key.ctrl === true && key.name === 'n');

/** The space bar. */
export const isSpaceKey = (key: KeypressEvent): boolean => key.name === 'space';

/** Backspace. */
export const isBackspaceKey = (key: KeypressEvent): boolean => key.name === 'backspace';

/** Tab. */
export const isTabKey = (key: KeypressEvent): boolean => key.name === 'tab';

/** A digit. `name` is a single character for these, so a substring test is the whole test. */
export const isNumberKey = (key: KeypressEvent): boolean => '1234567890'.includes(key.name);

/** Enter, under either name readline gives it. */
export const isEnterKey = (key: KeypressEvent): boolean => key.name === 'enter' || key.name === 'return';

/** Whether shift was held. Returns the flag itself, so an absent flag reads as `false`. */
export const isShiftKey = (key: KeypressEvent): boolean => key.shift === true;
