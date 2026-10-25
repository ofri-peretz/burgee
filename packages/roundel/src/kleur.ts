/**
 * Copyright (c) 2026 Ofri Peretz
 * Licensed under the MIT License. Use of this source code is governed by the
 * MIT license that can be found in the LICENSE file.
 */

/**
 * `roundel/kleur` — the drop-in path for `kleur` 4 (`colour-facades` R1).
 *
 * kleur 4.1.5's default export, graded by its own `test/index.js` in `compat-oracle`: one object
 * with `enabled` and twenty-six styles. A style called with text wraps it in its open and close
 * codes, and a close of the same code inside the text is replaced by close-then-open, so an outer
 * style resumes after a nested one; called with nothing it starts a chain, `kleur.red().bold('x')`,
 * whose styles open in the order they were chained. The text is coerced as `txt + ''` does, so
 * `kleur.red(0)` is `\e[31m0\e[39m`. A chain is kleur's own object — `has`, `keys` and every style
 * bound to it — and holding one and calling it again adds a style it lacks and never one twice.
 *
 * Colour is kleur's rule, decided once at import and kept on `enabled`, which every call reads,
 * so a caller turns it off by assignment: off for a truthy `NODE_DISABLE_COLORS`, a `NO_COLOR`
 * that is set at all, or `TERM=dumb`; otherwise on for a `FORCE_COLOR` other than `0`, or when
 * stdout is a terminal, or where there is no process. The process is read through `runtime.ts`,
 * roundel's one door to it. It is not `roundel/policy`'s answer, nor colorette's, whose `NO_COLOR`
 * and `FORCE_COLOR` rules differ.
 *
 * kleur's `require()` is this one object, so the module exports it as `'module.exports'` too.
 * kleur's pitch is its speed and size, so this file is held at or under kleur's bundled bytes by
 * `scripts/subpath-weight-lock.test.ts`, and over that bar it does not ship.
 */
import { proc } from './runtime.js';

/** One style: text in, styled text out; nothing in, a chain out. As kleur declares it. */
export interface Color {
  (x: string | number): string;
  (): Kleur;
}

/** Every style, by kleur's names. */
export interface Kleur {
  black: Color;
  red: Color;
  green: Color;
  yellow: Color;
  blue: Color;
  magenta: Color;
  cyan: Color;
  white: Color;
  gray: Color;
  grey: Color;
  bgBlack: Color;
  bgRed: Color;
  bgGreen: Color;
  bgYellow: Color;
  bgBlue: Color;
  bgMagenta: Color;
  bgCyan: Color;
  bgWhite: Color;
  reset: Color;
  bold: Color;
  dim: Color;
  italic: Color;
  underline: Color;
  inverse: Color;
  hidden: Color;
  strikethrough: Color;
}

/** One style's codes: what a chain collects in `keys`. */
interface Block {
  open: string;
  close: string;
}

/** A chain: the open codes it holds, their blocks in order, and every style bound to it. */
interface Chain {
  has: number[];
  keys: Block[];
}

const env = proc?.env ?? {};

/** The style names, in kleur's order, and each one's open code. */
const NAMES = 'reset bold dim italic underline inverse hidden strikethrough black red green yellow blue magenta cyan white gray grey bgBlack bgRed bgGreen bgYellow bgBlue bgMagenta bgCyan bgWhite'.split(' ');
const OPEN = [0, 1, 2, 3, 4, 7, 8, 9, 30, 31, 32, 33, 34, 35, 36, 37, 90, 90, 40, 41, 42, 43, 44, 45, 46, 47];
/** The eight modifiers' closes; past them the ten foregrounds close on 39 and the backgrounds on 49. */
const MODIFIER_CLOSE = [0, 22, 22, 23, 24, 27, 28, 29];
const FOREGROUNDS_END = 18;
const FOREGROUND_OFF = 39;
const BACKGROUND_OFF = 49;

const sgr = (code: number): string => `\u001B[${String(code)}m`;

/** kleur's module object: `enabled`, then the styles. */
const kleur = {
  // kleur's decision, verbatim in its operands: with no process there is no environment and the
  // stream counts as a terminal; with one, its stdout's `isTTY`, whatever that holds.
  enabled: !env['NODE_DISABLE_COLORS'] && env['NO_COLOR'] == null && env['TERM'] !== 'dumb' && ((env['FORCE_COLOR'] != null && env['FORCE_COLOR'] !== '0') || (proc === undefined || proc.stdout?.isTTY)),
} as Kleur & { enabled: boolean };
// eslint-disable-next-line reliability/no-unsafe-type-narrowing -- the same object, indexed by name while its styles are written
const styles = kleur as unknown as Record<string, (this: Partial<Chain> | undefined, text?: unknown) => unknown>;

/** `text` with every block opened before it and closed after, each nested close re-opening its block. */
function run(keys: Block[], text: string): string {
  let open = '';
  let close = '';
  for (const block of keys) {
    open += block.open;
    close += block.close;
    text = text.replaceAll(block.close, block.close + block.open);
  }
  return open + text + close;
}

/** Adds `block` to a chain that does not hold `code` yet, as kleur's styles do when a chain calls them. */
function grow(ctx: Chain, code: number, block: Block): void {
  if (ctx.has.includes(code)) return;
  ctx.has.push(code);
  ctx.keys.push(block);
}

/** A new chain holding `code`, with every style bound to it. */
function chain(code: number, block: Block): Chain {
  const ctx: Chain = { has: [code], keys: [block] };
  // eslint-disable-next-line reliability/no-unsafe-type-narrowing, secure-coding/detect-object-injection -- `name` is one of `NAMES`, a module constant, and a chain carries every style as kleur's does
  for (const name of NAMES) (ctx as unknown as Record<string, unknown>)[name] = styles[name]?.bind(ctx);
  return ctx;
}

NAMES.forEach((name, i) => {
  const code = OPEN[i] as number;
  const block: Block = { open: sgr(code), close: sgr(MODIFIER_CLOSE[i] ?? (i < FOREGROUNDS_END ? FOREGROUND_OFF : BACKGROUND_OFF)) };
  // A `function`, because a chain binds it: `this` is the chain, or `kleur`, or nothing.
  // eslint-disable-next-line secure-coding/detect-object-injection -- `name` is one of `NAMES`, a module constant
  styles[name] = function (this: Partial<Chain> | undefined, text?: unknown): unknown {
    const ctx = this?.has === undefined ? undefined : (this as Chain);
    if (ctx !== undefined) grow(ctx, code, block);
    if (text === undefined) return ctx ?? chain(code, block);
    // eslint-disable-next-line modernization/prefer-template-literal -- the incumbent's coercion, which a template literal does not reproduce for an object whose `valueOf` and `toString` disagree
    return kleur.enabled ? run(ctx?.keys ?? [block], (text as string) + '') : (text as string) + '';
  };
});

// `import kleur from 'roundel/kleur'` is the drop-in, so the entry is a default, and a CommonJS
// `require('roundel/kleur')` gets the same object, as `require('kleur')` does.
// Stryker disable StringLiteral: a string export name is syntax, not a value; Stryker 10 cannot place a mutant in it and aborts the whole run
// eslint-disable-next-line import-next/no-default-export -- the incumbent's entry is its module object, and it is the whole point of this file
export { kleur as default, kleur as 'module.exports' };
// Stryker restore StringLiteral
