/**
 * `burgee/yargs/v17` — `burgee/yargs` for a program on yargs 17, the entry `burgee migrate`
 * writes for one (`previous-majors` R3, R4). `import` reaches this file: 17's `index.mjs`, the
 * factory, with 17's string table and `commandDir()` (`v17-factory.ts`). `require()` reaches
 * `v17.cjs`, 17's singleton.
 *
 * Every name is listed rather than `export *`'d: `burgee/yargs` exports `'module.exports'`, the
 * factory, and a star would carry it here, so a `require()` of this file would hand back 18's
 * factory instead of this namespace.
 */
import type Yargs from '../yargs.js';

import { yargs17 } from './v17-factory.js';

export {
  applyExtends,
  argsert,
  camelCase,
  decamelize,
  hideBin,
  isPromise,
  isYargsInstance,
  looksLikeNumber,
  objFilter,
  Parser,
  parseCommand,
  platformShim,
  YargsInstance,
  YError,
} from '../yargs.js';
// The types `burgee/yargs` names, from where it takes them: a `type *` over that entry would carry
// its `'module.exports'` too, as a type-only export, and the CommonJS entry could not read this one.
export type * from './types.js';
export type { DetailedArguments } from '../yargs-parser.js';
export type { ParsedCommand } from './utils.js';
export type { PlatformShim } from './shim.js';

/** 17's `index.mjs`: the factory, over a string table of its own (`v17-factory.ts`). */
const Yargs17 = yargs17() as unknown as typeof Yargs;

export default Yargs17;
