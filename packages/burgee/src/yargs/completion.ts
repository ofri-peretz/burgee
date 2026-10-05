/**
 * yargs' completion — `--get-yargs-completions`, the custom completion function in its
 * three arities, and the bash/zsh/fish script templates — ported for `burgee/yargs`.
 */
 
import { type CommandInstance, isCommandBuilderCallback } from './command.js';
import type { PlatformShim } from './shim.js';
import type { UsageInstance } from './usage.js';
import { isPromise, parseCommand } from './utils.js';

/**
 * The three templates open and close alike, so the shared text is written once: the
 * scripts produced are upstream's byte for byte (`completion-templates.test.ts` holds
 * them to the installed yargs), and the bundle carries the header and footer once, not
 * three times.
 */
const head = `###-begin-{{app_name}}-completions-###
#
# yargs command completion script
#
# Installation: {{app_path}} {{completion_command}} `;
const foot = `###-end-{{app_name}}-completions-###
`;
/** The shell function the bash and zsh scripts define and register. */
const fn = '_{{app_name}}_yargs_completions';
/** The command every script runs to ask the program for its candidates. */
const ask = '{{app_path}} --get-yargs-completions';

export const completionShTemplate = `${head}>> ~/.bashrc
#    or {{app_path}} {{completion_command}} >> ~/.bash_profile on OSX.
#
${fn}()
{
    local cur_word args type_list

    cur_word="\${COMP_WORDS[COMP_CWORD]}"
    args=("\${COMP_WORDS[@]}")

    # ask yargs to generate completions.
    # see https://stackoverflow.com/a/40944195/7080036 for the spaces-handling awk
    mapfile -t type_list < <(${ask} "\${args[@]}")
    mapfile -t COMPREPLY < <(compgen -W "$( printf '%q ' "\${type_list[@]}" )" -- "\${cur_word}" |
        awk '/ / { print "\\""$0"\\"" } /^[^ ]+$/ { print $0 }')

    # if no match was found, fall back to filename completion
    if [ \${#COMPREPLY[@]} -eq 0 ]; then
      COMPREPLY=()
    fi

    return 0
}
complete -o bashdefault -o default -F ${fn} {{app_name}}
${foot}`;

export const completionZshTemplate = `#compdef {{app_name}}
${head}>> ~/.zshrc
#    or {{app_path}} {{completion_command}} >> ~/.zprofile on OSX.
#
${fn}()
{
  local reply
  local si=$IFS
  IFS=$'\n' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" ${ask} "\${words[@]}"))
  IFS=$si
  if [[ \${#reply} -gt 0 ]]; then
    _describe 'values' reply
  else
    _default
  fi
}
if [[ "\${zsh_eval_context[-1]}" == "loadautofunc" ]]; then
  ${fn} "$@"
else
  compdef ${fn} {{app_name}}
fi
${foot}`;

export const completionFishTemplate = `${head}> ~/.config/fish/completions/{{app_name}}.fish
#
complete -f -c {{app_name}} -a '(${ask} (commandline -o)[2..-1])'
${foot}`;

type Done = (err: Error | null, completions: string[] | undefined) => void;

/**
 * zsh's `_describe` reads `value:description`, splits at the first colon no backslash
 * escapes, then strips one level of backslashes. So a colon in the value is written `\:`,
 * and a backslash has to be written `\\` too, or it is lost (`a\b` completes as `ab`) and
 * a value ending in one swallows the separator. Upstream escapes the colon only.
 */
function escapeDescribe(s: string): string {
  return s.replace(/[\\:]/g, '\\$&');
}

export type CompletionFunction = (current: string, argv: any, ...rest: any[]) => any;

export class Completion {
  completionKey = 'get-yargs-completions';
  private aliases: Record<string, string[]> | null = null;
  private customCompletionFunction: CompletionFunction | null = null;
  private indexAfterLastReset = 0;
  private readonly zshShell: boolean;
  private readonly fishShell: boolean;
  private readonly yargs: any;
  private readonly usage: UsageInstance;
  private readonly command: CommandInstance;
  private readonly shim: PlatformShim;

  constructor(yargs: any, usage: UsageInstance, command: CommandInstance, shim: PlatformShim) {
    this.yargs = yargs;
    this.usage = usage;
    this.command = command;
    this.shim = shim;
    const shell = shim.getEnv('SHELL');
    this.zshShell = (shell?.includes('zsh') || shim.getEnv('ZSH_NAME')?.includes('zsh')) ?? false;
    this.fishShell = shell?.includes('fish') ?? false;
  }

  /**
   * A candidate with its description, in the shell's own format: fish reads `value<TAB>desc`
   * as it is, zsh's `_describe` reads `value:desc` with the value escaped, bash the bare value.
   */
  private describe(value: string, desc: string): string {
    return this.fishShell ? `${value}\t${desc}` : this.zshShell ? `${escapeDescribe(value)}:${desc}` : value;
  }

  /** A choice as a candidate: fish takes it verbatim, the others as `_describe` would read it. */
  private choice(value: string): string {
    return this.fishShell ? value : escapeDescribe(value);
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
        if (args.indexOf(commandName) === -1) completions.push(this.describe(commandName, usageCommand[1] || ''));
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
      if (choices && choices.length > 0) completions.push(...choices.map((c) => this.choice(c)));
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
      if (choice.startsWith(current)) completions.push(this.choice(choice));
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
    const descs = this.usage.getDescriptions();
    const aliasKey = this.aliases?.[key]?.find((alias) => {
      const desc = descs[alias];
      return typeof desc === 'string' && desc.length > 0;
    });
    const descFromAlias = aliasKey ? descs[aliasKey] : undefined;
    const desc = descs[key] ?? descFromAlias ?? '';
    const keyWithDesc = this.describe(key, desc.replace('__yargsString__:', '').replace(/(\r\n|\n|\r)/gm, ' '));
    const dashes = !/^--/.test(current) && /^[^0-9]$/.test(key) ? '-' : '--';
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
    let script = this.zshShell ? completionZshTemplate : this.fishShell ? completionFishTemplate : completionShTemplate;
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
