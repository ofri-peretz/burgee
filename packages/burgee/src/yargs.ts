/**
 * `burgee/yargs` — yargs' public surface, implemented over burgee's own ports of yargs
 * 18, yargs-parser 22, cliui 9 and y18n 5 (J9: no dependency on any of them). Graded
 * by yargs' own suite; see `.sdlc/intents/yargs-compat/design.md` and `npm run compat`.
 *
 * The default export is what `import yargs from 'yargs'` gives: a factory taking
 * `(processArgs, cwd, parentRequire)`. The named exports are the internals yargs'
 * own tests import by file path; the oracle shims those paths to this entry.
 */
import { YargsFactory } from './yargs/factory.js';
import { shim } from './yargs/shim.js';

export { YargsInstance, isYargsInstance, type Options, type ParseCallback } from './yargs/factory.js';
export { Parser, camelCase, decamelize, looksLikeNumber, type DetailedArguments } from './yargs-parser.js';
export { applyExtends, argsert, hideBin, isPromise, objFilter, parseCommand, YError, type ParsedCommand } from './yargs/utils.js';
export { shim as platformShim, type PlatformShim } from './yargs/shim.js';

const Yargs = YargsFactory(shim);

export default Yargs;
