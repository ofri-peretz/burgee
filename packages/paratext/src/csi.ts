/**
 * `paratext/csi`: `ansi-escapes`' CSI half (`ansi-csi.ts`), plus sequences `ansi-escapes` does not
 * have. Those live here and not in `ansi-csi.ts`, because the root default spreads that module
 * whole as the drop-in's object (D-138). On 2026-10-05 the kitty helpers sat inside it, gave the
 * `ansi-escapes` default three members the incumbent lacks, and took paratext's bundle over its
 * 7,200 B ceiling.
 */
const ESC = '\u001B[';

/**
 * The kitty keyboard protocol (CSI u): push a set of progressive-enhancement flags, pop it,
 * and ask the terminal which flags are on. `controlroom/ink`'s `kittyReply` reads the answer.
 */
const kittyKeyboardPush = (flags: number): string => `${ESC}>${String(flags)}u`;
const kittyKeyboardPop = `${ESC}<u`;
const kittyKeyboardQuery = `${ESC}?u`;

export * from './ansi-csi.js';
export { kittyKeyboardPop, kittyKeyboardPush, kittyKeyboardQuery };
