/**
 * The first-party plugin (R4). Data only — the same shape a third party writes — and it
 * reaches the registry through the public `register()` like any other, so the built-ins
 * cannot grow an API a plugin cannot reach (U4). Type-only import: this file runs nothing.
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
};
