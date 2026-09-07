/**
 * burgee — a command declares itself once; every surface is that declaration
 * read by a different reader.
 *
 * The public entry, and only that. The execution core lives in execute.ts so a
 * façade can import it without pulling this barrel.
 */
export { ExitCode, isExitCode, type ExitCode as ExitCodeValue } from './exit-code.js';
export {
  defineCommand,
  defineProgram,
  execute,
  run,
  type Command,
  type CommandContext,
  type Program,
  type RunOptions,
} from './execute.js';
export { renderHelp, type HelpOptions } from './help.js';
export {
  definePlugin,
  Manifest,
  type ArgumentSpec,
  type CommandNode,
  type Example,
  type Hook,
  type OptionSpec,
  type Plugin,
  type RunContext,
} from './manifest.js';
