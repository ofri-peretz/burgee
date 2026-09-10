/**
 * yargs' completion — `--get-yargs-completions`, the custom completion function in its
 * three arities, and the bash/zsh script templates — ported for `burgee/yargs`.
 */
 
import { type CommandInstance, isCommandBuilderCallback } from './command.js';
import type { PlatformShim } from './shim.js';
import type { UsageInstance } from './usage.js';
import { isPromise, parseCommand } from './utils.js';

export const completionShTemplate = `###-begin-{{app_name}}-completions-###
#
# yargs command completion script
#
# Installation: {{app_path}} {{completion_command}} >> ~/.bashrc
#    or {{app_path}} {{completion_command}} >> ~/.bash_profile on OSX.
#
_{{app_name}}_yargs_completions()
{
    local cur_word args type_list

    cur_word="\${COMP_WORDS[COMP_CWORD]}"
    args=("\${COMP_WORDS[@]}")

    # ask yargs to generate completions.
    # see https://stackoverflow.com/a/40944195/7080036 for the spaces-handling awk
    mapfile -t type_list < <({{app_path}} --get-yargs-completions "\${args[@]}")
    mapfile -t COMPREPLY < <(compgen -W "$( printf '%q ' "\${type_list[@]}" )" -- "\${cur_word}" |
        awk '/ / { print "\\""$0"\\"" } /^[^ ]+$/ { print $0 }')

    # if no match was found, fall back to filename completion
    if [ \${#COMPREPLY[@]} -eq 0 ]; then
      COMPREPLY=()
    fi

    return 0
}
complete -o bashdefault -o default -F _{{app_name}}_yargs_completions {{app_name}}
###-end-{{app_name}}-completions-###
`;

export const completionZshTemplate = `#compdef {{app_name}}
###-begin-{{app_name}}-completions-###
#
# yargs command completion script
#
# Installation: {{app_path}} {{completion_command}} >> ~/.zshrc
#    or {{app_path}} {{completion_command}} >> ~/.zprofile on OSX.
#
_{{app_name}}_yargs_completions()
{
  local reply
  local si=$IFS
  IFS=$'\n' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" {{app_path}} --get-yargs-completions "\${words[@]}"))
  IFS=$si
  if [[ \${#reply} -gt 0 ]]; then
    _describe 'values' reply
  else
    _default
  fi
}
if [[ "'\${zsh_eval_context[-1]}" == "loadautofunc" ]]; then
  _{{app_name}}_yargs_completions "$@"
else
  compdef _{{app_name}}_yargs_completions {{app_name}}
fi
###-end-{{app_name}}-completions-###
`;

type Done = (err: Error | null, completions: string[] | undefined) => void;
export type CompletionFunction = (current: string, argv: any, ...rest: any[]) => any;

export class Completion {
  completionKey = 'get-yargs-completions';
  private aliases: Record<string, string[]> | null = null;
  private customCompletionFunction: CompletionFunction | null = null;
  private indexAfterLastReset = 0;
  private readonly zshShell: boolean;
  private readonly yargs: any;
  private readonly usage: UsageInstance;
  private readonly command: CommandInstance;
  private readonly shim: PlatformShim;

  constructor(yargs: any, usage: UsageInstance, command: CommandInstance, shim: PlatformShim) {
    this.yargs = yargs;
    this.usage = usage;
    this.command = command;
    this.shim = shim;
    this.zshShell = (this.shim.getEnv('SHELL')?.includes('zsh') || this.shim.getEnv('ZSH_NAME')?.includes('zsh')) ?? false;
  }

  private defaultCompletion(args: string[], argv: any, current: string, done: Done): any {
    const handlers = this.command.getCommandHandlers();
    for (let i = 0, ii = args.length; i < ii; ++i) {
      const handler = handlers[args[i] as string];
      if (handler && handler.builder) {
        const builder = handler.builder;
        if (isCommandBuilderCallback(builder)) {
          this.indexAfterLastReset = i + 1;
          const y = this.yargs.getInternalMethods().reset();
          builder(y, true);
          return y.argv;
        }
      }
    }
    const completions: string[] = [];
    this.commandCompletions(completions, args, current);
    this.optionCompletions(completions, args, argv, current);
    this.choicesFromOptionsCompletions(completions, args, argv, current);
    this.choicesFromPositionalsCompletions(completions, args, argv, current);
    done(null, completions);
  }

  private commandCompletions(completions: string[], args: string[], current: string): void {
    const parentCommands: string[] = this.yargs.getInternalMethods().getContext().commands;
    if (!/^-/.exec(current) && parentCommands.at(-1) !== current && !this.previousArgHasChoices(args)) {
      this.usage.getCommands().forEach((usageCommand) => {
        const commandName = parseCommand(usageCommand[0]).cmd;
        if (args.indexOf(commandName) === -1) {
          if (!this.zshShell) completions.push(commandName);
          else {
            const desc = usageCommand[1] || '';
            completions.push(`${commandName.replace(/:/g, '\\:')}:${desc}`);
          }
        }
      });
    }
  }

  private optionCompletions(completions: string[], args: string[], argv: any, current: string): void {
    if ((/^-/.exec(current) || (current === '' && completions.length === 0)) && !this.previousArgHasChoices(args)) {
      const options = this.yargs.getOptions();
      const positionalKeys: string[] = this.yargs.getGroups()[this.usage.getPositionalGroupName()] || [];
      Object.keys(options.key).forEach((key) => {
        const negable = !!options.configuration['boolean-negation'] && options.boolean.includes(key);
        const isPositionalKey = positionalKeys.includes(key);
        if (!isPositionalKey && !options.hiddenOptions.includes(key) && !this.argsContainKey(args, key, negable)) {
          this.completeOptionKey(key, completions, current, negable && !!options.default[key]);
        }
      });
    }
  }

  private choicesFromOptionsCompletions(completions: string[], args: string[], _argv: any, _current: string): void {
    if (this.previousArgHasChoices(args)) {
      const choices = this.getPreviousArgChoices(args);
      if (choices && choices.length > 0) completions.push(...choices.map((c) => c.replace(/:/g, '\\:')));
    }
  }

  private choicesFromPositionalsCompletions(completions: string[], args: string[], argv: any, current: string): void {
    if (current === '' && completions.length > 0 && this.previousArgHasChoices(args)) return;
    const positionalKeys: string[] = this.yargs.getGroups()[this.usage.getPositionalGroupName()] || [];
    const offset = Math.max(this.indexAfterLastReset, this.yargs.getInternalMethods().getContext().commands.length + 1);
    const positionalKey = positionalKeys[argv._.length - offset - 1];
    if (!positionalKey) return;
    const choices: string[] = this.yargs.getOptions().choices[positionalKey] || [];
    for (const choice of choices) {
      if (choice.startsWith(current)) completions.push(choice.replace(/:/g, '\\:'));
    }
  }

  private getPreviousArgChoices(args: string[]): string[] | undefined {
    if (args.length < 1) return undefined;
    let previousArg = args.at(-1) as string;
    let filter = '';
    if (!previousArg.startsWith('-') && args.length > 1) {
      filter = previousArg;
      previousArg = args.at(-2) as string;
    }
    if (!previousArg.startsWith('-')) return undefined;
    const previousArgKey = previousArg.replace(/^-+/, '');
    const options = this.yargs.getOptions();
    const possibleAliases = [previousArgKey, ...(this.yargs.getAliases()[previousArgKey] || [])];
    let choices: string[] | undefined;
    for (const possibleAlias of possibleAliases) {
      if (Object.prototype.hasOwnProperty.call(options.key, possibleAlias) && Array.isArray(options.choices[possibleAlias])) {
        choices = options.choices[possibleAlias];
        break;
      }
    }
    if (choices) return choices.filter((choice) => !filter || choice.startsWith(filter));
    return undefined;
  }

  private previousArgHasChoices(args: string[]): boolean {
    const choices = this.getPreviousArgChoices(args);
    return choices !== undefined && choices.length > 0;
  }

  private argsContainKey(args: string[], key: string, negable: boolean): boolean {
    const argsContains = (s: string): boolean => args.indexOf((/^[^0-9]$/.test(s) ? '-' : '--') + s) !== -1;
    if (argsContains(key)) return true;
    if (negable && argsContains(`no-${key}`)) return true;
    if (this.aliases) {
      for (const alias of this.aliases[key] as string[]) {
        if (argsContains(alias)) return true;
      }
    }
    return false;
  }

  private completeOptionKey(key: string, completions: string[], current: string, negable: boolean): void {
    let keyWithDesc = key;
    if (this.zshShell) {
      const descs = this.usage.getDescriptions();
      const aliasKey = this.aliases?.[key]?.find((alias) => {
        const desc = descs[alias];
        return typeof desc === 'string' && desc.length > 0;
      });
      const descFromAlias = aliasKey ? descs[aliasKey] : undefined;
      const desc = descs[key] ?? descFromAlias ?? '';
      keyWithDesc = `${key.replace(/:/g, '\\:')}:${desc.replace('__yargsString__:', '').replace(/(\r\n|\n|\r)/gm, ' ')}`;
    }
    const startsByTwoDashes = (s: string): boolean => /^--/.test(s);
    const isShortOption = (s: string): boolean => /^[^0-9]$/.test(s);
    const dashes = !startsByTwoDashes(current) && isShortOption(key) ? '-' : '--';
    completions.push(dashes + keyWithDesc);
    if (negable) completions.push(`${dashes}no-${keyWithDesc}`);
  }

  private customCompletion(args: string[], argv: any, current: string, done: Done): any {
    this.shim.assert.notStrictEqual(this.customCompletionFunction, null);
    const fn = this.customCompletionFunction as CompletionFunction;
    if (isSyncCompletionFunction(fn)) {
      const result = fn(current, argv);
      if (isPromise(result)) {
        return result
          .then((list: string[]) => {
            this.shim.process.nextTick(() => {
              done(null, list);
            });
          })
          .catch((err: Error) => {
            this.shim.process.nextTick(() => {
              done(err, undefined);
            });
          });
      }
      return done(null, result);
    } else if (isFallbackCompletionFunction(fn)) {
      return fn(
        current,
        argv,
        (onCompleted: Done = done) => this.defaultCompletion(args, argv, current, onCompleted),
        (completions: string[]) => {
          done(null, completions);
        },
      );
    }
    return fn(current, argv, (completions: string[]) => {
      done(null, completions);
    });
  }

  getCompletion(args: string[], done: Done): any {
    const current = args.length ? (args.at(-1) as string) : '';
    const argv = this.yargs.parse(args, true);
    const completionFunction = this.customCompletionFunction
      ? (a: any) => this.customCompletion(args, a, current, done)
      : (a: any) => this.defaultCompletion(args, a, current, done);
    return isPromise(argv) ? argv.then(completionFunction) : completionFunction(argv);
  }

  generateCompletionScript($0: string, cmd: string): string {
    let script = this.zshShell ? completionZshTemplate : completionShTemplate;
    const name = this.shim.path.basename($0);
    if (/\.js$/.exec($0)) $0 = `./${$0}`;
    script = script.replace(/{{app_name}}/g, name);
    script = script.replace(/{{completion_command}}/g, cmd);
    return script.replace(/{{app_path}}/g, $0);
  }

  registerFunction(fn: CompletionFunction): void {
    this.customCompletionFunction = fn;
  }

  setParsed(parsed: { aliases: Record<string, string[]> }): void {
    this.aliases = parsed.aliases;
  }
}

export function completion(yargs: any, usage: UsageInstance, command: CommandInstance, shim: PlatformShim): Completion {
  return new Completion(yargs, usage, command, shim);
}

function isSyncCompletionFunction(fn: CompletionFunction): boolean {
  return fn.length < 3;
}

function isFallbackCompletionFunction(fn: CompletionFunction): boolean {
  return fn.length > 3;
}
