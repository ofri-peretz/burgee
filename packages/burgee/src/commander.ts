/**
 * `burgee/commander` — commander's public surface, implemented over burgee (J9: no
 * dependency on commander itself). Graded by commander's own suite; see
 * `.sdlc/intents/commander-compat/design.md` and `npm run compat`.
 */
import { Argument } from './commander/argument.js';
import { Command } from './commander/command.js';
import { Option } from './commander/option.js';

export { Argument, humanReadableArgName } from './commander/argument.js';
export {
  Command,
  useColor,
  type AddHelpTextContext,
  type AddHelpTextPosition,
  type BurgeeParseOptions,
  type CommandOptions,
  type ErrorOptions,
  type ExecutableCommandOptions,
  type HookEvent,
  type HookListener,
  type OutputConfiguration,
  type OutputContext,
  type ParseOptions,
} from './commander/command.js';
export { CommanderError, InvalidArgumentError, InvalidArgumentError as InvalidOptionArgumentError } from './commander/error.js';
export { Help, type HelpContext } from './commander/help.js';
export { DualOptions, Option } from './commander/option.js';

/** The root command, for programs that never construct their own. */
export const program = new Command();

export const createCommand = (name?: string): Command => new Command(name);
export const createOption = (flags: string, description?: string): Option => new Option(flags, description);
export const createArgument = (name: string, description?: string): Argument => new Argument(name, description);
