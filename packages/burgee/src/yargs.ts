/**
 * `burgee/yargs` — yargs' public surface, implemented over burgee's own ports of yargs
 * 18, yargs-parser 22, cliui 9 and y18n 5 (J9: no dependency on any of them). Graded
 * by yargs' own suite; see `.sdlc/intents/yargs-compat/spec.md` and `npm run compat`.
 *
 * The default export is what `import yargs from 'yargs'` gives: a factory taking
 * `(processArgs, cwd, parentRequire)`. The named exports are the internals yargs'
 * own tests import by file path; the oracle shims those paths to this entry.
 *
 * The types are what a typed yargs program imports from `@types/yargs` — `Argv`,
 * `Arguments`, `CommandModule`, `Options`, … — under the same names its ESM entry uses,
 * so `import yargs, { type Argv } from 'burgee/yargs'` compiles where
 * `import yargs, { type Argv } from 'yargs'` did (`yargs/types.ts`).
 */
import { YargsFactory } from './yargs/factory.js';
import { shim } from './yargs/shim.js';
import type { Argv } from './yargs/types.js';

export { YargsInstance, isYargsInstance } from './yargs/factory.js';
export { Parser, camelCase, decamelize, looksLikeNumber, type DetailedArguments } from './yargs-parser.js';
export { applyExtends, argsert, hideBin, isPromise, objFilter, parseCommand, YError, type ParsedCommand } from './yargs/utils.js';
export { shim as platformShim, type PlatformShim } from './yargs/shim.js';
export type {
  Arguments,
  ArgumentsCamelCase,
  Argv,
  AsyncCompletionFunction,
  BuilderArguments,
  BuilderCallback,
  Choices,
  CommandBuilder,
  CommandModule,
  CompletionCallback,
  Defined,
  FallbackCompletionFunction,
  InferredOptionType,
  InferredOptionTypeInner,
  InferredOptionTypePrimitive,
  InferredOptionTypes,
  MiddlewareFunction,
  Options,
  ParseCallback,
  ParserConfigurationOptions,
  PositionalOptions,
  PositionalOptionsType,
  PromiseCompletionFunction,
  RequireDirectoryOptions,
  SyncCompletionFunction,
  ToArray,
  ToNumber,
  ToString,
} from './yargs/types.js';

/**
 * Typed as @types/yargs types it (`yargs/yargs.d.ts`): a factory returning `Argv`, so a
 * typed chain infers `argv` and an instance passes wherever the program says `Argv`.
 * The instance is a `YargsInstance`; `facade-types.test.ts` holds every member `Argv`
 * declares to one that instance really has.
 */
const Yargs = YargsFactory(shim) as unknown as (processArgs?: readonly string[] | string, cwd?: string, parentRequire?: NodeJS.Require) => Argv;

// yargs' own entry does this: `'module.exports'` is what Node hands a CommonJS `require()` of
// an ES module, so `const yargs = require('burgee/yargs')` gets the factory, as from yargs.
export { Yargs as 'module.exports' };
export default Yargs;
