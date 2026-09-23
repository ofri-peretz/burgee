/**
 * The CSI half of `ansi-escapes` — move the cursor, erase, scroll, swap screens (D-138).
 *
 * Byte-exact with `ansi-escapes` 7.3.0, graded by its own suite. These are string constants
 * and a handful of formatters: unlike the OSC half they do not degrade, because the incumbent
 * does not, and a drop-in that silently dropped a cursor move would corrupt the screen of a
 * program that relied on it.
 *
 * `flagstaff` and `closeout` still emit the few sequences they need privately, and stay
 * dependency-free of this package; what moved here is the *public* surface a program imports
 * from `ansi-escapes`, which had no home in the family before.
 */
import { processRuntime } from './runtime.js';

const ESC = '\u001B[';
const SEP = ';';

/**
 * Terminal.app saves and restores the cursor with DEC's `ESC 7` / `ESC 8`, not `CSI s` / `CSI u`
 * — read once at load, as the incumbent reads it, through the package's one door to the process.
 */
const isTerminalApp = processRuntime().env['TERM_PROGRAM'] === 'Apple_Terminal';

/** `cursorTo(x)` moves along the line; `cursorTo(x, y)` to a cell. Zero-based, as upstream. */
export const cursorTo = (x: number, y?: number): string => {
  if (typeof x !== 'number') throw new TypeError('The `x` argument is required');
  return typeof y === 'number' ? `${ESC}${y + 1}${SEP}${x + 1}H` : `${ESC}${x + 1}G`;
};

/** Relative move: negative `x` is left, negative `y` is up; zero emits nothing on that axis. */
export const cursorMove = (x: number, y?: number): string => {
  if (typeof x !== 'number') throw new TypeError('The `x` argument is required');
  let out = '';
  if (x < 0) out += `${ESC}${-x}D`;
  else if (x > 0) out += `${ESC}${x}C`;
  if (y !== undefined && y < 0) out += `${ESC}${-y}A`;
  else if (y !== undefined && y > 0) out += `${ESC}${y}B`;
  return out;
};

export const cursorUp = (count = 1): string => `${ESC}${count}A`;
export const cursorDown = (count = 1): string => `${ESC}${count}B`;
export const cursorForward = (count = 1): string => `${ESC}${count}C`;
export const cursorBackward = (count = 1): string => `${ESC}${count}D`;

export const cursorLeft = `${ESC}G`;
export const cursorSavePosition = isTerminalApp ? '\u001B7' : `${ESC}s`;
export const cursorRestorePosition = isTerminalApp ? '\u001B8' : `${ESC}u`;
export const cursorGetPosition = `${ESC}6n`;
export const cursorNextLine = `${ESC}E`;
export const cursorPrevLine = `${ESC}F`;
export const cursorHide = `${ESC}?25l`;
export const cursorShow = `${ESC}?25h`;

export const eraseEndLine = `${ESC}K`;
export const eraseStartLine = `${ESC}1K`;
export const eraseLine = `${ESC}2K`;
export const eraseDown = `${ESC}J`;
export const eraseUp = `${ESC}1J`;
export const eraseScreen = `${ESC}2J`;
export const scrollUp = `${ESC}S`;
export const scrollDown = `${ESC}T`;

/** Erase `count` lines upward from the cursor's, then return to column one. */
export const eraseLines = (count: number): string => {
  let clear = '';
  for (let i = 0; i < count; i += 1) clear += eraseLine + (i < count - 1 ? cursorUp() : '');
  return count ? clear + cursorLeft : clear;
};

export const clearScreen = '\u001Bc';
export const clearViewport = `${eraseScreen}${ESC}H`;
/**
 * Erase the screen, the scrollback, and home the cursor. ponytail: upstream has a second form
 * for Windows before 10.0.10586; Node 24, this package's floor, does not run there, so it is
 * not carried.
 */
export const clearTerminal = `${eraseScreen}${ESC}3J${ESC}H`;

export const enterAlternativeScreen = `${ESC}?1049h`;
export const exitAlternativeScreen = `${ESC}?1049l`;

export const beginSynchronizedOutput = `${ESC}?2026h`;
export const endSynchronizedOutput = `${ESC}?2026l`;
export const synchronizedOutput = (text: string): string => beginSynchronizedOutput + text + endSynchronizedOutput;
