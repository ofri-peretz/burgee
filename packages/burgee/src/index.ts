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
  execute,
  run,
  type Command,
  type CommandContext,
  type RunOptions,
} from './execute.js';
export { definePlugin, Manifest, type CommandNode, type Hook, type OptionSpec, type Plugin } from './manifest.js';
