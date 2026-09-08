/**
 * The nine tokens (R3): what a program *means* — `error`, `command`, `flag` — rather than
 * the colour it happens to use. Each is `(s: string) => string` over `util.styleText`, and
 * the identity until `fly()` has decided a level above 0. This is the only file in the
 * package that emits an escape sequence.
 */
import { styleText } from 'node:util';

import { flown, type Paint, type TokenName } from './policy.js';

export type Token = (s: string) => string;

const CSI = '\u001B[';
/** Foreground back to the terminal's default; the close every colour shares. */
const FG_RESET = `${CSI}39m`;

function paint(p: Paint, s: string): string {
  if ('sgr' in p) return `${CSI}${p.sgr.join(';')}m${s}${FG_RESET}`;
  // validateStream off: the policy has already decided; styleText must not re-read the env.
  return styleText([...p], s, { validateStream: false });
}

function token(name: TokenName): Token {
  return (s) => {
    const p = flown.level === 0 ? undefined : flown.paint[name];
    return p === undefined ? s : paint(p, s);
  };
}

export const error = token('error');
export const warn = token('warn');
export const ok = token('ok');
export const hint = token('hint');
export const muted = token('muted');
export const command = token('command');
export const flag = token('flag');
export const value = token('value');
export const heading = token('heading');
