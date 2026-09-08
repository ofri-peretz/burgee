/**
 * yargs' `YargsInstance`, ported method for method from yargs 18 and graded by yargs'
 * own suite through `compat-oracle`. Every public method, its argsert contract, the
 * parse pipeline, the freeze/unfreeze bookkeeping around `.parse()` and the
 * `getInternalMethods()` seam are the upstream's — that is what makes a user's
 * existing program run unchanged (J2).
 */
 
import { command as Command, type CommandInstance, isCommandBuilderCallback } from './yargs-command.js';
import { completion as Completion, type Completion as CompletionInstance, type CompletionFunction } from './yargs-completion.js';
import { applyMiddleware, GlobalMiddleware, type Middleware } from './yargs-middleware.js';
import type { PlatformShim } from './yargs-shim.js';
import { usage as Usage, type FailureFunction, type UsageInstance } from './yargs-usage.js';
import { applyExtends, argsert, isPromise, maybeAsyncResult, objectKeys, objFilter, setBlocking, YError } from './yargs-utils.js';
import { validation as Validation, type ValidationInstance } from './yargs-validation.js';

export interface Options {
  array: string[];
  boolean: string[];
  string: string[];
  skipValidation: string[];
  count: string[];
  normalize: string[];
  number: string[];
  hiddenOptions: string[];
  narg: Record<string, number>;
  key: Record<string, boolean>;
  alias: Record<string, string[]>;
  default: Record<string, any>;
  defaultDescription: Record<string, string>;
  config: Record<string, any>;
  choices: Record<string, any[]>;
  demandedOptions: Record<string, string | undefined>;
  demandedCommands: Record<string, { min: number; max: number; minMsg?: string | null | undefined; maxMsg?: string | null | undefined }>;
  deprecatedOptions: Record<string, string | boolean | undefined>;
  local: string[];
  configObjects: Record<string, any>[];
  envPrefix?: string | undefined;
  showHiddenOpt: string;
  configuration: Record<string, any>;
  __?: (...args: any[]) => string;
}

export interface Context {
  commands: string[];
  fullCommands: string[];
}

interface Logger {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

interface Frozen {
  options: Options;
  configObjects: Record<string, any>[];
  exitProcess: boolean;
  groups: Record<string, string[]>;
  strict: boolean;
  strictCommands: boolean;
  strictOptions: boolean;
  completionCommand: string | null;
  output: string;
  exitError: YError | string | undefined | null;
  hasOutput: boolean;
  parsed: any;
  parseFn: ParseCallback | null;
  parseContext: object | null;
}

export type ParseCallback = (err: YError | string | undefined | null, argv: any, output: string) => void;

const DEFAULT_LOCALE = 'en_US';

export function YargsFactory(shim: PlatformShim): (processArgs?: string | string[], cwd?: string, parentRequire?: NodeJS.Require) => YargsInstance {
  return (processArgs = [], cwd = shim.process.cwd(), parentRequire) => {
    const yargs = new YargsInstance(processArgs, cwd, parentRequire, shim);
    Object.defineProperty(yargs, 'argv', {
      get: () => yargs.parse(),
      enumerable: true,
    });
    yargs.help();
    yargs.version();
    return yargs;
  };
}

export class YargsInstance {
  $0: string;
  argv?: any;
  customScriptName = false;
  parsed: any = false;
  #command: CommandInstance;
  #cwd: string;
  #context: Context = { commands: [], fullCommands: [] };
  #completion: CompletionInstance | null = null;
  #completionCommand: string | null = null;
  #defaultShowHiddenOpt = 'show-hidden';
  #exitError: YError | string | undefined | null = null;
  #detectLocale = true;
  #emittedWarnings: Record<string, boolean> = {};
  #exitProcess = true;
  #frozens: Frozen[] = [];
  #globalMiddleware: GlobalMiddleware;
  #groups: Record<string, string[]> = {};
  #hasOutput = false;
  #helpOpt: string | null = null;
  #isGlobalContext = true;
  #logger: Logger;
  #output = '';
  #options: Options;
  #parentRequire?: NodeJS.Require | undefined;
  #parserConfig: Record<string, any> = {};
  #parseFn: ParseCallback | null = null;
  #parseContext: object | null = null;
  #pkgs: Record<string, Record<string, any>> = {};
  #preservedGroups: Record<string, string[]> = {};
  #processArgs: string | string[];
  #recommendCommands = false;
  #shim: PlatformShim;
  #strict = false;
  #strictCommands = false;
  #strictOptions = false;
  #usage: UsageInstance;
  #usageConfig: Record<string, any> = {};
  #versionOpt: string | null = null;
  #validation: ValidationInstance;

  constructor(processArgs: string | string[] = [], cwd: string, parentRequire: NodeJS.Require | undefined, shim: PlatformShim) {
    this.#shim = shim;
    this.#processArgs = processArgs;
    this.#cwd = cwd;
    this.#parentRequire = parentRequire;
    this.#globalMiddleware = new GlobalMiddleware(this);
    this.$0 = this.#getDollarZero();
    // kReset builds the four collaborators; the definite assignments below are its result.
    this.#options = undefined as unknown as Options;
    this.#usage = undefined as unknown as UsageInstance;
    this.#validation = undefined as unknown as ValidationInstance;
    this.#command = undefined as unknown as CommandInstance;
    this.#reset();
    this.#options.showHiddenOpt = this.#defaultShowHiddenOpt;
    this.#logger = this.#createLogger();
    this.#shim.y18n.setLocale(DEFAULT_LOCALE);
  }

  addHelpOpt(opt?: string | false, msg?: string): this {
    const defaultHelpOpt = 'help';
    argsert('[string|boolean] [string]', [opt, msg], arguments.length);
    if (this.#helpOpt) {
      this.#deleteFromParserHintObject(this.#helpOpt);
      this.#helpOpt = null;
    }
    if (opt === false && msg === undefined) return this;
    this.#helpOpt = typeof opt === 'string' ? opt : defaultHelpOpt;
    this.boolean(this.#helpOpt);
    this.describe(this.#helpOpt, msg || this.#usage.deferY18nLookup('Show help'));
    return this;
  }

  help(opt?: string | false, msg?: string): this {
    return this.addHelpOpt(opt, msg);
  }

  addShowHiddenOpt(opt?: string | false, msg?: string): this {
    argsert('[string|boolean] [string]', [opt, msg], arguments.length);
    if (opt === false && msg === undefined) return this;
    const showHiddenOpt = typeof opt === 'string' ? opt : this.#defaultShowHiddenOpt;
    this.boolean(showHiddenOpt);
    this.describe(showHiddenOpt, msg || this.#usage.deferY18nLookup('Show hidden options'));
    this.#options.showHiddenOpt = showHiddenOpt;
    return this;
  }

  showHidden(opt?: string | false, msg?: string): this {
    return this.addShowHiddenOpt(opt, msg);
  }

  alias(key: string | string[] | Record<string, string | string[]>, value?: string | string[]): this {
    argsert('<object|string|array> [string|array]', [key, value], arguments.length);
    this.#populateParserHintArrayDictionary(this.alias.bind(this), 'alias', key, value);
    return this;
  }

  array(keys: string | string[]): this {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('array', keys);
    this.#trackManuallySetKeys(keys);
    return this;
  }

  boolean(keys: string | string[]): this {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('boolean', keys);
    this.#trackManuallySetKeys(keys);
    return this;
  }

  check(f: (argv: any, options: Options) => any, global?: boolean): this {
    argsert('<function> [boolean]', [f, global], arguments.length);
    this.middleware(
      (argv: any, _yargs: any) =>
        maybeAsyncResult(
          () => f(argv, _yargs.getOptions()),
          (result: any) => {
            if (!result) this.#usage.fail(this.#shim.y18n.__('Argument check failed: %s', f.toString()));
            else if (typeof result === 'string' || result instanceof Error) this.#usage.fail(result.toString(), result as Error);
            return argv;
          },
          (err: Error) => {
            this.#usage.fail(err.message ? err.message : err.toString(), err);
            return argv;
          },
        ),
      false,
      global,
    );
    return this;
  }

  choices(key: string | string[] | Record<string, any>, value?: any): this {
    argsert('<object|string|array> [string|array]', [key, value], arguments.length);
    this.#populateParserHintArrayDictionary(this.choices.bind(this), 'choices', key, value);
    return this;
  }

  coerce(keys: string | string[] | Record<string, (arg: any) => any>, value?: (arg: any) => any): this {
    argsert('<object|string|array> [function]', [keys, value], arguments.length);
    if (Array.isArray(keys)) {
      if (!value) throw new YError('coerce callback must be provided');
      for (const key of keys) this.coerce(key, value);
      return this;
    } else if (typeof keys === 'object') {
      for (const key of Object.keys(keys)) this.coerce(key, keys[key]);
      return this;
    }
    if (!value) throw new YError('coerce callback must be provided');
    const coerceKey = keys;
    this.#options.key[coerceKey] = true;
    this.#globalMiddleware.addCoerceMiddleware((argv: any, yargs: any) => {
      const coerceKeyAliases: string[] = yargs.getAliases()[coerceKey] ?? [];
      const argvKeys = [coerceKey, ...coerceKeyAliases].filter((key) => Object.prototype.hasOwnProperty.call(argv, key));
      if (argvKeys.length === 0) return argv;
      return maybeAsyncResult(
        () => value(argv[argvKeys[0] as string]),
        (result: any) => {
          argvKeys.forEach((key) => {
            argv[key] = result;
          });
          return argv;
        },
        (err: Error) => {
          throw new YError(err.message);
        },
      );
    }, coerceKey);
    return this;
  }

  conflicts(key1: string | Record<string, string | string[]>, key2?: string | string[]): this {
    argsert('<string|object> [string|array]', [key1, key2], arguments.length);
    this.#validation.conflicts(key1, key2);
    return this;
  }

  config(key: string | string[] | Record<string, any> = 'config', msg?: string | ((path: string) => any), parseFn?: (path: string) => any): this {
    argsert('[object|string] [string|function] [function]', [key, msg, parseFn], arguments.length);
    if (typeof key === 'object' && !Array.isArray(key)) {
      key = applyExtends(key, this.#cwd, this.#getParserConfiguration()['deep-merge-config'] || false);
      this.#options.configObjects = (this.#options.configObjects || []).concat(key);
      return this;
    }
    if (typeof msg === 'function') {
      parseFn = msg;
      msg = undefined;
    }
    this.describe(key, msg || this.#usage.deferY18nLookup('Path to JSON config file'));
    (Array.isArray(key) ? key : [key]).forEach((k) => {
      this.#options.config[k] = parseFn || true;
    });
    return this;
  }

  completion(cmd?: string, desc?: string | false | CompletionFunction, fn?: CompletionFunction): this {
    argsert('[string] [string|boolean|function] [function]', [cmd, desc, fn], arguments.length);
    if (typeof desc === 'function') {
      fn = desc;
      desc = undefined;
    }
    this.#completionCommand = cmd || this.#completionCommand || 'completion';
    if (!desc && desc !== false) desc = 'generate completion script';
    this.command(this.#completionCommand, desc);
    if (fn) (this.#completion as CompletionInstance).registerFunction(fn);
    return this;
  }

  command(cmd: any, description?: any, builder?: any, handler?: any, middlewares?: Middleware[], deprecated?: boolean | string): this {
    argsert(
      '<string|array|object> [string|boolean] [function|object] [function] [array] [boolean|string]',
      [cmd, description, builder, handler, middlewares, deprecated],
      arguments.length,
    );
    this.#command.addHandler(cmd, description, builder, handler, middlewares, deprecated);
    return this;
  }

  commands(cmd: any, description?: any, builder?: any, handler?: any, middlewares?: Middleware[], deprecated?: boolean | string): this {
    return this.command(cmd, description, builder, handler, middlewares, deprecated);
  }

  commandDir(dir: string, opts?: any): this {
    argsert('<string> [object]', [dir, opts], arguments.length);
    const req = this.#parentRequire || this.#shim.require;
    this.#command.addDirectory(dir, req, this.#shim.getCallerFile(), opts);
    return this;
  }

  count(keys: string | string[]): this {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('count', keys);
    this.#trackManuallySetKeys(keys);
    return this;
  }

  default(key: string | string[] | Record<string, any>, value?: any, defaultDescription?: string): this {
    argsert('<object|string|array> [*] [string]', [key, value, defaultDescription], arguments.length);
    if (defaultDescription) {
      this.#shim.assert.strictEqual(typeof key, 'string');
      this.#options.defaultDescription[key as string] = defaultDescription;
    }
    if (typeof value === 'function') {
      this.#shim.assert.strictEqual(typeof key, 'string');
      if (!this.#options.defaultDescription[key as string]) this.#options.defaultDescription[key as string] = this.#usage.functionDescription(value);
      value = value.call();
    }
    this.#populateParserHintSingleValueDictionary(this.default.bind(this), 'default', key, value);
    return this;
  }

  defaults(key: string | string[] | Record<string, any>, value?: any, defaultDescription?: string): this {
    return this.default(key, value, defaultDescription);
  }

  demandCommand(min = 1, max?: number | string | null, minMsg?: string | null, maxMsg?: string | null): this {
    argsert('[number] [number|string] [string|null|undefined] [string|null|undefined]', [min, max, minMsg, maxMsg], arguments.length);
    if (typeof max !== 'number') {
      minMsg = max;
      max = Infinity;
    }
    this.global('_', false);
    this.#options.demandedCommands._ = { min, max, minMsg, maxMsg };
    return this;
  }

  demand(keys: string | string[] | number | Record<string, any>, max?: number | string | string[] | boolean, msg?: string | boolean): this {
    if (Array.isArray(max)) {
      max.forEach((key) => {
        this.#shim.assert.notStrictEqual(msg, true);
        this.demandOption(key, msg as string | undefined);
      });
      max = Infinity;
    } else if (typeof max !== 'number') {
      msg = max;
      max = Infinity;
    }
    if (typeof keys === 'number') {
      this.#shim.assert.notStrictEqual(msg, true);
      this.demandCommand(keys, max, msg as string | undefined, msg as string | undefined);
    } else if (Array.isArray(keys)) {
      keys.forEach((key) => {
        this.#shim.assert.notStrictEqual(msg, true);
        this.demandOption(key, msg as string | undefined);
      });
    } else if (typeof msg === 'string') this.demandOption(keys, msg);
    else if (msg === true || typeof msg === 'undefined') this.demandOption(keys);
    return this;
  }

  demandOption(keys: string | string[] | Record<string, string | undefined>, msg?: string): this {
    argsert('<object|string|array> [string]', [keys, msg], arguments.length);
    this.#populateParserHintSingleValueDictionary(this.demandOption.bind(this), 'demandedOptions', keys, msg);
    return this;
  }

  deprecateOption(option: string, message?: string | boolean): this {
    argsert('<string> [string|boolean]', [option, message], arguments.length);
    this.#options.deprecatedOptions[option] = message;
    return this;
  }

  describe(keys: string | string[] | Record<string, string>, description?: string): this {
    argsert('<object|string|array> [string]', [keys, description], arguments.length);
    this.#setKey(keys, true);
    this.#usage.describe(keys, description);
    return this;
  }

  detectLocale(detect: boolean): this {
    argsert('<boolean>', [detect], arguments.length);
    this.#detectLocale = detect;
    return this;
  }

  env(prefix?: string | false): this {
    argsert('[string|boolean]', [prefix], arguments.length);
    if (prefix === false) delete this.#options.envPrefix;
    else this.#options.envPrefix = prefix || '';
    return this;
  }

  epilogue(msg: string): this {
    argsert('<string>', [msg], arguments.length);
    this.#usage.epilog(msg);
    return this;
  }

  epilog(msg: string): this {
    return this.epilogue(msg);
  }

  example(cmd: string | [string, string?][], description?: string): this {
    argsert('<string|array> [string]', [cmd, description], arguments.length);
    if (Array.isArray(cmd)) cmd.forEach((exampleParams) => this.example(...exampleParams));
    else this.#usage.example(cmd, description);
    return this;
  }

  exit(code: number, err?: YError | string): void {
    this.#hasOutput = true;
    this.#exitError = err;
    if (this.#exitProcess) this.#shim.process.exit(code);
  }

  exitProcess(enabled = true): this {
    argsert('[boolean]', [enabled], arguments.length);
    this.#exitProcess = enabled;
    return this;
  }

  fail(f: FailureFunction | boolean): this {
    argsert('<function|boolean>', [f], arguments.length);
    if (typeof f === 'boolean' && f !== false) throw new YError("Invalid first argument. Expected function or boolean 'false'");
    this.#usage.failFn(f);
    return this;
  }

  getAliases(): Record<string, string[]> {
    return this.parsed ? this.parsed.aliases : {};
  }

  async getCompletion(args: string[], done?: (err: Error | null, completions: string[] | undefined) => void): Promise<string[] | void> {
    argsert('<array> [function]', [args, done], arguments.length);
    if (!done) {
      return new Promise((resolve, reject) => {
        (this.#completion as CompletionInstance).getCompletion(args, (err, completions) => {
          if (err) reject(err);
          else resolve(completions);
        });
      });
    }
    return (this.#completion as CompletionInstance).getCompletion(args, done);
  }

  getDemandedOptions(): Record<string, string | undefined> {
    argsert([], 0);
    return this.#options.demandedOptions;
  }

  getDemandedCommands(): Options['demandedCommands'] {
    argsert([], 0);
    return this.#options.demandedCommands;
  }

  getDeprecatedOptions(): Options['deprecatedOptions'] {
    argsert([], 0);
    return this.#options.deprecatedOptions;
  }

  getDetectLocale(): boolean {
    return this.#detectLocale;
  }

  getExitProcess(): boolean {
    return this.#exitProcess;
  }

  getGroups(): Record<string, string[]> {
    return Object.assign({}, this.#groups, this.#preservedGroups);
  }

  getHelp(): Promise<string> {
    this.#hasOutput = true;
    if (!this.#usage.hasCachedHelpMessage()) {
      if (!this.parsed) {
        const parse = this.#runYargsParserAndExecuteCommands(this.#processArgs, undefined, undefined, 0, true);
        if (isPromise(parse)) return parse.then(() => this.#usage.help());
      }
      const builderResponse = this.#command.runDefaultBuilderOn(this);
      if (isPromise(builderResponse)) return builderResponse.then(() => this.#usage.help());
    }
    return Promise.resolve(this.#usage.help());
  }

  getOptions(): Options {
    return this.#options;
  }

  getStrict(): boolean {
    return this.#strict;
  }

  getStrictCommands(): boolean {
    return this.#strictCommands;
  }

  getStrictOptions(): boolean {
    return this.#strictOptions;
  }

  global(globals: string | string[], global?: boolean): this {
    argsert('<string|array> [boolean]', [globals, global], arguments.length);
    globals = ([] as string[]).concat(globals);
    if (global !== false) this.#options.local = this.#options.local.filter((l) => globals.indexOf(l) === -1);
    else {
      globals.forEach((g) => {
        if (!this.#options.local.includes(g)) this.#options.local.push(g);
      });
    }
    return this;
  }

  group(opts: string | string[], groupName: string): this {
    argsert('<string|array> <string>', [opts, groupName], arguments.length);
    const existing = this.#preservedGroups[groupName] || this.#groups[groupName];
    if (this.#preservedGroups[groupName]) delete this.#preservedGroups[groupName];
    const seen: Record<string, boolean> = {};
    this.#groups[groupName] = (existing || []).concat(opts).filter((key) => {
      if (seen[key]) return false;
      return (seen[key] = true);
    });
    return this;
  }

  hide(key: string): this {
    argsert('<string>', [key], arguments.length);
    this.#options.hiddenOptions.push(key);
    return this;
  }

  implies(key: string | Record<string, any>, value?: number | string | string[]): this {
    argsert('<string|object> [number|string|array]', [key, value], arguments.length);
    this.#validation.implies(key, value);
    return this;
  }

  locale(locale?: string): this | string {
    argsert('[string]', [locale], arguments.length);
    if (locale === undefined) {
      this.#guessLocale();
      return this.#shim.y18n.getLocale();
    }
    this.#detectLocale = false;
    this.#shim.y18n.setLocale(locale);
    return this;
  }

  middleware(callback: Middleware | Middleware[], applyBeforeValidation?: boolean, global?: boolean): this {
    return this.#globalMiddleware.addMiddleware(callback, !!applyBeforeValidation, global) as this;
  }

  nargs(key: string | string[] | Record<string, number>, value?: number): this {
    argsert('<string|object|array> [number]', [key, value], arguments.length);
    this.#populateParserHintSingleValueDictionary(this.nargs.bind(this), 'narg', key, value);
    return this;
  }

  normalize(keys: string | string[]): this {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('normalize', keys);
    return this;
  }

  number(keys: string | string[]): this {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('number', keys);
    this.#trackManuallySetKeys(keys);
    return this;
  }

  option(key: string | Record<string, any>, opt?: any): this {
    argsert('<string|object> [object]', [key, opt], arguments.length);
    if (typeof key === 'object') {
      Object.keys(key).forEach((k) => {
        this.options(k, key[k]);
      });
    } else {
      if (typeof opt !== 'object') opt = {};
      this.#trackManuallySetKeys(key);
      if (this.#versionOpt && (key === 'version' || opt?.alias === 'version')) {
        this.#emitWarning(
          [
            '"version" is a reserved word.',
            'Please do one of the following:',
            '- Disable version with `yargs.version(false)` if using "version" as an option',
            '- Use the built-in `yargs.version` method instead (if applicable)',
            '- Use a different option key',
            'https://yargs.js.org/docs/#api-reference-version',
          ].join('\n'),
          undefined,
          'versionWarning',
        );
      }
      this.#options.key[key] = true;
      if (opt.alias) this.alias(key, opt.alias);
      const deprecate = opt.deprecate || opt.deprecated;
      if (deprecate) this.deprecateOption(key, deprecate);
      const demand = opt.demand || opt.required || opt.require;
      if (demand) this.demand(key, demand);
      if (opt.demandOption) this.demandOption(key, typeof opt.demandOption === 'string' ? opt.demandOption : undefined);
      if (opt.conflicts) this.conflicts(key, opt.conflicts);
      if ('default' in opt) this.default(key, opt.default);
      if (opt.implies !== undefined) this.implies(key, opt.implies);
      if (opt.nargs !== undefined) this.nargs(key, opt.nargs);
      if (opt.config) this.config(key, opt.configParser);
      if (opt.normalize) this.normalize(key);
      if (opt.choices) this.choices(key, opt.choices);
      if (opt.coerce) this.coerce(key, opt.coerce);
      if (opt.group) this.group(key, opt.group);
      if (opt.boolean || opt.type === 'boolean') {
        this.boolean(key);
        if (opt.alias) this.boolean(opt.alias);
      }
      if (opt.array || opt.type === 'array') {
        this.array(key);
        if (opt.alias) this.array(opt.alias);
      }
      if (opt.number || opt.type === 'number') {
        this.number(key);
        if (opt.alias) this.number(opt.alias);
      }
      if (opt.string || opt.type === 'string') {
        this.string(key);
        if (opt.alias) this.string(opt.alias);
      }
      if (opt.count || opt.type === 'count') this.count(key);
      if (typeof opt.global === 'boolean') this.global(key, opt.global);
      if (opt.defaultDescription) this.#options.defaultDescription[key] = opt.defaultDescription;
      if (opt.skipValidation) this.skipValidation(key);
      const desc = opt.describe || opt.description || opt.desc;
      const descriptions = this.#usage.getDescriptions();
      if (!Object.prototype.hasOwnProperty.call(descriptions, key) || typeof desc === 'string') this.describe(key, desc);
      if (opt.hidden) this.hide(key);
      if (opt.requiresArg) this.requiresArg(key);
    }
    return this;
  }

  options(key: string | Record<string, any>, opt?: any): this {
    return this.option(key, opt);
  }

  parse(args?: string | string[], shortCircuit?: object | ParseCallback | boolean, _parseFn?: ParseCallback): any {
    argsert('[string|array] [function|boolean|object] [function]', [args, shortCircuit, _parseFn], arguments.length);
    this.#freeze();
    if (typeof args === 'undefined') args = this.#processArgs;
    if (typeof shortCircuit === 'object') {
      this.#parseContext = shortCircuit;
      shortCircuit = _parseFn;
    }
    if (typeof shortCircuit === 'function') {
      this.#parseFn = shortCircuit as ParseCallback;
      shortCircuit = false;
    }
    if (!shortCircuit) this.#processArgs = args;
    if (this.#parseFn) this.#exitProcess = false;
    const parsed = this.#runYargsParserAndExecuteCommands(args, !!shortCircuit);
    const tmpParsed = this.parsed;
    (this.#completion as CompletionInstance).setParsed(this.parsed);
    if (isPromise(parsed)) {
      return parsed
        .then((argv: any) => {
          if (this.#parseFn) this.#parseFn.call(this, this.#exitError, argv, this.#output);
          return argv;
        })
        .catch((err: Error) => {
          if (this.#parseFn) this.#parseFn(err as any, this.parsed.argv, this.#output);
          throw err;
        })
        .finally(() => {
          this.#unfreeze();
          this.parsed = tmpParsed;
        });
    }
    if (this.#parseFn) this.#parseFn.call(this, this.#exitError, parsed, this.#output);
    this.#unfreeze();
    this.parsed = tmpParsed;
    return parsed;
  }

  parseAsync(args?: string | string[], shortCircuit?: object | ParseCallback | boolean, _parseFn?: ParseCallback): Promise<any> {
    const maybePromise = this.parse(args, shortCircuit, _parseFn);
    return !isPromise(maybePromise) ? Promise.resolve(maybePromise) : maybePromise;
  }

  parseSync(args?: string | string[], shortCircuit?: object | ParseCallback | boolean, _parseFn?: ParseCallback): any {
    const maybePromise = this.parse(args, shortCircuit, _parseFn);
    if (isPromise(maybePromise)) throw new YError('.parseSync() must not be used with asynchronous builders, handlers, or middleware');
    return maybePromise;
  }

  parserConfiguration(config: Record<string, any>): this {
    argsert('<object>', [config], arguments.length);
    this.#parserConfig = config;
    return this;
  }

  pkgConf(key: string, rootPath?: string): this {
    argsert('<string> [string]', [key, rootPath], arguments.length);
    let conf: Record<string, any> | null = null;
    const obj = this.#pkgUp(rootPath || this.#cwd);
    if (obj[key] && typeof obj[key] === 'object') {
      conf = applyExtends(obj[key], rootPath || this.#cwd, this.#getParserConfiguration()['deep-merge-config'] || false);
      this.#options.configObjects = (this.#options.configObjects || []).concat(conf);
    }
    return this;
  }

  positional(key: string, opts: Record<string, any>): this {
    argsert('<string> <object>', [key, opts], arguments.length);
    const supportedOpts = ['default', 'defaultDescription', 'implies', 'normalize', 'choices', 'conflicts', 'coerce', 'type', 'describe', 'desc', 'description', 'alias'];
    opts = objFilter(opts, (k, v) => {
      if (k === 'type' && !['string', 'number', 'boolean'].includes(v)) return false;
      return supportedOpts.includes(k);
    });
    const fullCommand = this.#context.fullCommands[this.#context.fullCommands.length - 1];
    const parseOptions: Record<string, any> = fullCommand ? this.#command.cmdToParseOptions(fullCommand) : { array: [], alias: {}, default: {}, demand: {} };
    objectKeys(parseOptions).forEach((pk) => {
      const parseOption = parseOptions[pk];
      if (Array.isArray(parseOption)) {
        if (parseOption.indexOf(key) !== -1) opts[pk] = true;
      } else if (parseOption[key] && !(pk in opts)) opts[pk] = parseOption[key];
    });
    this.group(key, this.#usage.getPositionalGroupName());
    return this.option(key, opts);
  }

  recommendCommands(recommend = true): this {
    argsert('[boolean]', [recommend], arguments.length);
    this.#recommendCommands = recommend;
    return this;
  }

  required(keys: string | string[] | number | Record<string, any>, max?: number | string | string[] | boolean, msg?: string | boolean): this {
    return this.demand(keys, max, msg);
  }

  require(keys: string | string[] | number | Record<string, any>, max?: number | string | string[] | boolean, msg?: string | boolean): this {
    return this.demand(keys, max, msg);
  }

  requiresArg(keys: string | string[] | Record<string, any>): this {
    argsert('<array|string|object> [number]', [keys], arguments.length);
    if (typeof keys === 'string' && this.#options.narg[keys]) return this;
    this.#populateParserHintSingleValueDictionary(this.requiresArg.bind(this), 'narg', keys, NaN);
    return this;
  }

  showCompletionScript($0?: string, cmd?: string): this {
    argsert('[string] [string]', [$0, cmd], arguments.length);
    $0 = $0 || this.$0;
    this.#logger.log((this.#completion as CompletionInstance).generateCompletionScript($0, cmd || this.#completionCommand || 'completion'));
    return this;
  }

  showHelp(level?: 'error' | 'log' | ((message: string) => void)): this {
    argsert('[string|function]', [level], arguments.length);
    this.#hasOutput = true;
    if (!this.#usage.hasCachedHelpMessage()) {
      if (!this.parsed) {
        const parse = this.#runYargsParserAndExecuteCommands(this.#processArgs, undefined, undefined, 0, true);
        if (isPromise(parse)) {
          parse.then(() => {
            this.#usage.showHelp(level);
          });
          return this;
        }
      }
      const builderResponse = this.#command.runDefaultBuilderOn(this);
      if (isPromise(builderResponse)) {
        builderResponse.then(() => {
          this.#usage.showHelp(level);
        });
        return this;
      }
    }
    this.#usage.showHelp(level);
    return this;
  }

  scriptName(scriptName: string): this {
    this.customScriptName = true;
    this.$0 = scriptName;
    return this;
  }

  showHelpOnFail(enabled?: string | boolean, message?: string): this {
    argsert('[boolean|string] [string]', [enabled, message], arguments.length);
    this.#usage.showHelpOnFail(enabled, message);
    return this;
  }

  showVersion(level?: 'error' | 'log' | ((message: string) => void)): this {
    argsert('[string|function]', [level], arguments.length);
    this.#usage.showVersion(level);
    return this;
  }

  skipValidation(keys: string | string[]): this {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('skipValidation', keys);
    return this;
  }

  strict(enabled?: boolean): this {
    argsert('[boolean]', [enabled], arguments.length);
    this.#strict = enabled !== false;
    return this;
  }

  strictCommands(enabled?: boolean): this {
    argsert('[boolean]', [enabled], arguments.length);
    this.#strictCommands = enabled !== false;
    return this;
  }

  strictOptions(enabled?: boolean): this {
    argsert('[boolean]', [enabled], arguments.length);
    this.#strictOptions = enabled !== false;
    return this;
  }

  string(keys: string | string[]): this {
    argsert('<array|string>', [keys], arguments.length);
    this.#populateParserHintArray('string', keys);
    this.#trackManuallySetKeys(keys);
    return this;
  }

  terminalWidth(): number | null {
    argsert([], 0);
    return this.#shim.process.stdColumns;
  }

  updateLocale(obj: Record<string, any>): this {
    return this.updateStrings(obj);
  }

  updateStrings(obj: Record<string, any>): this {
    argsert('<object>', [obj], arguments.length);
    this.#detectLocale = false;
    this.#shim.y18n.updateLocale(obj);
    return this;
  }

  usage(msg: string | null, description?: string | false, builder?: any, handler?: any): this {
    argsert('<string|null|undefined> [string|boolean] [function|object] [function]', [msg, description, builder, handler], arguments.length);
    if (description !== undefined) {
      this.#shim.assert.notStrictEqual(msg, null);
      if (/^\$0( |$)/.exec(msg || '')) return this.command(msg, description, builder, handler);
      throw new YError('.usage() description must start with $0 if being used as alias for .command()');
    }
    this.#usage.usage(msg);
    return this;
  }

  usageConfiguration(config: Record<string, any>): this {
    argsert('<object>', [config], arguments.length);
    this.#usageConfig = config;
    return this;
  }

  version(opt?: string | false, msg?: string, ver?: string): this {
    const defaultVersionOpt = 'version';
    argsert('[boolean|string] [string] [string]', [opt, msg, ver], arguments.length);
    if (this.#versionOpt) {
      this.#deleteFromParserHintObject(this.#versionOpt);
      this.#usage.version(undefined);
      this.#versionOpt = null;
    }
    if (arguments.length === 0) {
      ver = this.#guessVersion();
      opt = defaultVersionOpt;
    } else if (arguments.length === 1) {
      if (opt === false) return this;
      ver = opt;
      opt = defaultVersionOpt;
    } else if (arguments.length === 2) {
      ver = msg;
      msg = undefined;
    }
    this.#versionOpt = typeof opt === 'string' ? opt : defaultVersionOpt;
    msg = msg || this.#usage.deferY18nLookup('Show version number');
    this.#usage.version(ver || undefined);
    this.boolean(this.#versionOpt);
    this.describe(this.#versionOpt, msg);
    return this;
  }

  wrap(cols: number | null | undefined): this {
    argsert('<number|null|undefined>', [cols], arguments.length);
    this.#usage.wrap(cols);
    return this;
  }

  #copyDoubleDash(argv: any): any {
    if (!argv._ || !argv['--']) return argv;
    argv._.push.apply(argv._, argv['--']);
    try {
      delete argv['--'];
    } catch {
      // a frozen argv keeps its `--`; yargs ignores the failure
    }
    return argv;
  }

  #createLogger(): Logger {
    return {
      log: (...args: any[]) => {
        if (!this.#hasParseCallback()) console.log(...args);
        this.#hasOutput = true;
        if (this.#output.length) this.#output += '\n';
        this.#output += args.join(' ');
      },
      error: (...args: any[]) => {
        if (!this.#hasParseCallback()) console.error(...args);
        this.#hasOutput = true;
        if (this.#output.length) this.#output += '\n';
        this.#output += args.join(' ');
      },
    };
  }

  #deleteFromParserHintObject(optionKey: string): void {
    objectKeys(this.#options).forEach((hintKey) => {
      if (hintKey === 'configObjects') return;
      const hint: any = this.#options[hintKey];
      if (Array.isArray(hint)) {
        if (hint.includes(optionKey)) hint.splice(hint.indexOf(optionKey), 1);
      } else if (typeof hint === 'object') delete hint[optionKey];
    });
    delete this.#usage.getDescriptions()[optionKey];
  }

  #emitWarning(warning: string, type: string | undefined, deduplicationId: string): void {
    if (!this.#emittedWarnings[deduplicationId]) {
      this.#shim.process.emitWarning(warning, type);
      this.#emittedWarnings[deduplicationId] = true;
    }
  }

  #freeze(): void {
    this.#frozens.push({
      options: this.#options,
      configObjects: this.#options.configObjects.slice(0),
      exitProcess: this.#exitProcess,
      groups: this.#groups,
      strict: this.#strict,
      strictCommands: this.#strictCommands,
      strictOptions: this.#strictOptions,
      completionCommand: this.#completionCommand,
      output: this.#output,
      exitError: this.#exitError,
      hasOutput: this.#hasOutput,
      parsed: this.parsed,
      parseFn: this.#parseFn,
      parseContext: this.#parseContext,
    });
    this.#usage.freeze();
    this.#validation.freeze();
    this.#command.freeze();
    this.#globalMiddleware.freeze();
  }

  #getDollarZero(): string {
    let $0 = '';
    let default$0: string[];
    if (/\b(node|iojs|electron|bun)(\.exe)?$/.test(this.#shim.process.argv()[0] as string)) default$0 = this.#shim.process.argv().slice(1, 2);
    else default$0 = this.#shim.process.argv().slice(0, 1);
    $0 = default$0
      .map((x) => {
        const b = this.#rebase(this.#cwd, x);
        return /^(\/|([a-zA-Z]:)?\\)/.exec(x) && b.length < x.length ? b : x;
      })
      .join(' ')
      .trim();
    if (this.#shim.getEnv('_') && this.#shim.getProcessArgvBin() === this.#shim.getEnv('_')) {
      $0 = (this.#shim.getEnv('_') as string).replace(`${this.#shim.path.dirname(this.#shim.process.execPath())}/`, '');
    }
    return $0;
  }

  #getParserConfiguration(): Record<string, any> {
    return this.#parserConfig;
  }

  #getUsageConfiguration(): Record<string, any> {
    return this.#usageConfig;
  }

  #guessLocale(): void {
    if (!this.#detectLocale) return;
    const locale = this.#shim.getEnv('LC_ALL') || this.#shim.getEnv('LC_MESSAGES') || this.#shim.getEnv('LANG') || this.#shim.getEnv('LANGUAGE') || 'en_US';
    this.locale(locale.replace(/[.:].*/, ''));
  }

  #guessVersion(): string {
    const obj = this.#pkgUp();
    return obj.version || 'unknown';
  }

  #parsePositionalNumbers(argv: any): any {
    const args: any[] = argv['--'] ? argv['--'] : argv._;
    for (let i = 0, arg; (arg = args[i]) !== undefined; i++) {
      if (this.#shim.Parser.looksLikeNumber(arg) && Number.isSafeInteger(Math.floor(parseFloat(`${arg}`)))) args[i] = Number(arg);
    }
    return argv;
  }

  #pkgUp(rootPath?: string): Record<string, any> {
    const npath = rootPath || '*';
    if (this.#pkgs[npath]) return this.#pkgs[npath] as Record<string, any>;
    let obj: Record<string, any> = {};
    try {
      let startDir = rootPath || this.#shim.mainFilename;
      if (this.#shim.path.extname(startDir)) startDir = this.#shim.path.dirname(startDir);
      const pkgJsonPath = this.#shim.findUp(startDir, (_dir, names) => {
        if (names.includes('package.json')) return 'package.json';
        return undefined;
      });
      this.#shim.assert.notStrictEqual(pkgJsonPath, undefined);
      obj = JSON.parse(this.#shim.readFileSync(pkgJsonPath as string, 'utf8'));
    } catch {
      // no package.json above: version reads 'unknown', as upstream
    }
    this.#pkgs[npath] = obj || {};
    return this.#pkgs[npath] as Record<string, any>;
  }

  #populateParserHintArray(type: 'array' | 'boolean' | 'string' | 'skipValidation' | 'count' | 'normalize' | 'number' | 'hiddenOptions', keys: string | string[]): void {
    keys = ([] as string[]).concat(keys);
    keys.forEach((key) => {
      key = this.#sanitizeKey(key);
      this.#options[type].push(key);
    });
  }

  #populateParserHintSingleValueDictionary(builder: (key: any, value: any) => any, type: string, key: any, value: any): void {
    this.#populateParserHintDictionary(builder, type, key, value, (t, k, v) => {
      (this.#options as any)[t][k] = v;
    });
  }

  #populateParserHintArrayDictionary(builder: (key: any, value: any) => any, type: string, key: any, value: any): void {
    this.#populateParserHintDictionary(builder, type, key, value, (t, k, v) => {
      (this.#options as any)[t][k] = ((this.#options as any)[t][k] || []).concat(v);
    });
  }

  #populateParserHintDictionary(builder: (key: any, value: any) => any, type: string, key: any, value: any, singleKeyHandler: (type: string, key: string, value: any) => void): void {
    if (Array.isArray(key)) {
      key.forEach((k) => {
        builder(k, value);
      });
    } else if (typeof key === 'object') {
      for (const k of objectKeys(key)) builder(k, key[k]);
    } else singleKeyHandler(type, this.#sanitizeKey(key), value);
  }

  #sanitizeKey(key: string): string {
    if (key === '__proto__') return '___proto___';
    return key;
  }

  #setKey(key: string | string[] | Record<string, any>, set?: boolean | string): this {
    this.#populateParserHintSingleValueDictionary(this.#setKey.bind(this), 'key', key, set);
    return this;
  }

  #unfreeze(): void {
    const frozen = this.#frozens.pop();
    this.#shim.assert.notStrictEqual(frozen, undefined);
    const f = frozen as Frozen;
    this.#options = f.options;
    this.#exitProcess = f.exitProcess;
    this.#groups = f.groups;
    this.#output = f.output;
    this.#exitError = f.exitError;
    this.#hasOutput = f.hasOutput;
    this.parsed = f.parsed;
    this.#strict = f.strict;
    this.#strictCommands = f.strictCommands;
    this.#strictOptions = f.strictOptions;
    this.#completionCommand = f.completionCommand;
    this.#parseFn = f.parseFn;
    this.#parseContext = f.parseContext;
    this.#options.configObjects = f.configObjects;
    this.#usage.unfreeze();
    this.#validation.unfreeze();
    this.#command.unfreeze();
    this.#globalMiddleware.unfreeze();
  }

  #validateAsync(validation: (argv: any) => void, argv: any): any {
    return maybeAsyncResult(argv, (result: any) => {
      validation(result);
      return result;
    });
  }

  getInternalMethods(): {
    getCommandInstance: () => CommandInstance;
    getContext: () => Context;
    getHasOutput: () => boolean;
    getLoggerInstance: () => Logger;
    getParseContext: () => object;
    getParserConfiguration: () => Record<string, any>;
    getUsageConfiguration: () => Record<string, any>;
    getUsageInstance: () => UsageInstance;
    getValidationInstance: () => ValidationInstance;
    hasParseCallback: () => boolean;
    isGlobalContext: () => boolean;
    postProcess: (argv: any, populateDoubleDash: boolean, calledFromCommand: boolean, runGlobalMiddleware: boolean) => any;
    reset: (aliases?: Record<string, string[]>) => YargsInstance;
    runValidation: (aliases: Record<string, string[]>, positionalMap: Record<string, string[]>, parseErrors: Error | null, isDefaultCommand?: boolean) => (argv: any) => void;
    runYargsParserAndExecuteCommands: (args: string | string[] | null, shortCircuit?: boolean, calledFromCommand?: boolean, commandIndex?: number, helpOnly?: boolean) => any;
    setHasOutput: () => void;
  } {
    return {
      getCommandInstance: this.#getCommandInstance.bind(this),
      getContext: this.#getContext.bind(this),
      getHasOutput: this.#getHasOutput.bind(this),
      getLoggerInstance: this.#getLoggerInstance.bind(this),
      getParseContext: this.#getParseContext.bind(this),
      getParserConfiguration: this.#getParserConfiguration.bind(this),
      getUsageConfiguration: this.#getUsageConfiguration.bind(this),
      getUsageInstance: this.#getUsageInstance.bind(this),
      getValidationInstance: this.#getValidationInstance.bind(this),
      hasParseCallback: this.#hasParseCallback.bind(this),
      isGlobalContext: this.#isGlobalContextFn.bind(this),
      postProcess: this.#postProcess.bind(this),
      reset: this.#reset.bind(this),
      runValidation: this.#runValidation.bind(this),
      runYargsParserAndExecuteCommands: this.#runYargsParserAndExecuteCommands.bind(this),
      setHasOutput: this.#setHasOutput.bind(this),
    };
  }

  #getCommandInstance(): CommandInstance {
    return this.#command;
  }

  #getContext(): Context {
    return this.#context;
  }

  #getHasOutput(): boolean {
    return this.#hasOutput;
  }

  #getLoggerInstance(): Logger {
    return this.#logger;
  }

  #getParseContext(): object {
    return this.#parseContext || {};
  }

  #getUsageInstance(): UsageInstance {
    return this.#usage;
  }

  #getValidationInstance(): ValidationInstance {
    return this.#validation;
  }

  #hasParseCallback(): boolean {
    return !!this.#parseFn;
  }

  #isGlobalContextFn(): boolean {
    return this.#isGlobalContext;
  }

  #postProcess(argv: any, populateDoubleDash: boolean, calledFromCommand: boolean, runGlobalMiddleware: boolean): any {
    if (calledFromCommand) return argv;
    if (isPromise(argv)) return argv;
    if (!populateDoubleDash) argv = this.#copyDoubleDash(argv);
    const parsePositionalNumbers = this.#getParserConfiguration()['parse-positional-numbers'] || this.#getParserConfiguration()['parse-positional-numbers'] === undefined;
    if (parsePositionalNumbers) argv = this.#parsePositionalNumbers(argv);
    if (runGlobalMiddleware) argv = applyMiddleware(argv, this, this.#globalMiddleware.getMiddleware(), false);
    return argv;
  }

  #reset(aliases: Record<string, string[]> = {}): YargsInstance {
    this.#options = this.#options || ({} as Options);
    const tmpOptions = {} as Options;
    tmpOptions.local = this.#options.local || [];
    tmpOptions.configObjects = this.#options.configObjects || [];
    const localLookup: Record<string, boolean> = {};
    tmpOptions.local.forEach((l) => {
      localLookup[l] = true;
      (aliases[l] || []).forEach((a) => {
        localLookup[a] = true;
      });
    });
    Object.assign(
      this.#preservedGroups,
      Object.keys(this.#groups).reduce((acc: Record<string, string[]>, groupName) => {
        const keys = (this.#groups[groupName] as string[]).filter((key) => !(key in localLookup));
        if (keys.length > 0) acc[groupName] = keys;
        return acc;
      }, {}),
    );
    this.#groups = {};
    const arrayOptions = ['array', 'boolean', 'string', 'skipValidation', 'count', 'normalize', 'number', 'hiddenOptions'] as const;
    const objectOptions = ['narg', 'key', 'alias', 'default', 'defaultDescription', 'config', 'choices', 'demandedOptions', 'demandedCommands', 'deprecatedOptions'] as const;
    arrayOptions.forEach((k) => {
      tmpOptions[k] = (this.#options[k] || []).filter((key: string) => !localLookup[key]);
    });
    objectOptions.forEach((k) => {
      (tmpOptions as any)[k] = objFilter(this.#options[k], (key) => !localLookup[key]);
    });
    tmpOptions.envPrefix = this.#options.envPrefix;
    this.#options = tmpOptions;
    this.#usage = this.#usage ? this.#usage.reset(localLookup) : Usage(this, this.#shim);
    this.#validation = this.#validation ? this.#validation.reset(localLookup) : Validation(this, this.#usage, this.#shim);
    this.#command = this.#command ? this.#command.reset() : Command(this.#usage, this.#validation, this.#globalMiddleware, this.#shim);
    if (!this.#completion) this.#completion = Completion(this, this.#usage, this.#command, this.#shim);
    this.#globalMiddleware.reset();
    this.#completionCommand = null;
    this.#output = '';
    this.#exitError = null;
    this.#hasOutput = false;
    this.parsed = false;
    return this;
  }

  #rebase(base: string, dir: string): string {
    return this.#shim.path.relative(base, dir);
  }

  #runYargsParserAndExecuteCommands(args: string | string[] | null, shortCircuit?: boolean, calledFromCommand?: boolean, commandIndex = 0, helpOnly = false): any {
    let skipValidation = !!calledFromCommand || helpOnly;
    args = args || this.#processArgs;
    this.#options.__ = this.#shim.y18n.__;
    this.#options.configuration = this.#getParserConfiguration();
    const populateDoubleDash = !!this.#options.configuration['populate--'];
    const config = Object.assign({}, this.#options.configuration, { 'populate--': true });
    const parsed = this.#shim.Parser.detailed(args, Object.assign({}, this.#options, { configuration: { 'parse-positional-numbers': false, ...config } }));
    const argv = Object.assign(parsed.argv, this.#parseContext);
    let argvPromise: any = undefined;
    const aliases = parsed.aliases;
    let helpOptSet = false;
    let versionOptSet = false;
    Object.keys(argv).forEach((key) => {
      if (key === this.#helpOpt && argv[key]) helpOptSet = true;
      else if (key === this.#versionOpt && argv[key]) versionOptSet = true;
    });
    argv.$0 = this.$0;
    this.parsed = parsed;
    if (commandIndex === 0) this.#usage.clearCachedHelpMessage();
    try {
      this.#guessLocale();
      if (shortCircuit) return this.#postProcess(argv, populateDoubleDash, !!calledFromCommand, false);
      if (this.#helpOpt) {
        const helpCmds = [this.#helpOpt].concat(aliases[this.#helpOpt] || []).filter((k) => k.length > 1);
        if (helpCmds.includes(`${argv._[argv._.length - 1]}`)) {
          argv._.pop();
          helpOptSet = true;
        }
      }
      this.#isGlobalContext = false;
      const handlerKeys = this.#command.getCommands();
      const requestCompletions = this.#completion?.completionKey
        ? [this.#completion?.completionKey, ...(this.getAliases()[this.#completion?.completionKey] ?? [])].some((key) => Object.prototype.hasOwnProperty.call(argv, key))
        : false;
      const skipRecommendation = helpOptSet || requestCompletions || helpOnly;
      if (argv._.length) {
        if (handlerKeys.length) {
          let firstUnknownCommand: string | undefined;
          for (let i = commandIndex || 0, cmd; argv._[i] !== undefined; i++) {
            cmd = String(argv._[i]);
            if (handlerKeys.includes(cmd) && cmd !== this.#completionCommand) {
              const innerArgv = this.#command.runCommand(cmd, this, parsed, i + 1, helpOnly, helpOptSet || versionOptSet || helpOnly);
              return this.#postProcess(innerArgv, populateDoubleDash, !!calledFromCommand, false);
            } else if (!firstUnknownCommand && cmd !== this.#completionCommand) {
              firstUnknownCommand = cmd;
              break;
            }
          }
          if (!this.#command.hasDefaultCommand() && this.#recommendCommands && firstUnknownCommand && !skipRecommendation) {
            this.#validation.recommendCommands(firstUnknownCommand, handlerKeys);
          }
        }
        if (this.#completionCommand && argv._.includes(this.#completionCommand) && !requestCompletions) {
          if (this.#exitProcess) setBlocking(true);
          this.showCompletionScript();
          this.exit(0);
        }
      }
      if (this.#command.hasDefaultCommand() && !skipRecommendation) {
        const innerArgv = this.#command.runCommand(null, this, parsed, 0, helpOnly, helpOptSet || versionOptSet || helpOnly);
        return this.#postProcess(innerArgv, populateDoubleDash, !!calledFromCommand, false);
      }
      if (requestCompletions) {
        if (this.#exitProcess) setBlocking(true);
        args = ([] as string[]).concat(args);
        const completionArgs = args.slice(args.indexOf(`--${(this.#completion as CompletionInstance).completionKey}`) + 1);
        (this.#completion as CompletionInstance).getCompletion(completionArgs, (err, completions) => {
          if (err) throw new YError(err.message);
          (completions || []).forEach((completion) => {
            this.#logger.log(completion);
          });
          this.exit(0);
        });
        return this.#postProcess(argv, !populateDoubleDash, !!calledFromCommand, false);
      }
      if (!this.#hasOutput) {
        if (helpOptSet) {
          if (this.#exitProcess) setBlocking(true);
          skipValidation = true;
          this.showHelp((message) => {
            this.#logger.log(message);
            this.exit(0);
          });
        } else if (versionOptSet) {
          if (this.#exitProcess) setBlocking(true);
          skipValidation = true;
          this.#usage.showVersion('log');
          this.exit(0);
        }
      }
      if (!skipValidation && this.#options.skipValidation.length > 0) {
        skipValidation = Object.keys(argv).some((key) => this.#options.skipValidation.indexOf(key) >= 0 && argv[key] === true);
      }
      if (!skipValidation) {
        if (parsed.error) throw new YError(parsed.error.message);
        if (!requestCompletions) {
          const validation = this.#runValidation(aliases, {}, parsed.error);
          if (!calledFromCommand) argvPromise = applyMiddleware(argv, this, this.#globalMiddleware.getMiddleware(), true);
          argvPromise = this.#validateAsync(validation, argvPromise ?? argv);
          if (isPromise(argvPromise) && !calledFromCommand) {
            argvPromise = argvPromise.then(() => applyMiddleware(argv, this, this.#globalMiddleware.getMiddleware(), false));
          }
        }
      }
    } catch (err) {
      if (err instanceof YError) this.#usage.fail(err.message, err);
      else throw err;
    }
    return this.#postProcess(argvPromise ?? argv, populateDoubleDash, !!calledFromCommand, true);
  }

  #runValidation(aliases: Record<string, string[]>, positionalMap: Record<string, string[]>, parseErrors: Error | null, isDefaultCommand?: boolean): (argv: any) => void {
    const demandedOptions = { ...this.getDemandedOptions() };
    return (argv: any) => {
      if (parseErrors) throw new YError(parseErrors.message);
      this.#validation.nonOptionCount(argv);
      this.#validation.requiredArguments(argv, demandedOptions);
      let failedStrictCommands = false;
      if (this.#strictCommands) failedStrictCommands = this.#validation.unknownCommands(argv);
      if (this.#strict && !failedStrictCommands) this.#validation.unknownArguments(argv, aliases, positionalMap, !!isDefaultCommand);
      else if (this.#strictOptions) this.#validation.unknownArguments(argv, aliases, {}, false, false);
      this.#validation.limitedChoices(argv);
      this.#validation.implications(argv);
      this.#validation.conflicting(argv);
    };
  }

  #setHasOutput(): void {
    this.#hasOutput = true;
  }

  #trackManuallySetKeys(keys: string | string[]): void {
    if (typeof keys === 'string') this.#options.key[keys] = true;
    else {
      for (const k of keys) this.#options.key[k] = true;
    }
  }
}

export function isYargsInstance(y: any): y is YargsInstance {
  return !!y && typeof y.getInternalMethods === 'function';
}
