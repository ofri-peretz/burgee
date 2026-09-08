/**
 * commander's `Command`, ported method for method from commander 15 and graded by
 * commander's own suite through `compat-oracle`. The parse pipeline, the option
 * grammar, every error string and exit code are commander's — that is what makes a
 * user's existing program run unchanged (J2).
 *
 * burgee's additions sit beside it and never alter the default behaviour:
 *   - `manifest` projects the command tree, so plugins (`use`) and the generated
 *     surfaces read commander-syntax programs exactly like native ones (J7, J8);
 *   - `--json`, when the program has not declared that option itself, wraps the
 *     action's return value in the envelope (N-family);
 *   - `parse(argv, { stdout, stderr, exit })` injects the streams and the exit, and
 *     then reports through the E1 taxonomy — the harness's seam (T1).
 */
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { stripVTControlCharacters } from 'node:util';

import { Argument, humanReadableArgName, type ParseArg } from './commander-argument.js';
import { CommanderError } from './commander-error.js';
import { Help, type HelpContext } from './commander-help.js';
import { DualOptions, Option } from './commander-option.js';
import { suggestSimilar } from './commander-suggest.js';
import { ExitCode } from './exit-code.js';
import { type Effects, Manifest, type OptionSpec, type Plugin } from './manifest.js';
import { serveMcp } from './mcp.js';
import { schemaOf } from './schema.js';

export interface OutputConfiguration {
  writeOut: (str: string) => void;
  writeErr: (str: string) => void;
  outputError: (str: string, write: (str: string) => void) => void;
  getOutHelpWidth: () => number | undefined;
  getErrHelpWidth: () => number | undefined;
  getOutHasColors: () => boolean | undefined;
  getErrHasColors: () => boolean | undefined;
  stripColor: (str: string) => string;
}

export interface ParseOptions {
  from?: 'node' | 'electron' | 'user' | 'eval';
}

interface Writer {
  write: (str: string) => unknown;
}

/** burgee's additions: inject the streams and the exit, and get E1 exit codes back (T1). */
export interface BurgeeParseOptions extends ParseOptions {
  stdout?: Writer;
  stderr?: Writer;
  exit?: (code: number) => void;
}

export interface CommandOptions {
  hidden?: boolean;
  isDefault?: boolean;
  /** @deprecated since v7, replaced by hidden */
  noHelp?: boolean;
}

export interface ExecutableCommandOptions extends CommandOptions {
  executableFile?: string;
}

export interface ErrorOptions {
  code?: string;
  exitCode?: number;
}

export interface OutputContext {
  error?: boolean;
}

export type HookEvent = 'preSubcommand' | 'preAction' | 'postAction';
export type HookListener = (thisCommand: Command, actionCommand: Command) => void | Promise<void>;
export type AddHelpTextPosition = 'beforeAll' | 'before' | 'after' | 'afterAll';
export type AddHelpTextContext = { error: boolean; command: Command };

interface HelpTextEventContext {
  error: boolean;
  command: Command;
  write: (str: string) => void;
}

interface SavedState {
  _name: string;
  _optionValues: Record<string, unknown>;
  _optionValueSources: Record<string, string | undefined>;
}

interface Burgee {
  exit: ((code: number) => void) | undefined;
  json: boolean;
}

/** Names that would reach Object.prototype if used as an option key. */
const POLLUTING = new Set(['__proto__', 'constructor', 'prototype']);

const ENV_SOURCES = ['default', 'config', 'env'];
const IMPLIED_SOURCES = ['default', 'implied'];
const HOOK_EVENTS: HookEvent[] = ['preSubcommand', 'preAction', 'postAction'];
const HELP_POSITIONS: AddHelpTextPosition[] = ['beforeAll', 'before', 'after', 'afterAll'];
const SOURCE_EXT = ['.js', '.ts', '.tsx', '.mjs', '.cjs'];
const FORWARDED_SIGNALS = ['SIGUSR1', 'SIGUSR2', 'SIGTERM', 'SIGINT', 'SIGHUP'] as const;

/** Wraps in single quotes. Used where a message says "from" right before a quoted method name, which a static import scanner would otherwise read as a specifier. */
const quoted = (s: string): string => `'${s}'`;

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as { then?: unknown } | null)?.then === 'function';
}

/** commander's exit codes, read through burgee's taxonomy when the exit is injected (E1). */
function e1(err: CommanderError): number {
  switch (err.code) {
    case 'commander.helpDisplayed':
    case 'commander.version':
      return ExitCode.OK;
    case 'commander.help':
      return err.exitCode === 0 ? ExitCode.OK : ExitCode.USAGE;
    case 'commander.error':
    case 'commander.executeSubCommandAsync':
      return err.exitCode;
    default:
      return err.exitCode === 1 ? ExitCode.USAGE : err.exitCode;
  }
}

/** What a run prints for an action's return value when the streams are injected. */
function render(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return `${value}\n`;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}\n`)
      .join('');
  }
  return `${JSON.stringify(value)}\n`;
}

export class Command extends EventEmitter {
  commands: Command[] = [];
  options: Option[] = [];
  parent: Command | null = null;
  registeredArguments: Argument[] = [];
  /** @deprecated old name for registeredArguments */
  _args: Argument[];
  /** cli args with options removed */
  args: string[] = [];
  rawArgs: string[] = [];
  /** like .args but after custom processing and collecting variadic */
  processedArgs: unknown[] = [];
  runningCommand: childProcess.ChildProcess | undefined = undefined;

  _allowUnknownOption = false;
  _allowExcessArguments = false;
  _scriptPath: string | null = null;
  _name: string;
  _optionValues: Record<string, unknown> = {};
  _optionValueSources: Record<string, string | undefined> = {};
  _storeOptionsAsProperties = false;
  _actionHandler: ((args: unknown[]) => unknown) | null = null;
  _executableHandler = false;
  _executableFile: string | null = null;
  _executableDir: string | null = null;
  _defaultCommandName: string | null = null;
  _exitCallback: ((err: CommanderError) => void) | null = null;
  _aliases: string[] = [];
  _combineFlagAndOptionalValue = true;
  _description = '';
  _summary = '';
  _argsDescription: Record<string, string> | undefined = undefined;
  _enablePositionalOptions = false;
  _passThroughOptions = false;
  _lifeCycleHooks: Partial<Record<HookEvent, HookListener[]>> = {};
  _showHelpAfterError: boolean | string = false;
  _showSuggestionAfterError = true;
  _savedState: SavedState | null = null;
  _outputConfiguration: OutputConfiguration;
  _hidden = false;
  /** Lazy created on demand; null once disabled. */
  _helpOption: Option | null | undefined = undefined;
  _addImplicitHelpCommand: boolean | undefined = undefined;
  _helpCommand: Command | undefined = undefined;
  _helpConfiguration: Partial<Help> = {};
  _helpGroupHeading: string | undefined = undefined;
  _defaultCommandGroup: string | undefined = undefined;
  _defaultOptionGroup: string | undefined = undefined;
  _version: string | undefined = undefined;
  _versionOptionName: string | undefined = undefined;
  _usage: string | undefined = undefined;

  /** burgee: the root's projection, created on first use. */
  _manifest: Manifest | undefined = undefined;
  /** burgee: what this command does to the world (N6); declaring it exposes the command as an MCP tool. */
  _effects: Effects | undefined = undefined;
  /** burgee: set for the duration of a parse that injected the streams or the exit. */
  _burgee: Burgee | undefined = undefined;

  constructor(name?: string) {
    super();
    this._args = this.registeredArguments;
    this._name = name || '';
    this._outputConfiguration = {
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str),
      outputError: (str, write) => write(str),
      getOutHelpWidth: () => (process.stdout.isTTY ? process.stdout.columns : undefined),
      getErrHelpWidth: () => (process.stderr.isTTY ? process.stderr.columns : undefined),
      getOutHasColors: () => useColor() ?? (process.stdout.isTTY && process.stdout.hasColors?.()),
      getErrHasColors: () => useColor() ?? (process.stderr.isTTY && process.stderr.hasColors?.()),
      stripColor: (str) => stripVTControlCharacters(str),
    };
  }

  /** Copy settings useful to share between the root and its subcommands. */
  copyInheritedSettings(sourceCommand: Command): this {
    this._outputConfiguration = sourceCommand._outputConfiguration;
    this._helpOption = sourceCommand._helpOption;
    this._helpCommand = sourceCommand._helpCommand;
    this._helpConfiguration = sourceCommand._helpConfiguration;
    this._exitCallback = sourceCommand._exitCallback;
    this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
    this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
    this._allowExcessArguments = sourceCommand._allowExcessArguments;
    this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
    this._showHelpAfterError = sourceCommand._showHelpAfterError;
    this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
    return this;
  }

  _getCommandAndAncestors(): Command[] {
    const result: Command[] = [];
    for (let command: Command | null = this; command; command = command.parent) result.push(command);
    return result;
  }

  /**
   * Define a command. With a description as the second argument it is an executable
   * subcommand and `this` is returned; otherwise the new command is returned.
   */
  command(nameAndArgs: string, opts?: CommandOptions): Command;
  command(nameAndArgs: string, description: string, opts?: ExecutableCommandOptions): this;
  command(nameAndArgs: string, actionOptsOrExecDesc?: CommandOptions | string, execOpts?: ExecutableCommandOptions): Command {
    let desc: string | null | undefined = typeof actionOptsOrExecDesc === 'string' ? actionOptsOrExecDesc : null;
    let opts: ExecutableCommandOptions | undefined = execOpts;
    if (typeof actionOptsOrExecDesc === 'object' && actionOptsOrExecDesc !== null) {
      opts = actionOptsOrExecDesc;
      desc = null;
    }
    opts = opts ?? {};
    const [, name, args] = /([^ ]+) *(.*)/.exec(nameAndArgs) ?? [];

    const cmd = this.createCommand(name);
    if (desc) {
      cmd.description(desc);
      cmd._executableHandler = true;
    }
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    cmd._hidden = !!(opts.noHelp || opts.hidden);
    cmd._executableFile = opts.executableFile || null;
    if (args) cmd.arguments(args);
    this._registerCommand(cmd);
    cmd.parent = this;
    cmd.copyInheritedSettings(this);

    if (desc) return this;
    return cmd;
  }

  /** Factory for an unattached command; override to customise subcommands. */
  createCommand(name?: string): Command {
    return new Command(name);
  }

  createHelp(): Help {
    return Object.assign(new Help(), this.configureHelp());
  }

  configureHelp(): Partial<Help>;
  configureHelp(configuration: Partial<Help>): this;
  configureHelp(configuration?: Partial<Help>): this | Partial<Help> {
    if (configuration === undefined) return this._helpConfiguration;
    this._helpConfiguration = configuration;
    return this;
  }

  configureOutput(): OutputConfiguration;
  configureOutput(configuration: Partial<OutputConfiguration>): this;
  configureOutput(configuration?: Partial<OutputConfiguration>): this | OutputConfiguration {
    if (configuration === undefined) return this._outputConfiguration;
    this._outputConfiguration = { ...this._outputConfiguration, ...configuration };
    return this;
  }

  showHelpAfterError(displayHelp: boolean | string = true): this {
    this._showHelpAfterError = typeof displayHelp === 'string' ? displayHelp : !!displayHelp;
    return this;
  }

  showSuggestionAfterError(displaySuggestion = true): this {
    this._showSuggestionAfterError = !!displaySuggestion;
    return this;
  }

  addCommand(cmd: Command, opts?: CommandOptions): this {
    if (!cmd._name) {
      throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
    }
    opts = opts ?? {};
    if (opts.isDefault) this._defaultCommandName = cmd._name;
    if (opts.noHelp || opts.hidden) cmd._hidden = true;

    this._registerCommand(cmd);
    cmd.parent = this;
    cmd._checkForBrokenPassThrough();
    return this;
  }

  createArgument(name: string, description?: string): Argument {
    return new Argument(name, description);
  }

  argument(name: string, description?: string, parseArg?: ParseArg | unknown, defaultValue?: unknown): this {
    const argument = this.createArgument(name, description);
    if (typeof parseArg === 'function') {
      argument.default(defaultValue).argParser(parseArg as ParseArg);
    } else {
      argument.default(parseArg);
    }
    this.addArgument(argument);
    return this;
  }

  arguments(names: string): this {
    for (const detail of names.trim().split(/ +/)) this.argument(detail);
    return this;
  }

  addArgument(argument: Argument): this {
    const previousArgument = this.registeredArguments.slice(-1)[0];
    if (previousArgument?.variadic) {
      throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
    }
    if (argument.required && argument.defaultValue !== undefined && argument.parseArg === undefined) {
      throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
    }
    this.registeredArguments.push(argument);
    return this;
  }

  /** Customise or disable the default help command (added by default when there are subcommands). */
  helpCommand(enableOrNameAndArgs?: string | boolean, description?: string): this {
    if (typeof enableOrNameAndArgs === 'boolean') {
      this._addImplicitHelpCommand = enableOrNameAndArgs;
      if (enableOrNameAndArgs && this._defaultCommandGroup) {
        const helpCommand = this._getHelpCommand();
        if (helpCommand) this._initCommandGroup(helpCommand);
      }
      return this;
    }

    const nameAndArgs = enableOrNameAndArgs ?? 'help [command]';
    const [, helpName, helpArgs] = /([^ ]+) *(.*)/.exec(nameAndArgs) ?? [];
    const helpDescription = description ?? 'display help for command';

    const helpCommand = this.createCommand(helpName);
    helpCommand.helpOption(false);
    if (helpArgs) helpCommand.arguments(helpArgs);
    if (helpDescription) helpCommand.description(helpDescription);

    this._addImplicitHelpCommand = true;
    this._helpCommand = helpCommand;
    if (enableOrNameAndArgs || description) this._initCommandGroup(helpCommand);
    return this;
  }

  addHelpCommand(helpCommand: Command | string | boolean, deprecatedDescription?: string): this {
    if (typeof helpCommand !== 'object') {
      this.helpCommand(helpCommand, deprecatedDescription);
      return this;
    }
    this._addImplicitHelpCommand = true;
    this._helpCommand = helpCommand;
    this._initCommandGroup(helpCommand);
    return this;
  }

  _getHelpCommand(): Command | null {
    const hasImplicitHelpCommand =
      this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand('help'));
    if (hasImplicitHelpCommand) {
      if (this._helpCommand === undefined) this.helpCommand(undefined, undefined);
      return this._helpCommand ?? null;
    }
    return null;
  }

  hook(event: HookEvent, listener: HookListener): this {
    if (!HOOK_EVENTS.includes(event)) {
      throw new Error(`Unexpected value for event passed to hook : '${String(event)}'.
Expecting one of '${HOOK_EVENTS.join("', '")}'`);
    }
    const hooks = this._lifeCycleHooks[event];
    if (hooks) hooks.push(listener);
    else this._lifeCycleHooks[event] = [listener];
    return this;
  }

  /** Replace the call to process.exit; defaults to throwing the CommanderError. */
  exitOverride(fn?: (err: CommanderError) => void): this {
    this._exitCallback =
      fn ??
      ((err) => {
        if (err.code !== 'commander.executeSubCommandAsync') throw err;
        // Async callback from spawn events, not useful to throw.
      });
    return this;
  }

  _exit(exitCode: number, code: string, message: string): never {
    if (this._exitCallback) {
      this._exitCallback(new CommanderError(exitCode, code, message));
      // Expecting this line is not reached.
    }
    process.exit(exitCode);
  }

  // commander's contract: the positional args, then the options, then the command itself.
  action(fn: (...args: any[]) => unknown): this {
    const listener = (args: unknown[]): unknown => {
      const expectedArgsCount = this.registeredArguments.length;
      const actionArgs = args.slice(0, expectedArgsCount);
      actionArgs[expectedArgsCount] = this._storeOptionsAsProperties ? this : this.opts();
      actionArgs.push(this);
      return fn.apply(this, actionArgs);
    };
    this._actionHandler = listener;
    return this;
  }

  createOption(flags: string, description?: string): Option {
    return new Option(flags, description);
  }

  /** Wrap parseArg to turn `commander.invalidArgument` into an error with context. */
  _callParseArg(target: Option | Argument, value: string, previous: unknown, invalidArgumentMessage: string): unknown {
    try {
      return target.parseArg?.(value, previous);
    } catch (err) {
      const e = err as { code?: string; message?: string; exitCode?: number };
      if (e.code === 'commander.invalidArgument') {
        const options: ErrorOptions = { code: e.code };
        if (e.exitCode !== undefined) options.exitCode = e.exitCode;
        this.error(`${invalidArgumentMessage} ${e.message}`, options);
      }
      throw err;
    }
  }

  _registerOption(option: Option): void {
    const matchingOption = (option.short && this._findOption(option.short)) || (option.long && this._findOption(option.long));
    if (matchingOption) {
      const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
      throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
    }
    this._initOptionGroup(option);
    this.options.push(option);
  }

  _registerCommand(command: Command): void {
    const knownBy = (cmd: Command): string[] => [cmd.name()].concat(cmd.aliases());
    const alreadyUsed = knownBy(command).find((name) => this._findCommand(name));
    if (alreadyUsed) {
      const existing = this._findCommand(alreadyUsed);
      const existingCmd = existing ? knownBy(existing).join('|') : alreadyUsed;
      const newCmd = knownBy(command).join('|');
      throw new Error(`cannot add command '${newCmd}' as already have command '${existingCmd}'`);
    }
    this._initCommandGroup(command);
    this.commands.push(command);
  }

  addOption(option: Option): this {
    const oname = option.name();
    const name = option.attributeName();
    if (POLLUTING.has(name) || POLLUTING.has(oname)) {
      throw new Error(`burgee: option name "${oname}" is not allowed — it would reach Object.prototype`);
    }
    this._registerOption(option);

    if (option.defaultValue !== undefined) {
      this.setOptionValueWithSource(name, option.defaultValue, 'default');
    }

    // val is null for an optional option used without its argument, undefined for boolean and negated.
    const handleOptionValue = (val: string | null | undefined, invalidValueMessage: string, valueSource: string): void => {
      let value: unknown = val;
      if (value == null && option.presetArg !== undefined) value = option.presetArg;

      const oldValue = this.getOptionValue(name);
      if (value !== null && option.parseArg) {
        value = this._callParseArg(option, value as string, oldValue, invalidValueMessage);
      } else if (value !== null && option.variadic) {
        value = option._collectValue(value, oldValue);
      }

      if (value == null) {
        if (option.negate) value = false;
        else if (option.isBoolean() || option.optional) value = true;
        else value = ''; // not normal, parseArg might have failed or be a mock function for testing
      }
      this.setOptionValueWithSource(name, value, valueSource);
    };

    this.on(`option:${oname}`, (val?: string | null) => {
      handleOptionValue(val, `error: option '${option.flags}' argument '${val}' is invalid.`, 'cli');
    });
    if (option.envVar) {
      this.on(`optionEnv:${oname}`, (val?: string) => {
        handleOptionValue(val, `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`, 'env');
      });
    }
    return this;
  }

  _optionEx(config: { mandatory?: boolean }, flags: string, description?: string, fn?: unknown, defaultValue?: unknown): this {
    if (typeof flags === 'object' && (flags as unknown) instanceof Option) {
      throw new Error('To add an Option object use addOption() instead of option() or requiredOption()');
    }
    const option = this.createOption(flags, description);
    option.makeOptionMandatory(!!config.mandatory);
    if (typeof fn === 'function') {
      option.default(defaultValue).argParser(fn as ParseArg);
    } else if (fn instanceof RegExp) {
      // deprecated
      const regex = fn;
      option.default(defaultValue).argParser((val, def) => {
        const m = regex.exec(val);
        return m ? m[0] : def;
      });
    } else {
      option.default(fn);
    }
    return this.addOption(option);
  }

  option(flags: string, description?: string, parseArg?: ParseArg | unknown, defaultValue?: unknown): this {
    return this._optionEx({}, flags, description, parseArg, defaultValue);
  }

  requiredOption(flags: string, description?: string, parseArg?: ParseArg | unknown, defaultValue?: unknown): this {
    return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
  }

  /** `-f80` as `--flag=80` (default) versus `-fb` as `-f -b`. */
  combineFlagAndOptionalValue(combine = true): this {
    this._combineFlagAndOptionalValue = !!combine;
    return this;
  }

  allowUnknownOption(allowUnknown = true): this {
    this._allowUnknownOption = !!allowUnknown;
    return this;
  }

  allowExcessArguments(allowExcess = true): this {
    this._allowExcessArguments = !!allowExcess;
    return this;
  }

  /** Global options before subcommands only, so subcommands may reuse option names. */
  enablePositionalOptions(positional = true): this {
    this._enablePositionalOptions = !!positional;
    return this;
  }

  /** Options after the first command-argument are passed through, not parsed. */
  passThroughOptions(passThrough = true): this {
    this._passThroughOptions = !!passThrough;
    this._checkForBrokenPassThrough();
    return this;
  }

  _checkForBrokenPassThrough(): void {
    if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
      throw new Error(`passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`);
    }
  }

  storeOptionsAsProperties(storeAsProperties = true): this {
    if (this.options.length) throw new Error('call .storeOptionsAsProperties() before adding options');
    if (Object.keys(this._optionValues).length) throw new Error('call .storeOptionsAsProperties() before setting option values');
    this._storeOptionsAsProperties = !!storeAsProperties;
    return this;
  }

  getOptionValue(key: string): unknown {
    if (this._storeOptionsAsProperties) return (this as unknown as Record<string, unknown>)[key];
    return this._optionValues[key];
  }

  setOptionValue(key: string, value: unknown): this {
    return this.setOptionValueWithSource(key, value, undefined);
  }

  /** `source` is default | config | env | cli | implied. */
  setOptionValueWithSource(key: string, value: unknown, source: string | undefined): this {
    if (this._storeOptionsAsProperties) (this as unknown as Record<string, unknown>)[key] = value;
    else this._optionValues[key] = value;
    this._optionValueSources[key] = source;
    return this;
  }

  getOptionValueSource(key: string): string | undefined {
    return this._optionValueSources[key];
  }

  /** Globals overwrite locals, like optsWithGlobals. */
  getOptionValueSourceWithGlobals(key: string): string | undefined {
    let source: string | undefined;
    for (const cmd of this._getCommandAndAncestors()) {
      if (cmd.getOptionValueSource(key) !== undefined) source = cmd.getOptionValueSource(key);
    }
    return source;
  }

  /** User args from argv per `from`; sets `_scriptPath` and the default program name. */
  _prepareUserArgs(argv: readonly string[] | undefined, parseOptions?: ParseOptions): string[] {
    if (argv !== undefined && !Array.isArray(argv)) throw new Error('first parameter to parse must be array or undefined');
    parseOptions = parseOptions ?? {};

    if (argv === undefined && parseOptions.from === undefined) {
      if ((process.versions as Record<string, string | undefined>)['electron']) parseOptions.from = 'electron';
      const execArgv = process.execArgv ?? [];
      if (execArgv.includes('-e') || execArgv.includes('--eval') || execArgv.includes('-p') || execArgv.includes('--print')) {
        parseOptions.from = 'eval'; // internal usage, not documented
      }
    }

    if (argv === undefined) argv = process.argv;
    this.rawArgs = argv.slice();

    let userArgs: string[];
    switch (parseOptions.from) {
      case undefined:
      case 'node':
        this._scriptPath = argv[1] ?? null;
        userArgs = argv.slice(2);
        break;
      case 'electron':
        if ((process as { defaultApp?: boolean }).defaultApp) {
          this._scriptPath = argv[1] ?? null;
          userArgs = argv.slice(2);
        } else {
          userArgs = argv.slice(1);
        }
        break;
      case 'user':
        userArgs = argv.slice(0);
        break;
      case 'eval':
        userArgs = argv.slice(1);
        break;
      default:
        throw new Error(`unexpected parse option { from: '${String(parseOptions.from)}' }`);
    }

    if (!this._name && this._scriptPath) this.nameFromFilename(this._scriptPath);
    this._name = this._name || 'program';
    return userArgs;
  }

  /**
   * Parse argv, set options and run commands. Use `parseAsync` when an action is async.
   * With no arguments, parses process.argv and auto-detects Electron and `node --eval`.
   */
  parse(argv?: readonly string[], parseOptions?: BurgeeParseOptions): this {
    const from = this._prepareBurgee(parseOptions);
    this._prepareForParse();
    const userArgs = this._prepareUserArgs(argv, from);
    // A surface is served asynchronously; commander's synchronous parse cannot wait for it.
    this._runBurgee(() => this._burgeeSurface(userArgs).then((served) => (served ? undefined : this._parseCommand([], userArgs))));
    return this;
  }

  async parseAsync(argv?: readonly string[], parseOptions?: BurgeeParseOptions): Promise<this> {
    const from = this._prepareBurgee(parseOptions);
    this._prepareForParse();
    const userArgs = this._prepareUserArgs(argv, from);
    await this._runBurgee(async () => ((await this._burgeeSurface(userArgs)) ? undefined : this._parseCommand([], userArgs)));
    return this;
  }

  _prepareForParse(): void {
    if (this._savedState === null) {
      // Lone negated option (--no-foo without --foo) defaults to true, now that all options are known.
      for (const option of this.options) {
        if (option.negate && option.defaultValue === undefined && this.getOptionValue(option.attributeName()) === undefined) {
          const positiveLongFlag = (option.long ?? '').replace(/^--no-/, '--');
          if (!this._findOption(positiveLongFlag)) this.setOptionValueWithSource(option.attributeName(), true, 'default');
        }
      }
      this.saveStateBeforeParse();
    } else {
      this.restoreStateBeforeParse();
    }
  }

  /** Called lazily on first parse; available for subclasses to save custom state. */
  saveStateBeforeParse(): void {
    this._savedState = {
      _name: this._name,
      _optionValues: { ...this._optionValues },
      _optionValueSources: { ...this._optionValueSources },
    };
  }

  restoreStateBeforeParse(): void {
    if (this._storeOptionsAsProperties) {
      throw new Error(`Can not call parse again when storeOptionsAsProperties is true.
- either make a new Command for each call to parse, or stop storing options as properties`);
    }
    const saved = this._savedState;
    if (saved === null) return;
    this._name = saved._name;
    this._scriptPath = null;
    this.rawArgs = [];
    this._optionValues = { ...saved._optionValues };
    this._optionValueSources = { ...saved._optionValueSources };
    this.args = [];
    this.processedArgs = [];
  }

  _checkForMissingExecutable(executableFile: string, executableDir: string, subcommandName: string): void {
    if (fs.existsSync(executableFile)) return;
    const executableDirMessage = executableDir
      ? `searched for local subcommand relative to directory '${executableDir}'`
      : 'no directory for search for local subcommand, use .executableDir() to supply a custom directory';
    throw new Error(`'${executableFile}' does not exist
 - if '${subcommandName}' is not meant to be an executable command, remove description parameter from ${quoted('.command()')} and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`);
  }

  _executeSubCommand(subcommand: Command, args: string[]): void {
    args = args.slice();

    const findFile = (baseDir: string, baseName: string): string | undefined => {
      const localBin = path.resolve(baseDir, baseName);
      if (fs.existsSync(localBin)) return localBin;
      if (SOURCE_EXT.includes(path.extname(baseName))) return undefined;
      const foundExt = SOURCE_EXT.find((ext) => fs.existsSync(`${localBin}${ext}`));
      return foundExt ? `${localBin}${foundExt}` : undefined;
    };

    // Not checking for help first: can't robustly test for help flags in an external command.
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();

    let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
    let executableDir = this._executableDir || '';
    if (this._scriptPath) {
      let resolvedScriptPath: string;
      try {
        resolvedScriptPath = fs.realpathSync(this._scriptPath);
      } catch {
        resolvedScriptPath = this._scriptPath;
      }
      executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
    }

    if (executableDir) {
      let localFile = findFile(executableDir, executableFile);
      // Legacy search using the script name as prefix instead of the command name.
      if (!localFile && !subcommand._executableFile && this._scriptPath) {
        const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
        if (legacyName !== this._name) localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
      }
      executableFile = localFile || executableFile;
    }

    const launchWithNode = SOURCE_EXT.includes(path.extname(executableFile));

    let proc: childProcess.ChildProcess;
    if (process.platform !== 'win32') {
      if (launchWithNode) {
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process.execArgv).concat(args);
        proc = childProcess.spawn(process.argv[0] ?? process.execPath, args, { stdio: 'inherit' });
      } else {
        proc = childProcess.spawn(executableFile, args, { stdio: 'inherit' });
      }
    } else {
      this._checkForMissingExecutable(executableFile, executableDir, subcommand._name);
      args.unshift(executableFile);
      args = incrementNodeInspectorPort(process.execArgv).concat(args);
      proc = childProcess.spawn(process.execPath, args, { stdio: 'inherit' });
    }

    if (!proc.killed) {
      // Testing mainly to avoid leak warnings during unit tests with mocked spawn.
      for (const signal of FORWARDED_SIGNALS) {
        process.on(signal, () => {
          if (proc.killed === false && proc.exitCode === null) proc.kill(signal);
        });
      }
    }

    const exitCallback = this._exitCallback;
    proc.on('close', (code) => {
      code = code ?? 1; // null when the spawned process terminated due to a signal
      if (!exitCallback) process.exit(code);
      else exitCallback(new CommanderError(code, 'commander.executeSubCommandAsync', '(close)'));
    });
    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        this._checkForMissingExecutable(executableFile, executableDir, subcommand._name);
      } else if (err.code === 'EACCES') {
        throw new Error(`'${executableFile}' not executable`);
      }
      if (!exitCallback) {
        process.exit(1);
      } else {
        const wrappedError = new CommanderError(1, 'commander.executeSubCommandAsync', '(error)');
        wrappedError.nestedError = err;
        exitCallback(wrappedError);
      }
    });

    this.runningCommand = proc;
  }

  _dispatchSubcommand(commandName: string, operands: string[], unknown: string[]): unknown {
    const subCommand = this._findCommand(commandName);
    if (!subCommand) this.help({ error: true });

    subCommand._prepareForParse();
    let promiseChain: unknown;
    promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, 'preSubcommand');
    promiseChain = this._chainOrCall(promiseChain, () => {
      if (subCommand._executableHandler) {
        this._executeSubCommand(subCommand, operands.concat(unknown));
        return undefined;
      }
      return subCommand._parseCommand(operands, unknown);
    });
    return promiseChain;
  }

  /** `help foo`: invoke help directly if possible, or dispatch if necessary. */
  _dispatchHelpCommand(subcommandName: string | undefined): unknown {
    if (!subcommandName) this.help();
    const subCommand = this._findCommand(subcommandName);
    if (subCommand && !subCommand._executableHandler) subCommand.help();

    // Fallback to parsing the help flag to invoke the help.
    return this._dispatchSubcommand(subcommandName ?? '', [], [
      this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? '--help',
    ]);
  }

  _checkNumberOfArguments(): void {
    this.registeredArguments.forEach((arg, i) => {
      if (arg.required && this.args[i] == null) this.missingArgument(arg.name());
    });
    const last = this.registeredArguments[this.registeredArguments.length - 1];
    if (this.registeredArguments.length > 0 && last?.variadic) return;
    if (this.args.length > this.registeredArguments.length) this._excessArguments(this.args);
  }

  /** Process this.args against registeredArguments into this.processedArgs. */
  _processArguments(): void {
    const myParseArg = (argument: Argument, value: string, previous: unknown): unknown => {
      let parsedValue: unknown = value;
      if (value !== null && argument.parseArg) {
        const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
        parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
      }
      return parsedValue;
    };

    this._checkNumberOfArguments();

    const processedArgs: unknown[] = [];
    this.registeredArguments.forEach((declaredArg, index) => {
      let value: unknown = declaredArg.defaultValue;
      if (declaredArg.variadic) {
        if (index < this.args.length) {
          const rest = this.args.slice(index);
          value = declaredArg.parseArg
            ? rest.reduce<unknown>((processed, v) => myParseArg(declaredArg, v, processed), declaredArg.defaultValue)
            : rest;
        } else if (value === undefined) {
          value = [];
        }
      } else if (index < this.args.length) {
        const raw = this.args[index] ?? '';
        value = declaredArg.parseArg ? myParseArg(declaredArg, raw, declaredArg.defaultValue) : raw;
      }
      processedArgs[index] = value;
    });
    this.processedArgs = processedArgs;
  }

  /** Chain once we have a promise; call synchronously until then. */
  _chainOrCall(promise: unknown, fn: () => unknown): unknown {
    if (isThenable(promise)) return promise.then(() => fn());
    return fn();
  }

  _chainOrCallHooks(promise: unknown, event: HookEvent): unknown {
    let result = promise;
    const hooks: { hookedCommand: Command; callback: HookListener }[] = [];
    for (const hookedCommand of this._getCommandAndAncestors().reverse()) {
      for (const callback of hookedCommand._lifeCycleHooks[event] ?? []) hooks.push({ hookedCommand, callback });
    }
    if (event === 'postAction') hooks.reverse();
    for (const hookDetail of hooks) {
      result = this._chainOrCall(result, () => hookDetail.callback(hookDetail.hookedCommand, this));
    }
    return result;
  }

  _chainOrCallSubCommandHook(promise: unknown, subCommand: Command, event: HookEvent): unknown {
    let result = promise;
    for (const hook of this._lifeCycleHooks[event] ?? []) {
      result = this._chainOrCall(result, () => hook(this, subCommand));
    }
    return result;
  }

  /** Process arguments in the context of this command; returns the action result in case it is a promise. */
  _parseCommand(operands: string[], unknown: string[]): unknown {
    const parsed = this.parseOptions(unknown);
    this._parseOptionsEnv(); // after cli, so parseArg not called on both cli and env
    this._parseOptionsImplied();
    operands = operands.concat(parsed.operands);
    unknown = parsed.unknown;
    if (this._actionHandler && !this._findCommand(operands[0]) && !this._defaultCommandName) this._takeJson(unknown);
    this.args = operands.concat(unknown);

    if (operands && this._findCommand(operands[0])) {
      return this._dispatchSubcommand(operands[0] ?? '', operands.slice(1), unknown);
    }
    const helpCommand = this._getHelpCommand();
    if (helpCommand && operands[0] === helpCommand.name()) {
      return this._dispatchHelpCommand(operands[1]);
    }
    if (this._defaultCommandName) {
      this._outputHelpIfRequested(unknown); // help for the default command comes from the parent
      return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
    }
    if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
      // probably missing subcommand and no handler, user needs help (and exit)
      this.help({ error: true });
    }

    this._outputHelpIfRequested(parsed.unknown);
    this._checkForMissingMandatoryOptions();
    this._checkForConflictingOptions();

    // Not always called, to avoid masking a "better" error like unknown command.
    const checkForUnknownOptions = (): void => {
      if (parsed.unknown.length > 0) this.unknownOption(parsed.unknown[0] ?? '');
    };

    const commandEvent = `command:${this.name()}`;
    if (this._actionHandler) {
      checkForUnknownOptions();
      this._processArguments();

      let promiseChain: unknown;
      promiseChain = this._chainOrCallHooks(promiseChain, 'preAction');
      promiseChain = this._chainOrCall(promiseChain, () => this._runAction());
      if (this.parent) {
        promiseChain = this._chainOrCall(promiseChain, () => {
          this.parent?.emit(commandEvent, operands, unknown); // legacy
        });
      }
      promiseChain = this._chainOrCallHooks(promiseChain, 'postAction');
      return promiseChain;
    }
    if (this.parent?.listenerCount(commandEvent)) {
      checkForUnknownOptions();
      this._processArguments();
      this.parent.emit(commandEvent, operands, unknown); // legacy
    } else if (operands.length) {
      if (this._findCommand('*')) {
        // legacy default command
        return this._dispatchSubcommand('*', operands, unknown);
      }
      if (this.listenerCount('command:*')) {
        // skip option check, emit event for possible misspelling suggestion
        this.emit('command:*', operands, unknown);
      } else if (this.commands.length) {
        this.unknownCommand();
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    } else if (this.commands.length) {
      checkForUnknownOptions();
      // This command has subcommands and nothing hooked up at this level, so display help (and exit).
      this.help({ error: true });
    } else {
      checkForUnknownOptions();
      this._processArguments();
      // fall through for caller to handle after calling .parse()
    }
    return undefined;
  }

  _findCommand(name: string | undefined): Command | undefined {
    if (!name) return undefined;
    return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
  }

  _findOption(arg: string): Option | undefined {
    return this.options.find((option) => option.is(arg));
  }

  /** Walks up the hierarchy so a subcommand can check after displaying help. */
  _checkForMissingMandatoryOptions(): void {
    for (const cmd of this._getCommandAndAncestors()) {
      for (const anOption of cmd.options) {
        if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === undefined) {
          cmd.missingMandatoryOptionValue(anOption);
        }
      }
    }
  }

  _checkForConflictingLocalOptions(): void {
    const definedNonDefaultOptions = this.options.filter((option) => {
      const optionKey = option.attributeName();
      if (this.getOptionValue(optionKey) === undefined) return false;
      return this.getOptionValueSource(optionKey) !== 'default';
    });
    const optionsWithConflicting = definedNonDefaultOptions.filter((option) => option.conflictsWith.length > 0);
    for (const option of optionsWithConflicting) {
      const conflictingAndDefined = definedNonDefaultOptions.find((defined) => option.conflictsWith.includes(defined.attributeName()));
      if (conflictingAndDefined) this._conflictingOption(option, conflictingAndDefined);
    }
  }

  _checkForConflictingOptions(): void {
    for (const cmd of this._getCommandAndAncestors()) cmd._checkForConflictingLocalOptions();
  }

  /**
   * Parse options from `args`, removing known options, and return argv split into
   * operands and unknown arguments. Side effect: stores option values on the command.
   *
   *     --known kkk op => [op], []
   *     op --known kkk => [op], []
   *     sub --unknown uuu op => [sub], [--unknown uuu op]
   *     sub -- --unknown uuu op => [sub --unknown uuu op], []
   */
  parseOptions(args: string[]): { operands: string[]; unknown: string[] } {
    const operands: string[] = [];
    const unknown: string[] = [];
    let dest = operands;

    const maybeOption = (arg: string): boolean => arg.length > 1 && arg[0] === '-';

    const negativeNumberArg = (arg: string): boolean => {
      if (!/^-(\d+|\d*\.\d+)(e[+-]?\d+)?$/.test(arg)) return false;
      // a negative number is ok unless a digit is used as an option in the command hierarchy
      return !this._getCommandAndAncestors().some((cmd) => cmd.options.some((opt) => /^-\d$/.test(opt.short ?? '')));
    };

    let activeVariadicOption: Option | null = null;
    let activeGroup: string | null = null; // working through a group of short options, like -abc
    let i = 0;
    while (i < args.length || activeGroup) {
      const arg: string = activeGroup ?? args[i++] ?? '';
      activeGroup = null;

      if (arg === '--') {
        if (dest === unknown) dest.push(arg);
        dest.push(...args.slice(i));
        break;
      }

      if (activeVariadicOption && (!maybeOption(arg) || negativeNumberArg(arg))) {
        this.emit(`option:${activeVariadicOption.name()}`, arg);
        continue;
      }
      activeVariadicOption = null;

      if (maybeOption(arg)) {
        const option = this._findOption(arg);
        if (option) {
          if (option.required) {
            const value = args[i++];
            if (value === undefined) this.optionMissingArgument(option);
            this.emit(`option:${option.name()}`, value);
          } else if (option.optional) {
            let value: string | null = null;
            // historical behaviour: the optional value is the following arg unless it is an option
            const next = args[i];
            if (i < args.length && next !== undefined && (!maybeOption(next) || negativeNumberArg(next))) {
              value = next;
              i++;
            }
            this.emit(`option:${option.name()}`, value);
          } else {
            this.emit(`option:${option.name()}`);
          }
          activeVariadicOption = option.variadic ? option : null;
          continue;
        }
      }

      // Combined short options: eat the first one if known.
      if (arg.length > 2 && arg[0] === '-' && arg[1] !== '-') {
        const option = this._findOption(`-${arg[1]}`);
        if (option) {
          if (option.required || (option.optional && this._combineFlagAndOptionalValue)) {
            this.emit(`option:${option.name()}`, arg.slice(2));
          } else {
            this.emit(`option:${option.name()}`);
            activeGroup = `-${arg.slice(2)}`;
          }
          continue;
        }
      }

      // Known long flag with value, like --foo=bar
      if (/^--[^=]+=/.test(arg)) {
        const index = arg.indexOf('=');
        const option = this._findOption(arg.slice(0, index));
        if (option && (option.required || option.optional)) {
          this.emit(`option:${option.name()}`, arg.slice(index + 1));
          continue;
        }
      }

      // Not recognised by this command: command-argument, subcommand option, unknown option, or help.
      // An unknown option makes everything after it unknown too, for a subcommand to reprocess.
      // A negative number in a leaf command is not an unknown option.
      if (dest === operands && maybeOption(arg) && !(this.commands.length === 0 && negativeNumberArg(arg))) {
        dest = unknown;
      }

      // Positional options: stop processing our options at a subcommand.
      if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
        if (this._findCommand(arg)) {
          operands.push(arg);
          unknown.push(...args.slice(i));
          break;
        } else if (arg === this._getHelpCommand()?.name()) {
          operands.push(arg, ...args.slice(i));
          break;
        } else if (this._defaultCommandName) {
          unknown.push(arg, ...args.slice(i));
          break;
        }
      }

      // Pass-through options: stop processing options at the first command-argument.
      if (this._passThroughOptions) {
        dest.push(arg, ...args.slice(i));
        break;
      }

      dest.push(arg);
    }

    return { operands, unknown };
  }

  /** Local option values as key-value pairs. */
  opts(): Record<string, unknown> {
    if (this._storeOptionsAsProperties) {
      const result: Record<string, unknown> = {};
      for (const option of this.options) {
        const key = option.attributeName();
        result[key] = key === this._versionOptionName ? this._version : (this as unknown as Record<string, unknown>)[key];
      }
      return result;
    }
    return this._optionValues;
  }

  /** Merged local and global option values; globals overwrite locals. */
  optsWithGlobals(): Record<string, unknown> {
    return this._getCommandAndAncestors().reduce<Record<string, unknown>>((combined, cmd) => Object.assign(combined, cmd.opts()), {});
  }

  /** Display an error message and exit (or call exitOverride). */
  error(message: string, errorOptions?: ErrorOptions): never {
    this._outputConfiguration.outputError(`${message}\n`, this._outputConfiguration.writeErr);
    if (typeof this._showHelpAfterError === 'string') {
      this._outputConfiguration.writeErr(`${this._showHelpAfterError}\n`);
    } else if (this._showHelpAfterError) {
      this._outputConfiguration.writeErr('\n');
      this.outputHelp({ error: true });
    }
    const config = errorOptions ?? {};
    const exitCode = config.exitCode || 1;
    const code = config.code || 'commander.error';
    this._exit(exitCode, code, message);
  }

  /** Apply environment variables to options that have no value from the cli or client code. */
  _parseOptionsEnv(): void {
    for (const option of this.options) {
      if (option.envVar && option.envVar in process.env) {
        const optionKey = option.attributeName();
        // Do not overwrite cli values or values from an unknown (client-code) source.
        if (this.getOptionValue(optionKey) === undefined || ENV_SOURCES.includes(this.getOptionValueSource(optionKey) ?? '')) {
          if (option.required || option.optional) this.emit(`optionEnv:${option.name()}`, process.env[option.envVar]);
          else this.emit(`optionEnv:${option.name()}`);
        }
      }
    }
  }

  /** Apply implied option values where the option is undefined or at its default. */
  _parseOptionsImplied(): void {
    const dualHelper = new DualOptions(this.options);
    const hasCustomOptionValue = (optionKey: string): boolean =>
      this.getOptionValue(optionKey) !== undefined && !IMPLIED_SOURCES.includes(this.getOptionValueSource(optionKey) ?? '');
    const implying = this.options.filter(
      (option) =>
        option.implied !== undefined &&
        hasCustomOptionValue(option.attributeName()) &&
        dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option),
    );
    for (const option of implying) {
      for (const impliedKey of Object.keys(option.implied ?? {})) {
        if (!hasCustomOptionValue(impliedKey)) this.setOptionValueWithSource(impliedKey, option.implied?.[impliedKey], 'implied');
      }
    }
  }

  missingArgument(name: string): never {
    this.error(`error: missing required argument '${name}'`, { code: 'commander.missingArgument' });
  }

  optionMissingArgument(option: Option): never {
    this.error(`error: option '${option.flags}' argument missing`, { code: 'commander.optionMissingArgument' });
  }

  missingMandatoryOptionValue(option: Option): never {
    this.error(`error: required option '${option.flags}' not specified`, { code: 'commander.missingMandatoryOptionValue' });
  }

  _conflictingOption(option: Option, conflictingOption: Option): never {
    // The caller does not know whether a negated option is the source of the value; take an educated guess.
    const findBestOptionFromValue = (candidate: Option): Option => {
      const optionKey = candidate.attributeName();
      const optionValue = this.getOptionValue(optionKey);
      const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
      const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
      if (
        negativeOption &&
        ((negativeOption.presetArg === undefined && optionValue === false) ||
          (negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg))
      ) {
        return negativeOption;
      }
      return positiveOption ?? candidate;
    };
    const getErrorMessage = (candidate: Option): string => {
      const bestOption = findBestOptionFromValue(candidate);
      const source = this.getOptionValueSource(bestOption.attributeName());
      if (source === 'env') return `environment variable '${bestOption.envVar}'`;
      return `option '${bestOption.flags}'`;
    };
    const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
    this.error(message, { code: 'commander.conflictingOption' });
  }

  unknownOption(flag: string): void {
    if (this._allowUnknownOption) return;
    let suggestion = '';
    if (flag.startsWith('--') && this._showSuggestionAfterError) {
      // Looping to pick up the global options too.
      let candidateFlags: string[] = [];
      let command: Command | null = this;
      do {
        const moreFlags = command
          .createHelp()
          .visibleOptions(command)
          .filter((option) => option.long)
          .map((option) => option.long ?? '');
        candidateFlags = candidateFlags.concat(moreFlags);
        command = command.parent;
      } while (command && !command._enablePositionalOptions);
      suggestion = suggestSimilar(flag, candidateFlags);
    }
    this.error(`error: unknown option '${flag}'${suggestion}`, { code: 'commander.unknownOption' });
  }

  _excessArguments(receivedArgs: string[]): void {
    if (this._allowExcessArguments) return;
    const expected = this.registeredArguments.length;
    const s = expected === 1 ? '' : 's';
    const received = receivedArgs.length;
    const forSubcommand = this.parent ? ` for '${this.name()}'` : '';
    const details = receivedArgs.join(', ');
    const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${received}: ${details}.`;
    this.error(message, { code: 'commander.excessArguments' });
  }

  unknownCommand(): never {
    const unknownName = this.args[0] ?? '';
    let suggestion = '';
    if (this._showSuggestionAfterError) {
      const candidateNames: string[] = [];
      for (const command of this.createHelp().visibleCommands(this)) {
        candidateNames.push(command.name());
        const alias = command.alias();
        if (alias) candidateNames.push(alias);
      }
      suggestion = suggestSimilar(unknownName, candidateNames);
    }
    this.error(`error: unknown command '${unknownName}'${suggestion}`, { code: 'commander.unknownCommand' });
  }

  /** Get or set the version; registers `-V, --version` (or the given flags). */
  version(): string | undefined;
  version(str: string, flags?: string, description?: string): this;
  version(str?: string, flags?: string, description?: string): this | string | undefined {
    if (str === undefined) return this._version;
    this._version = str;
    flags = flags || '-V, --version';
    description = description || 'output the version number';
    const versionOption = this.createOption(flags, description);
    this._versionOptionName = versionOption.attributeName();
    this._registerOption(versionOption);
    this.on(`option:${versionOption.name()}`, () => {
      this._outputConfiguration.writeOut(`${str}\n`);
      this._exit(0, 'commander.version', str);
    });
    return this;
  }

  description(): string;
  description(str: string, argsDescription?: Record<string, string>): this;
  description(str?: string, argsDescription?: Record<string, string>): this | string {
    if (str === undefined && argsDescription === undefined) return this._description;
    this._description = str ?? '';
    if (argsDescription) this._argsDescription = argsDescription;
    return this;
  }

  /** Summary, used when listed as a subcommand of the parent. */
  summary(): string;
  summary(str: string): this;
  summary(str?: string): this | string {
    if (str === undefined) return this._summary;
    this._summary = str;
    return this;
  }

  /** Add an alias; only the first is shown in help. */
  alias(): string | undefined;
  alias(alias: string): this;
  alias(alias?: string): this | string | undefined {
    if (alias === undefined) return this._aliases[0];

    let command: Command = this;
    const last = this.commands[this.commands.length - 1];
    if (this.commands.length !== 0 && last?._executableHandler) {
      // assume adding an alias for the last added executable subcommand, rather than this
      command = last;
    }
    if (alias === command._name) throw new Error("Command alias can't be the same as its name");
    const matchingCommand = this.parent?._findCommand(alias);
    if (matchingCommand) {
      const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join('|');
      throw new Error(`cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`);
    }
    command._aliases.push(alias);
    return this;
  }

  aliases(): string[];
  aliases(aliases: string[]): this;
  aliases(aliases?: string[]): this | string[] {
    if (aliases === undefined) return this._aliases;
    for (const alias of aliases) this.alias(alias);
    return this;
  }

  usage(): string;
  usage(str: string): this;
  usage(str?: string): this | string {
    if (str === undefined) {
      if (this._usage) return this._usage;
      const args = this.registeredArguments.map((arg) => humanReadableArgName(arg));
      return ([] as string[])
        .concat(
          this.options.length || this._helpOption !== null ? '[options]' : [],
          this.commands.length ? '[command]' : [],
          this.registeredArguments.length ? args : [],
        )
        .join(' ');
    }
    this._usage = str;
    return this;
  }

  name(): string;
  name(str: string): this;
  name(str?: string): this | string {
    if (str === undefined) return this._name;
    this._name = str;
    return this;
  }

  helpGroup(): string;
  helpGroup(heading: string): this;
  helpGroup(heading?: string): this | string {
    if (heading === undefined) return this._helpGroupHeading ?? '';
    this._helpGroupHeading = heading;
    return this;
  }

  /** Default help group for subcommands added to this command. */
  commandsGroup(): string;
  commandsGroup(heading: string): this;
  commandsGroup(heading?: string): this | string {
    if (heading === undefined) return this._defaultCommandGroup ?? '';
    this._defaultCommandGroup = heading;
    return this;
  }

  /** Default help group for options added to this command. */
  optionsGroup(): string;
  optionsGroup(heading: string): this;
  optionsGroup(heading?: string): this | string {
    if (heading === undefined) return this._defaultOptionGroup ?? '';
    this._defaultOptionGroup = heading;
    return this;
  }

  _initOptionGroup(option: Option): void {
    if (this._defaultOptionGroup && !option.helpGroupHeading) option.helpGroup(this._defaultOptionGroup);
  }

  _initCommandGroup(cmd: Command): void {
    if (this._defaultCommandGroup && !cmd.helpGroup()) cmd.helpGroup(this._defaultCommandGroup);
  }

  /** Name the command from a script filename, such as process.argv[1] or import.meta.filename. */
  nameFromFilename(filename: string): this {
    this._name = path.basename(filename, path.extname(filename));
    return this;
  }

  executableDir(): string | null;
  executableDir(dir: string): this;
  executableDir(dir?: string): this | string | null {
    if (dir === undefined) return this._executableDir;
    this._executableDir = dir;
    return this;
  }

  helpInformation(contextOptions?: OutputContext): string {
    const helper = this.createHelp();
    const context = this._getOutputContext(contextOptions);
    const prepared: HelpContext = { error: context.error };
    if (context.helpWidth !== undefined) prepared.helpWidth = context.helpWidth;
    if (context.hasColors !== undefined) prepared.outputHasColors = context.hasColors;
    helper.prepareContext(prepared);
    const text = helper.formatHelp(this, helper);
    if (context.hasColors) return text;
    return this._outputConfiguration.stripColor(text);
  }

  _getOutputContext(contextOptions?: OutputContext): {
    error: boolean;
    write: (str: string) => void;
    hasColors: boolean | undefined;
    helpWidth: number | undefined;
  } {
    const error = !!contextOptions?.error;
    let baseWrite: (str: string) => void;
    let hasColors: boolean | undefined;
    let helpWidth: number | undefined;
    if (error) {
      baseWrite = (str) => this._outputConfiguration.writeErr(str);
      hasColors = this._outputConfiguration.getErrHasColors();
      helpWidth = this._outputConfiguration.getErrHelpWidth();
    } else {
      baseWrite = (str) => this._outputConfiguration.writeOut(str);
      hasColors = this._outputConfiguration.getOutHasColors();
      helpWidth = this._outputConfiguration.getOutHelpWidth();
    }
    const write = (str: string): void => {
      if (!hasColors) str = this._outputConfiguration.stripColor(str);
      baseWrite(str);
    };
    return { error, write, hasColors, helpWidth };
  }

  /** Output built-in help plus any text added with `addHelpText`. */
  outputHelp(contextOptions?: OutputContext | ((text: string) => string | Buffer)): void {
    let deprecatedCallback: ((text: string) => string | Buffer) | undefined;
    if (typeof contextOptions === 'function') {
      deprecatedCallback = contextOptions;
      contextOptions = undefined;
    }
    const outputContext = this._getOutputContext(contextOptions);
    const eventContext: HelpTextEventContext = { error: outputContext.error, write: outputContext.write, command: this };

    for (const command of this._getCommandAndAncestors().reverse()) command.emit('beforeAllHelp', eventContext);
    this.emit('beforeHelp', eventContext);

    let helpInformation: string | Buffer = this.helpInformation({ error: outputContext.error });
    if (deprecatedCallback) {
      helpInformation = deprecatedCallback(helpInformation);
      if (typeof helpInformation !== 'string' && !Buffer.isBuffer(helpInformation)) {
        throw new Error('outputHelp callback must return a string or a Buffer');
      }
    }
    outputContext.write(String(helpInformation));

    const helpLong = this._getHelpOption()?.long;
    if (helpLong) this.emit(helpLong); // deprecated
    this.emit('afterHelp', eventContext);
    for (const command of this._getCommandAndAncestors()) command.emit('afterAllHelp', eventContext);
  }

  /** Customise the built-in help option, or pass false to disable it. */
  helpOption(flags?: string | boolean, description?: string): this {
    if (typeof flags === 'boolean') {
      if (flags) {
        if (this._helpOption === null) this._helpOption = undefined; // reenable
        if (this._defaultOptionGroup) {
          const helpOption = this._getHelpOption();
          if (helpOption) this._initOptionGroup(helpOption);
        }
      } else {
        this._helpOption = null; // disable
      }
      return this;
    }
    this._helpOption = this.createOption(flags ?? '-h, --help', description ?? 'display help for command');
    if (flags || description) this._initOptionGroup(this._helpOption);
    return this;
  }

  /** Lazily created; null once disabled with `helpOption(false)`. */
  _getHelpOption(): Option | null {
    if (this._helpOption === undefined) this.helpOption(undefined, undefined);
    return this._helpOption ?? null;
  }

  addHelpOption(option: Option): this {
    this._helpOption = option;
    this._initOptionGroup(option);
    return this;
  }

  /** Output help and exit. */
  help(contextOptions?: OutputContext | ((text: string) => string | Buffer)): never {
    this.outputHelp(contextOptions);
    let exitCode = Number(process.exitCode ?? 0);
    if (exitCode === 0 && contextOptions && typeof contextOptions !== 'function' && contextOptions.error) exitCode = 1;
    // message: not all displayed text is available, so only a placeholder is passed.
    this._exit(exitCode, 'commander.help', '(outputHelp)');
  }

  /** Extra help text: 'before'/'after' for this command, 'beforeAll'/'afterAll' for its subcommands too. */
  addHelpText(position: AddHelpTextPosition, text: string | ((context: AddHelpTextContext) => string)): this {
    if (!HELP_POSITIONS.includes(position)) {
      throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${HELP_POSITIONS.join("', '")}'`);
    }
    this.on(`${position}Help`, (context: HelpTextEventContext) => {
      const helpStr = typeof text === 'function' ? text({ error: context.error, command: context.command }) : text;
      if (helpStr) context.write(`${helpStr}\n`);
    });
    return this;
  }

  _outputHelpIfRequested(args: string[]): void {
    const helpOption = this._getHelpOption();
    if (helpOption && args.find((arg) => helpOption.is(arg))) {
      this.outputHelp();
      this._exit(0, 'commander.helpDisplayed', '(outputHelp)');
    }
  }

  // ───── burgee: the manifest projection, plugins, `--json` and the injected seam ─────

  _root(): Command {
    let command: Command = this;
    while (command.parent) command = command.parent;
    return command;
  }

  /**
   * The manifest every surface reads. Projected from the command tree on each access,
   * so it is never stale; plugin-contributed nodes are kept across projections.
   */
  get manifest(): Manifest {
    const root = this._root();
    root._manifest ??= new Manifest();
    root._project(root._manifest);
    return root._manifest;
  }

  _project(manifest: Manifest): void {
    const contributed = manifest.commands.filter((c) => c.plugin !== undefined);
    manifest.commands.splice(0, manifest.commands.length, ...contributed);
    const rootName = this._name || 'program';
    manifest.rootPath = [rootName];
    if (this._version !== undefined) manifest.version = this._version;
    const visit = (cmd: Command, at: string[]): void => {
      manifest.add({
        path: at,
        ...(cmd._description ? { description: cmd._description } : {}),
        ...(cmd._summary ? { summary: cmd._summary } : {}),
        ...(cmd._effects === undefined ? {} : { effects: cmd._effects }),
        ...(cmd._hidden ? { hidden: true } : {}),
        options: cmd._optionSpecs(),
        arguments: cmd.registeredArguments.map((a) => ({ name: a.name(), required: a.required, variadic: a.variadic, ...(a.description ? { description: a.description } : {}) })),
        ...(cmd._actionHandler === null ? {} : { run: () => undefined }),
      });
      for (const sub of cmd.commands) visit(sub, [...at, sub._name]);
    };
    visit(this, [rootName]);
  }

  /** Options as the manifest describes them, on a null-prototype record. */
  _optionSpecs(): Record<string, OptionSpec> {
    const specs = Object.create(null) as Record<string, OptionSpec>;
    for (const option of this.options) {
      const spec: OptionSpec = { type: option.required || option.optional ? 'string' : 'boolean' };
      if (option.description) spec.description = option.description;
      if (option.mandatory) spec.required = true;
      if (option.short && option.long) spec.short = option.short.slice(1);
      if (typeof option.defaultValue === 'string' || typeof option.defaultValue === 'boolean') spec.default = option.defaultValue;
      if (option.envVar) spec.env = option.envVar;
      Object.defineProperty(specs, option.attributeName(), { value: spec, enumerable: true, writable: true, configurable: true });
    }
    return specs;
  }

  /** burgee: declare what the command does to the world (N6). This is what exposes it as an MCP tool (N2). */
  effects(value: Effects): this {
    this._effects = value;
    return this;
  }

  /**
   * burgee: `--schema` and `--mcp` on a commander-syntax program, from its manifest (J2).
   * Only when the program declares neither option itself; `--mcp` runs commands through
   * this very program with the streams captured, so tool results are the `--json` envelope.
   */
  async _burgeeSurface(userArgs: string[]): Promise<boolean> {
    const root = this._root();
    const declared = (flag: string): boolean => root._findOption(flag) !== undefined;
    const terminator = userArgs.indexOf('--');
    const head = terminator === -1 ? userArgs : userArgs.slice(0, terminator);
    if (head.includes('--schema') && !declared('--schema')) {
      root._outputConfiguration.writeOut(`${JSON.stringify(schemaOf(this.manifest), null, 2)}\n`);
      return true;
    }
    if (head[0] === '--mcp' && !declared('--mcp')) {
      const invoke = async (args: string[]): Promise<{ stdout: string; stderr: string; code: number }> => {
        const out: string[] = [];
        const err: string[] = [];
        let code = 0;
        await root.parseAsync(args, { from: 'user', stdout: { write: (s) => out.push(s) }, stderr: { write: (s) => err.push(s) }, exit: (c) => void (code = c) });
        return { stdout: out.join(''), stderr: err.join(''), code };
      };
      await serveMcp(this.manifest, { input: process.stdin, output: { write: (s) => root._outputConfiguration.writeOut(s) }, invoke });
      return true;
    }
    return false;
  }

  /** Additive, and the point of the whole exercise: plugins commander has never had (#2505, unlanded). */
  use(plugin: Plugin): this {
    this.manifest.use(plugin);
    return this;
  }

  /** Inject the streams and the exit for one parse; returns commander's own parse options. */
  _prepareBurgee(parseOptions?: BurgeeParseOptions): ParseOptions | undefined {
    if (parseOptions === undefined) return undefined;
    const { stdout, stderr, exit, ...from } = parseOptions;
    if (stdout === undefined && stderr === undefined && exit === undefined) return from;
    const root = this._root();
    root._burgee = { exit, json: false };
    const output: Partial<OutputConfiguration> = {};
    if (stdout) output.writeOut = (str) => void stdout.write(str);
    if (stderr) output.writeErr = (str) => void stderr.write(str);
    const configuration = { ...root._outputConfiguration, ...output };
    const throwing = (err: CommanderError): void => {
      throw err;
    };
    const visit = (cmd: Command): void => {
      cmd._outputConfiguration = configuration;
      cmd._exitCallback = throwing;
      for (const sub of cmd.commands) visit(sub);
    };
    visit(root);
    return from;
  }

  /** In burgee mode the whole run settles to one E1 exit; otherwise commander's behaviour, untouched. */
  _runBurgee(run: () => unknown): unknown {
    const root = this._root();
    const burgee = root._burgee;
    if (burgee === undefined) return run();
    const finish = (code: number): void => {
      root._burgee = undefined;
      burgee.exit?.(code);
    };
    const fail = (err: unknown): void => {
      if (err instanceof CommanderError) {
        if (burgee.json && err.code !== 'commander.helpDisplayed' && err.code !== 'commander.version') {
          root._outputConfiguration.writeOut(`${JSON.stringify({ ok: false, error: { code: err.code, message: err.message } })}\n`);
        }
        finish(e1(err));
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (burgee.json) root._outputConfiguration.writeOut(`${JSON.stringify({ ok: false, error: { code: 'runtime', message } })}\n`);
      else root._outputConfiguration.writeErr(`error: ${message}\n`);
      finish(ExitCode.RUNTIME);
    };
    try {
      const result = run();
      if (isThenable(result)) return Promise.resolve(result).then(() => finish(ExitCode.OK), fail);
      finish(ExitCode.OK);
      return undefined;
    } catch (err) {
      fail(err);
      return undefined;
    }
  }

  /** `--json` that no command in the chain declared is burgee's envelope, not an unknown option. */
  _takeJson(unknown: string[]): void {
    const terminator = unknown.indexOf('--');
    const index = unknown.indexOf('--json');
    if (index === -1 || (terminator !== -1 && index > terminator)) return;
    if (this._getCommandAndAncestors().some((cmd) => cmd._findOption('--json'))) return;
    unknown.splice(index, 1);
    const root = this._root();
    root._burgee ??= { exit: undefined, json: false };
    root._burgee.json = true;
  }

  /** The action, wrapped in the plugin hooks and followed by the envelope or the rendering. */
  _runAction(): unknown {
    const handler = this._actionHandler;
    if (handler === null) return undefined;
    const root = this._root();
    const manifest = root._manifest;
    const settle = (value: unknown): void => this._emitResult(value);
    if (manifest === undefined || manifest.plugins.length === 0) {
      const result = handler(this.processedArgs);
      return isThenable(result) ? Promise.resolve(result).then(settle) : settle(result);
    }
    const name = this.name();
    const options = this.opts();
    return manifest
      .fire('preRun', name, options)
      .then(() => handler(this.processedArgs))
      .then(async (value) => {
        await manifest.fire('postRun', name, options);
        settle(value);
      });
  }

  _emitResult(value: unknown): void {
    const burgee = this._root()._burgee;
    if (burgee === undefined) return;
    if (burgee.json) {
      this._outputConfiguration.writeOut(`${JSON.stringify({ ok: true, data: value ?? null })}\n`);
      return;
    }
    const text = render(value);
    if (text !== '') this._outputConfiguration.writeOut(text);
  }
}

/** Bump inspector ports so a spawned subcommand does not collide with the parent. */
function incrementNodeInspectorPort(args: string[]): string[] {
  //  --inspect[=[host:]port], --inspect-brk[=[host:]port], --inspect-port=[host:]port
  return args.map((arg: string): string => {
    if (!arg.startsWith('--inspect')) return arg;
    let debugOption: string | undefined;
    let debugHost = '127.0.0.1';
    let debugPort = '9229';
    let match: RegExpMatchArray | null;
    if ((match = /^(--inspect(-brk)?)$/.exec(arg)) !== null) {
      debugOption = match[1];
    } else if ((match = /^(--inspect(-brk|-port)?)=([^:]+)$/.exec(arg)) !== null) {
      debugOption = match[1];
      if (/^\d+$/.test(match[3] ?? '')) debugPort = match[3] ?? debugPort;
      else debugHost = match[3] ?? debugHost;
    } else if ((match = /^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/.exec(arg)) !== null) {
      debugOption = match[1];
      debugHost = match[3] ?? debugHost;
      debugPort = match[4] ?? debugPort;
    }
    if (debugOption && debugPort !== '0') return `${debugOption}=${debugHost}:${parseInt(debugPort, 10) + 1}`;
    return arg;
  });
}

/**
 * The common colour conventions: NO_COLOR and FORCE_COLOR=0/false disable, FORCE_COLOR
 * and CLICOLOR_FORCE enable, otherwise undecided (the stream's TTY-ness decides).
 */
export function useColor(): boolean | undefined {
  if (process.env['NO_COLOR'] || process.env['FORCE_COLOR'] === '0' || process.env['FORCE_COLOR'] === 'false') return false;
  if (process.env['FORCE_COLOR'] || process.env['CLICOLOR_FORCE'] !== undefined) return true;
  return undefined;
}
