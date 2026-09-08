/**
 * yargs' command instance — `.command()` in its five shapes, `.commandDir()`, the
 * builder/handler pipeline, positionals and the default command — ported for
 * `burgee/yargs`.
 */
 
import { applyMiddleware, commandMiddlewareFactory, type Middleware } from './yargs-middleware.js';
import type { PlatformShim } from './yargs-shim.js';
import type { UsageInstance } from './yargs-usage.js';
import { isPromise, maybeAsyncResult, parseCommand, type Positional } from './yargs-utils.js';
import type { ValidationInstance } from './yargs-validation.js';

const DEFAULT_MARKER = /(^\*)|(^\$0)/;

export interface CommandHandler {
  original: string;
  description?: string | false | undefined;
  handler: (argv: any) => any;
  builder: any;
  middlewares: Middleware[];
  deprecated?: boolean | string | undefined;
  demanded: Positional[];
  optional: Positional[];
}

export interface CommandHandlerDefinition {
  command?: string | string[];
  aliases?: string[];
  describe?: string | false;
  description?: string | false;
  desc?: string | false;
  builder?: any;
  handler?: (argv: any) => any;
  middlewares?: Middleware[];
  deprecated?: boolean | string;
}

export interface CommandBuilderDefinition {
  builder: any;
  handler: (argv: any) => any;
  middlewares?: Middleware[];
  deprecated?: boolean | string;
}

export function isYargsInstance(y: any): boolean {
  return !!y && typeof y.getInternalMethods === 'function';
}

export class CommandInstance {
  private requireCache = new Set<string>();
  private handlers: Record<string, CommandHandler> = {};
  private aliasMap: Record<string, string> = {};
  private defaultCommand: CommandHandler | undefined;
  private frozens: { handlers: Record<string, CommandHandler>; aliasMap: Record<string, string>; defaultCommand: CommandHandler | undefined }[] = [];
  private readonly shim: PlatformShim;
  private readonly usage: UsageInstance;
  private readonly globalMiddleware: any;
  private readonly validation: ValidationInstance;

  constructor(usage: UsageInstance, validation: ValidationInstance, globalMiddleware: any, shim: PlatformShim) {
    this.shim = shim;
    this.usage = usage;
    this.globalMiddleware = globalMiddleware;
    this.validation = validation;
  }

  addDirectory(dir: string, req: (p: string) => any, callerFile: string, opts?: any): void {
    opts = opts || {};
    this.requireCache.add(callerFile);
    const fullDirPath = this.shim.path.resolve(this.shim.path.dirname(callerFile), dir);
    const files = this.shim.readdirSync(fullDirPath, { recursive: opts.recurse ? true : false }) as (string | Buffer)[];
    if (!Array.isArray(opts.extensions)) opts.extensions = ['js'];
    const visit = typeof opts.visit === 'function' ? opts.visit : (o: any) => o;
    for (const fileb of files) {
      const file = fileb.toString();
      if (opts.exclude) {
        let exclude = false;
        if (typeof opts.exclude === 'function') exclude = opts.exclude(file);
        else exclude = opts.exclude.test(file);
        if (exclude) continue;
      }
      if (opts.include) {
        let include = false;
        if (typeof opts.include === 'function') include = opts.include(file);
        else include = opts.include.test(file);
        if (!include) continue;
      }
      let supportedExtension = false;
      for (const ext of opts.extensions) {
        if (file.endsWith(ext)) supportedExtension = true;
      }
      if (supportedExtension) {
        const joined = this.shim.path.join(fullDirPath, file);
        const module = req(joined);
        const extendableModule = Object.create(null, Object.getOwnPropertyDescriptors({ ...module }));
        const visited = visit(extendableModule, joined, file);
        if (visited) {
          if (this.requireCache.has(joined)) continue;
          else this.requireCache.add(joined);
          if (!extendableModule.command) extendableModule.command = this.shim.path.basename(joined, this.shim.path.extname(joined));
          this.addHandler(extendableModule);
        }
      }
    }
  }

  addHandler(
    cmd: string | string[] | CommandHandlerDefinition,
    description?: string | false,
    builder?: any,
    handler?: (argv: any) => any,
    commandMiddleware?: Middleware[],
    deprecated?: boolean | string,
  ): void {
    let aliases: string[] = [];
    const middlewares = commandMiddlewareFactory(commandMiddleware);
    handler = handler || (() => {});
    if (Array.isArray(cmd)) {
      if (isCommandAndAliases(cmd)) [cmd, ...aliases] = cmd as [string, ...string[]];
      else {
        for (const command of cmd as (string | CommandHandlerDefinition)[]) this.addHandler(command);
      }
    } else if (isCommandHandlerDefinition(cmd)) {
      let command = Array.isArray(cmd.command) || typeof cmd.command === 'string' ? cmd.command : null;
      if (command === null) throw new Error(`No command name given for module: ${this.shim.inspect(cmd)}`);
      if (cmd.aliases) command = ([] as string[]).concat(command).concat(cmd.aliases);
      this.addHandler(command, this.extractDesc(cmd), cmd.builder, cmd.handler, cmd.middlewares, cmd.deprecated);
      return;
    } else if (isCommandBuilderDefinition(builder)) {
      this.addHandler([cmd].concat(aliases), description, builder.builder, builder.handler, builder.middlewares, builder.deprecated);
      return;
    }
    if (typeof cmd === 'string') {
      const parsedCommand = parseCommand(cmd);
      aliases = aliases.map((alias) => parseCommand(alias).cmd);
      let isDefault = false;
      const parsedAliases = [parsedCommand.cmd].concat(aliases).filter((c) => {
        if (DEFAULT_MARKER.test(c)) {
          isDefault = true;
          return false;
        }
        return true;
      });
      if (parsedAliases.length === 0 && isDefault) parsedAliases.push('$0');
      if (isDefault) {
        parsedCommand.cmd = parsedAliases[0] as string;
        aliases = parsedAliases.slice(1);
        cmd = cmd.replace(DEFAULT_MARKER, parsedCommand.cmd);
      }
      aliases.forEach((alias) => {
        this.aliasMap[alias] = parsedCommand.cmd;
      });
      if (description !== false) this.usage.command(cmd, description as string, isDefault, aliases, deprecated);
      this.handlers[parsedCommand.cmd] = {
        original: cmd,
        description,
        handler,
        builder: builder || {},
        middlewares,
        deprecated,
        demanded: parsedCommand.demanded,
        optional: parsedCommand.optional,
      };
      if (isDefault) this.defaultCommand = this.handlers[parsedCommand.cmd];
    }
  }

  getCommandHandlers(): Record<string, CommandHandler> {
    return this.handlers;
  }

  getCommands(): string[] {
    return Object.keys(this.handlers).concat(Object.keys(this.aliasMap));
  }

  hasDefaultCommand(): boolean {
    return !!this.defaultCommand;
  }

  runCommand(command: string | null, yargs: any, parsed: any, commandIndex: number, helpOnly: boolean, helpOrVersionSet: boolean): any {
    const commandHandler = (this.handlers[command as string] || this.handlers[this.aliasMap[command as string] as string] || this.defaultCommand) as CommandHandler;
    const currentContext = yargs.getInternalMethods().getContext();
    const parentCommands = currentContext.commands.slice();
    const isDefaultCommand = !command;
    if (command) {
      currentContext.commands.push(command);
      currentContext.fullCommands.push(commandHandler.original);
    }
    const builderResult = this.applyBuilderUpdateUsageAndParse(isDefaultCommand, commandHandler, yargs, parsed.aliases, parentCommands, commandIndex, helpOnly, helpOrVersionSet);
    return isPromise(builderResult)
      ? builderResult.then((result: any) => this.applyMiddlewareAndGetResult(isDefaultCommand, commandHandler, result.innerArgv, currentContext, helpOnly, result.aliases, yargs))
      : this.applyMiddlewareAndGetResult(isDefaultCommand, commandHandler, builderResult.innerArgv, currentContext, helpOnly, builderResult.aliases, yargs);
  }

  private applyBuilderUpdateUsageAndParse(
    isDefaultCommand: boolean,
    commandHandler: CommandHandler,
    yargs: any,
    aliases: Record<string, string[]>,
    parentCommands: string[],
    commandIndex: number,
    helpOnly: boolean,
    helpOrVersionSet: boolean,
  ): any {
    const builder = commandHandler.builder;
    let innerYargs = yargs;
    if (isCommandBuilderCallback(builder)) {
      yargs.getInternalMethods().getUsageInstance().freeze();
      const builderOutput = builder(yargs.getInternalMethods().reset(aliases), helpOrVersionSet);
      if (isPromise(builderOutput)) {
        return builderOutput.then((output: any) => {
          innerYargs = isYargsInstance(output) ? output : yargs;
          return this.parseAndUpdateUsage(isDefaultCommand, commandHandler, innerYargs, parentCommands, commandIndex, helpOnly);
        });
      }
    } else if (isCommandBuilderOptionDefinitions(builder)) {
      yargs.getInternalMethods().getUsageInstance().freeze();
      innerYargs = yargs.getInternalMethods().reset(aliases);
      Object.keys(commandHandler.builder).forEach((key) => {
        innerYargs.option(key, builder[key]);
      });
    }
    return this.parseAndUpdateUsage(isDefaultCommand, commandHandler, innerYargs, parentCommands, commandIndex, helpOnly);
  }

  private parseAndUpdateUsage(isDefaultCommand: boolean, commandHandler: CommandHandler, innerYargs: any, parentCommands: string[], commandIndex: number, helpOnly: boolean): any {
    if (isDefaultCommand) innerYargs.getInternalMethods().getUsageInstance().unfreeze(true);
    if (this.shouldUpdateUsage(innerYargs)) {
      innerYargs.getInternalMethods().getUsageInstance().usage(this.usageFromParentCommandsCommandHandler(parentCommands, commandHandler), commandHandler.description);
    }
    const innerArgv = innerYargs.getInternalMethods().runYargsParserAndExecuteCommands(null, undefined, true, commandIndex, helpOnly);
    return isPromise(innerArgv)
      ? innerArgv.then((argv: any) => ({ aliases: innerYargs.parsed.aliases, innerArgv: argv }))
      : { aliases: innerYargs.parsed.aliases, innerArgv };
  }

  private shouldUpdateUsage(yargs: any): boolean {
    return !yargs.getInternalMethods().getUsageInstance().getUsageDisabled() && yargs.getInternalMethods().getUsageInstance().getUsage().length === 0;
  }

  private usageFromParentCommandsCommandHandler(parentCommands: string[], commandHandler: CommandHandler): string {
    const c = DEFAULT_MARKER.test(commandHandler.original) ? commandHandler.original.replace(DEFAULT_MARKER, '').trim() : commandHandler.original;
    const pc = parentCommands.filter((p) => !DEFAULT_MARKER.test(p));
    pc.push(c);
    return `$0 ${pc.join(' ')}`;
  }

  private handleValidationAndGetResult(
    isDefaultCommand: boolean,
    commandHandler: CommandHandler,
    innerArgv: any,
    currentContext: any,
    aliases: Record<string, string[]>,
    yargs: any,
    middlewares: Middleware[],
    positionalMap: Record<string, string[]>,
  ): any {
    if (!yargs.getInternalMethods().getHasOutput()) {
      const validate = yargs.getInternalMethods().runValidation(aliases, positionalMap, yargs.parsed.error, isDefaultCommand);
      innerArgv = maybeAsyncResult(innerArgv, (result: any) => {
        validate(result);
        return result;
      });
    }
    if (commandHandler.handler && !yargs.getInternalMethods().getHasOutput()) {
      yargs.getInternalMethods().setHasOutput();
      const populateDoubleDash = !!yargs.getOptions().configuration['populate--'];
      yargs.getInternalMethods().postProcess(innerArgv, populateDoubleDash, false, false);
      innerArgv = applyMiddleware(innerArgv, yargs, middlewares, false);
      innerArgv = maybeAsyncResult(innerArgv, (result: any) => {
        const handlerResult = commandHandler.handler(result);
        return isPromise(handlerResult) ? handlerResult.then(() => result) : result;
      });
      if (!isDefaultCommand) yargs.getInternalMethods().getUsageInstance().cacheHelpMessage();
      if (isPromise(innerArgv) && !yargs.getInternalMethods().hasParseCallback()) {
        innerArgv.catch((error: any) => {
          try {
            yargs.getInternalMethods().getUsageInstance().fail(null, error);
          } catch {
            // the failure was reported; yargs swallows the rethrow here
          }
        });
      }
    }
    if (!isDefaultCommand) {
      currentContext.commands.pop();
      currentContext.fullCommands.pop();
    }
    return innerArgv;
  }

  private applyMiddlewareAndGetResult(
    isDefaultCommand: boolean,
    commandHandler: CommandHandler,
    innerArgv: any,
    currentContext: any,
    helpOnly: boolean,
    aliases: Record<string, string[]>,
    yargs: any,
  ): any {
    let positionalMap: Record<string, string[]> = {};
    if (helpOnly) return innerArgv;
    if (!yargs.getInternalMethods().getHasOutput()) positionalMap = this.populatePositionals(commandHandler, innerArgv, currentContext, yargs);
    const middlewares = this.globalMiddleware.getMiddleware().slice(0).concat(commandHandler.middlewares);
    const maybePromiseArgv = applyMiddleware(innerArgv, yargs, middlewares, true);
    return isPromise(maybePromiseArgv)
      ? maybePromiseArgv.then((resolvedInnerArgv: any) =>
          this.handleValidationAndGetResult(isDefaultCommand, commandHandler, resolvedInnerArgv, currentContext, aliases, yargs, middlewares, positionalMap),
        )
      : this.handleValidationAndGetResult(isDefaultCommand, commandHandler, maybePromiseArgv, currentContext, aliases, yargs, middlewares, positionalMap);
  }

  private populatePositionals(commandHandler: CommandHandler, argv: any, context: any, yargs: any): Record<string, string[]> {
    argv._ = argv._.slice(context.commands.length);
    const demanded = commandHandler.demanded.slice(0);
    const optional = commandHandler.optional.slice(0);
    const positionalMap: Record<string, string[]> = {};
    this.validation.positionalCount(demanded.length, argv._.length);
    while (demanded.length) {
      const demand = demanded.shift() as Positional;
      this.populatePositional(demand, argv, positionalMap);
    }
    while (optional.length) {
      const maybe = optional.shift() as Positional;
      this.populatePositional(maybe, argv, positionalMap);
    }
    argv._ = context.commands.concat(argv._.map((a: any) => `${a}`));
    this.postProcessPositionals(argv, positionalMap, this.cmdToParseOptions(commandHandler.original), yargs);
    return positionalMap;
  }

  private populatePositional(positional: Positional, argv: any, positionalMap: Record<string, string[]>): void {
    const cmd = positional.cmd[0] as string;
    if (positional.variadic) positionalMap[cmd] = argv._.splice(0).map(String);
    else if (argv._.length) positionalMap[cmd] = [String(argv._.shift())];
  }

  cmdToParseOptions(cmdString: string): { array: string[]; default: Record<string, any>; alias: Record<string, string[]>; demand: Record<string, boolean> } {
    const parseOptions: { array: string[]; default: Record<string, any>; alias: Record<string, string[]>; demand: Record<string, boolean> } = {
      array: [],
      default: {},
      alias: {},
      demand: {},
    };
    const parsed = parseCommand(cmdString);
    parsed.demanded.forEach((d) => {
      const [cmd, ...aliases] = d.cmd as [string, ...string[]];
      if (d.variadic) {
        parseOptions.array.push(cmd);
        parseOptions.default[cmd] = [];
      }
      parseOptions.alias[cmd] = aliases;
      parseOptions.demand[cmd] = true;
    });
    parsed.optional.forEach((o) => {
      const [cmd, ...aliases] = o.cmd as [string, ...string[]];
      if (o.variadic) {
        parseOptions.array.push(cmd);
        parseOptions.default[cmd] = [];
      }
      parseOptions.alias[cmd] = aliases;
    });
    return parseOptions;
  }

  private postProcessPositionals(argv: any, positionalMap: Record<string, string[]>, parseOptions: ReturnType<CommandInstance['cmdToParseOptions']>, yargs: any): void {
    const options = Object.assign({}, yargs.getOptions());
    options.default = Object.assign(parseOptions.default, options.default);
    for (const key of Object.keys(parseOptions.alias)) {
      options.alias[key] = (options.alias[key] || []).concat(parseOptions.alias[key]);
    }
    options.array = options.array.concat(parseOptions.array);
    options.config = {};
    const unparsed: string[] = [];
    Object.keys(positionalMap).forEach((key) => {
      (positionalMap[key] as string[]).map((value) => {
        if (options.configuration['unknown-options-as-args']) options.key[key] = true;
        unparsed.push(`--${key}`);
        unparsed.push(value);
      });
    });
    if (!unparsed.length) return;
    const config = Object.assign({}, options.configuration, { 'populate--': false });
    const parsed = this.shim.Parser.detailed(unparsed, Object.assign({}, options, { configuration: config }));
    if (parsed.error) {
      yargs.getInternalMethods().getUsageInstance().fail(parsed.error.message, parsed.error);
    } else {
      const positionalKeys = Object.keys(positionalMap);
      Object.keys(positionalMap).forEach((key) => {
        positionalKeys.push(...(parsed.aliases[key] as string[]));
      });
      Object.keys(parsed.argv).forEach((key) => {
        if (positionalKeys.includes(key)) {
          if (!positionalMap[key]) positionalMap[key] = parsed.argv[key];
          if (
            !this.isInConfigs(yargs, key) &&
            !this.isDefaulted(yargs, key) &&
            Object.prototype.hasOwnProperty.call(argv, key) &&
            Object.prototype.hasOwnProperty.call(parsed.argv, key) &&
            (Array.isArray(argv[key]) || Array.isArray(parsed.argv[key]))
          ) {
            argv[key] = ([] as any[]).concat(argv[key], parsed.argv[key]);
          } else argv[key] = parsed.argv[key];
        }
      });
    }
  }

  private isDefaulted(yargs: any, key: string): boolean {
    const { default: defaults } = yargs.getOptions();
    return Object.prototype.hasOwnProperty.call(defaults, key) || Object.prototype.hasOwnProperty.call(defaults, this.shim.Parser.camelCase(key));
  }

  private isInConfigs(yargs: any, key: string): boolean {
    const { configObjects } = yargs.getOptions();
    return (
      configObjects.some((c: any) => Object.prototype.hasOwnProperty.call(c, key)) ||
      configObjects.some((c: any) => Object.prototype.hasOwnProperty.call(c, this.shim.Parser.camelCase(key)))
    );
  }

  runDefaultBuilderOn(yargs: any): any {
    if (!this.defaultCommand) return;
    if (this.shouldUpdateUsage(yargs)) {
      const commandString = DEFAULT_MARKER.test(this.defaultCommand.original)
        ? this.defaultCommand.original
        : this.defaultCommand.original.replace(/^[^[\]<>]*/, '$0 ');
      yargs.getInternalMethods().getUsageInstance().usage(commandString, this.defaultCommand.description);
    }
    const builder = this.defaultCommand.builder;
    if (isCommandBuilderCallback(builder)) return builder(yargs, true);
    else if (!isCommandBuilderDefinition(builder)) {
      Object.keys(builder).forEach((key) => {
        yargs.option(key, builder[key]);
      });
    }
    return undefined;
  }

  private extractDesc({ describe, description, desc }: CommandHandlerDefinition): string | false {
    for (const test of [describe, description, desc]) {
      if (typeof test === 'string' || test === false) return test;
      this.shim.assert.notStrictEqual(test, true);
    }
    return false;
  }

  freeze(): void {
    this.frozens.push({ handlers: this.handlers, aliasMap: this.aliasMap, defaultCommand: this.defaultCommand });
  }

  unfreeze(): void {
    const frozen = this.frozens.pop();
    this.shim.assert.notStrictEqual(frozen, undefined);
    ({ handlers: this.handlers, aliasMap: this.aliasMap, defaultCommand: this.defaultCommand } = frozen as (typeof this.frozens)[number]);
  }

  reset(): CommandInstance {
    this.handlers = {};
    this.aliasMap = {};
    this.defaultCommand = undefined;
    this.requireCache = new Set();
    return this;
  }
}

export function command(usage: UsageInstance, validation: ValidationInstance, globalMiddleware: any, shim: PlatformShim): CommandInstance {
  return new CommandInstance(usage, validation, globalMiddleware, shim);
}

export function isCommandBuilderDefinition(builder: any): builder is CommandBuilderDefinition {
  return typeof builder === 'object' && !!builder.builder && typeof builder.handler === 'function';
}

function isCommandAndAliases(cmd: (string | CommandHandlerDefinition)[]): cmd is string[] {
  return cmd.every((c) => typeof c === 'string');
}

export function isCommandBuilderCallback(builder: any): builder is (yargs: any, helpOrVersionSet: boolean) => any {
  return typeof builder === 'function';
}

function isCommandBuilderOptionDefinitions(builder: any): builder is Record<string, any> {
  return typeof builder === 'object';
}

export function isCommandHandlerDefinition(cmd: any): cmd is CommandHandlerDefinition {
  return typeof cmd === 'object' && !Array.isArray(cmd);
}
