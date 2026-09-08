/**
 * The first-party plugin (R4). Data only — the same shape a third party writes — and it
 * reaches the registry through the public `register()` like any other, so the built-ins
 * cannot grow an API a plugin cannot reach (U4). Type-only import: this file runs nothing.
 *
 * What lives here is what a plugin may *replace*: the glyphs every component draws its
 * statuses with, and the spinner styles. The five components themselves (`spinner`,
 * `progress`, `tasks`, `box`, `table`) are factories on their own subpaths, because a
 * component is code and this file is data — and because a program that wants a progress
 * bar should not pay for a table.
 */
import { type Plugin } from './plugin.js';

const DOTS_INTERVAL = 80;
const LINE_INTERVAL = 130;

export const builtins: Plugin = {
  name: 'flagstaff',
  contract: 1,
  glyphs: { running: '…', ok: '✔', fail: '✖', warn: '⚠', info: 'ℹ' },
  spinners: {
    dots: { frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'], interval: DOTS_INTERVAL, static: '…' },
    line: { frames: ['-', '\\', '|', '/'], interval: LINE_INTERVAL, static: '…' },
  },
  // The five borders `box()` draws with, in cli-boxes' shape — so `fromCliBoxes()` can add
  // the rest of that corpus through the same door, and a plugin can replace any of them.
  // `none` is ours: a box with no border is still a box with padding.
  borders: {
    round: { topLeft: '╭', top: '─', topRight: '╮', left: '│', right: '│', bottomLeft: '╰', bottom: '─', bottomRight: '╯' },
    single: { topLeft: '┌', top: '─', topRight: '┐', left: '│', right: '│', bottomLeft: '└', bottom: '─', bottomRight: '┘' },
    double: { topLeft: '╔', top: '═', topRight: '╗', left: '║', right: '║', bottomLeft: '╚', bottom: '═', bottomRight: '╝' },
    bold: { topLeft: '┏', top: '━', topRight: '┓', left: '┃', right: '┃', bottomLeft: '┗', bottom: '━', bottomRight: '┛' },
    classic: { topLeft: '+', top: '-', topRight: '+', left: '|', right: '|', bottomLeft: '+', bottom: '-', bottomRight: '+' },
    none: { topLeft: '', top: '', topRight: '', left: '', right: '', bottomLeft: '', bottom: '', bottomRight: '' },
  },
};
