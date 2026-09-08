/**
 * yargs-parser 22, ported for `burgee/yargs` (J9: burgee depends on nothing, so the
 * parser yargs delegates to is ours too). Graded by yargs' own suite through
 * compat-oracle; every branch, error string and configuration flag is the upstream's.
 */
 
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { normalize, resolve } from 'node:path';
import { format } from 'node:util';

export interface ParserMixin {
  cwd: () => string;
  format: (...args: any[]) => string;
  normalize: (p: string) => string;
  resolve: (...p: string[]) => string;
  require: (p: string) => any;
  env: () => Record<string, string | undefined>;
}

export interface DetailedArguments {
  argv: Record<string, any>;
  error: Error | null;
  aliases: Record<string, string[]>;
  newAliases: Record<string, boolean>;
  defaulted: Record<string, boolean>;
  configuration: Record<string, any>;
}

export function camelCase(str: string): string {
  const isCamelCase = str !== str.toLowerCase() && str !== str.toUpperCase();
  if (!isCamelCase) str = str.toLowerCase();
  if (str.indexOf('-') === -1 && str.indexOf('_') === -1) return str;
  let camelcase = '';
  let nextChrUpper = false;
  const leadingHyphens = /^-+/.exec(str);
  for (let i = leadingHyphens ? leadingHyphens[0].length : 0; i < str.length; i++) {
    let chr = str.charAt(i);
    if (nextChrUpper) {
      nextChrUpper = false;
      chr = chr.toUpperCase();
    }
    if (i !== 0 && (chr === '-' || chr === '_')) nextChrUpper = true;
    else if (chr !== '-' && chr !== '_') camelcase += chr;
  }
  return camelcase;
}

export function decamelize(str: string, joinString?: string): string {
  const lowercase = str.toLowerCase();
  joinString = joinString || '-';
  let notCamelcase = '';
  for (let i = 0; i < str.length; i++) {
    const chrLower = lowercase.charAt(i);
    const chrString = str.charAt(i);
    if (chrLower !== chrString && i > 0) notCamelcase += `${joinString}${lowercase.charAt(i)}`;
    else notCamelcase += chrString;
  }
  return notCamelcase;
}

export function looksLikeNumber(x: any): boolean {
  if (x === null || x === undefined) return false;
  if (typeof x === 'number') return true;
  if (/^0x[0-9a-f]+$/i.test(x)) return true;
  if (/^0[^.]/.test(x)) return false;
  return /^[-]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x);
}

export function tokenizeArgString(argString: string | any[]): string[] {
  if (Array.isArray(argString)) return argString.map((e) => (typeof e !== 'string' ? `${e}` : e));
  argString = argString.trim();
  let i = 0;
  let prevC: string | null = null;
  let c: string | null = null;
  let opening: string | null = null;
  const args: string[] = [];
  for (let ii = 0; ii < argString.length; ii++) {
    prevC = c;
    c = argString.charAt(ii);
    if (c === ' ' && !opening) {
      if (!(prevC === ' ')) i++;
      continue;
    }
    if (c === opening) opening = null;
    else if ((c === "'" || c === '"') && !opening) opening = c;
    if (!args[i]) args[i] = '';
    args[i] += c;
  }
  return args;
}

const DefaultValuesForTypeKey = { BOOLEAN: 'boolean', STRING: 'string', NUMBER: 'number', ARRAY: 'array' } as const;

export class YargsParser {
  private readonly mixin: ParserMixin;
  constructor(mixin: ParserMixin) {
    this.mixin = mixin;
  }

  parse(argsInput: string | any[], options?: any): DetailedArguments {
    const mixin = this.mixin;
    const opts = Object.assign(
      {
        alias: undefined,
        array: undefined,
        boolean: undefined,
        config: undefined,
        configObjects: undefined,
        configuration: undefined,
        coerce: undefined,
        count: undefined,
        default: undefined,
        envPrefix: undefined,
        narg: undefined,
        normalize: undefined,
        string: undefined,
        number: undefined,
        __: undefined,
        key: undefined,
      },
      options,
    );
    const args = tokenizeArgString(argsInput);
    const inputIsString = typeof argsInput === 'string';
    const aliases = combineAliases(Object.assign(Object.create(null), opts.alias));
    const configuration = Object.assign(
      {
        'boolean-negation': true,
        'camel-case-expansion': true,
        'combine-arrays': false,
        'dot-notation': true,
        'duplicate-arguments-array': true,
        'flatten-duplicate-arrays': true,
        'greedy-arrays': true,
        'halt-at-non-option': false,
        'nargs-eats-options': false,
        'negation-prefix': 'no-',
        'parse-numbers': true,
        'parse-positional-numbers': true,
        'populate--': false,
        'set-placeholder-key': false,
        'short-option-groups': true,
        'strip-aliased': false,
        'strip-dashed': false,
        'unknown-options-as-args': false,
      },
      opts.configuration,
    );
    const defaults: any = Object.assign(Object.create(null), opts.default);
    const configObjects: any[] = opts.configObjects || [];
    const envPrefix = opts.envPrefix;
    const notFlagsOption = configuration['populate--'];
    const notFlagsArgv = notFlagsOption ? '--' : '_';
    const newAliases: any = Object.create(null);
    const defaulted: any = Object.create(null);
    const __ = opts.__ || mixin.format;
    const flags: any = {
      aliases: Object.create(null),
      arrays: Object.create(null),
      bools: Object.create(null),
      strings: Object.create(null),
      numbers: Object.create(null),
      counts: Object.create(null),
      normalize: Object.create(null),
      configs: Object.create(null),
      nargs: Object.create(null),
      coercions: Object.create(null),
      keys: [],
    };
    const negative = /^-([0-9]+(\.[0-9]+)?|\.[0-9]+)$/;
    const negatedBoolean = new RegExp(`^--${configuration['negation-prefix']}(.+)`);

    ([] as any[]).concat(opts.array || []).filter(Boolean).forEach((opt: any) => {
      const key = typeof opt === 'object' ? opt.key : opt;
      const assignment = Object.keys(opt)
        .map((k) => {
          const arrayFlagKeys: any = { boolean: 'bools', string: 'strings', number: 'numbers' };
          return arrayFlagKeys[k];
        })
        .filter(Boolean)
        .pop();
      if (assignment) flags[assignment][key] = true;
      flags.arrays[key] = true;
      flags.keys.push(key);
    });
    ([] as any[]).concat(opts.boolean || []).filter(Boolean).forEach((key) => {
      flags.bools[key] = true;
      flags.keys.push(key);
    });
    ([] as any[]).concat(opts.string || []).filter(Boolean).forEach((key) => {
      flags.strings[key] = true;
      flags.keys.push(key);
    });
    ([] as any[]).concat(opts.number || []).filter(Boolean).forEach((key) => {
      flags.numbers[key] = true;
      flags.keys.push(key);
    });
    ([] as any[]).concat(opts.count || []).filter(Boolean).forEach((key) => {
      flags.counts[key] = true;
      flags.keys.push(key);
    });
    ([] as any[]).concat(opts.normalize || []).filter(Boolean).forEach((key) => {
      flags.normalize[key] = true;
      flags.keys.push(key);
    });
    if (typeof opts.narg === 'object') {
      Object.entries(opts.narg).forEach(([key, value]) => {
        if (typeof value === 'number') {
          flags.nargs[key] = value;
          flags.keys.push(key);
        }
      });
    }
    if (typeof opts.coerce === 'object') {
      Object.entries(opts.coerce).forEach(([key, value]) => {
        if (typeof value === 'function') {
          flags.coercions[key] = value;
          flags.keys.push(key);
        }
      });
    }
    if (typeof opts.config !== 'undefined') {
      if (Array.isArray(opts.config) || typeof opts.config === 'string') {
        ([] as any[]).concat(opts.config).filter(Boolean).forEach((key) => {
          flags.configs[key] = true;
        });
      } else if (typeof opts.config === 'object') {
        Object.entries(opts.config).forEach(([key, value]) => {
          if (typeof value === 'boolean' || typeof value === 'function') flags.configs[key] = value;
        });
      }
    }

    extendAliases(opts.key, aliases, opts.default, flags.arrays);
    Object.keys(defaults).forEach((key) => {
      (flags.aliases[key] || []).forEach((alias: string) => {
        defaults[alias] = defaults[key];
      });
    });

    let error: Error | null = null;
    checkConfiguration();
    let notFlags: string[] = [];
    const argv: any = Object.assign(Object.create(null), { _: [] });
    const argvReturn: any = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i] as string;
      const truncatedArg = arg.replace(/^-{3,}/, '---');
      let broken: boolean;
      let key: string;
      let letters: string[];
      let m: RegExpMatchArray | null;
      let next: string | undefined;
      let value: string;
      if (arg !== '--' && /^-/.test(arg) && isUnknownOptionAsArg(arg)) {
        pushPositional(arg);
      } else if (/^---+(=|$)/.exec(truncatedArg)) {
        pushPositional(arg);
        continue;
      } else if (/^--.+=/.exec(arg) || (!configuration['short-option-groups'] && /^-.+=/.exec(arg))) {
        m = /^--?([^=]+)=([\s\S]*)$/.exec(arg);
        if (m !== null && Array.isArray(m) && m.length >= 3) {
          if (checkAllAliases(m[1] as string, flags.arrays)) i = eatArray(i, m[1] as string, args, m[2]);
          else if (checkAllAliases(m[1] as string, flags.nargs) !== false) i = eatNargs(i, m[1] as string, args, m[2]);
          else setArg(m[1] as string, m[2], true);
        }
      } else if (negatedBoolean.exec(arg) && configuration['boolean-negation']) {
        m = negatedBoolean.exec(arg);
        if (m !== null && Array.isArray(m) && m.length >= 2) {
          key = m[1] as string;
          setArg(key, checkAllAliases(key, flags.arrays) ? [false] : false);
        }
      } else if (/^--.+/.exec(arg) || (!configuration['short-option-groups'] && /^-[^-]+/.exec(arg))) {
        m = /^--?(.+)/.exec(arg);
        if (m !== null && Array.isArray(m) && m.length >= 2) {
          key = m[1] as string;
          if (checkAllAliases(key, flags.arrays)) i = eatArray(i, key, args);
          else if (checkAllAliases(key, flags.nargs) !== false) i = eatNargs(i, key, args);
          else {
            next = args[i + 1];
            if (
              next !== undefined &&
              (!/^-/.exec(next) || negative.exec(next)) &&
              !checkAllAliases(key, flags.bools) &&
              !checkAllAliases(key, flags.counts)
            ) {
              setArg(key, next);
              i++;
            } else if (/^(true|false)$/.test(next as string)) {
              setArg(key, next);
              i++;
            } else setArg(key, defaultValue(key));
          }
        }
      } else if (/^-.\..+=/.exec(arg)) {
        m = /^-([^=]+)=([\s\S]*)$/.exec(arg);
        if (m !== null && Array.isArray(m) && m.length >= 3) setArg(m[1] as string, m[2]);
      } else if (/^-.\..+/.exec(arg) && !negative.exec(arg)) {
        next = args[i + 1];
        m = /^-(.\..+)/.exec(arg);
        if (m !== null && Array.isArray(m) && m.length >= 2) {
          key = m[1] as string;
          if (next !== undefined && !/^-/.exec(next) && !checkAllAliases(key, flags.bools) && !checkAllAliases(key, flags.counts)) {
            setArg(key, next);
            i++;
          } else setArg(key, defaultValue(key));
        }
      } else if (/^-[^-]+/.exec(arg) && !negative.exec(arg)) {
        letters = arg.slice(1, -1).split('');
        broken = false;
        for (let j = 0; j < letters.length; j++) {
          next = arg.slice(j + 2);
          if (letters[j + 1] && letters[j + 1] === '=') {
            value = arg.slice(j + 3);
            key = letters[j] as string;
            if (checkAllAliases(key, flags.arrays)) i = eatArray(i, key, args, value);
            else if (checkAllAliases(key, flags.nargs) !== false) i = eatNargs(i, key, args, value);
            else setArg(key, value);
            broken = true;
            break;
          }
          if (next === '-') {
            setArg(letters[j] as string, next);
            continue;
          }
          if (/[A-Za-z]/.test(letters[j] as string) && /^-?\d+(\.\d*)?(e-?\d+)?$/.test(next) && checkAllAliases(next, flags.bools) === false) {
            setArg(letters[j] as string, next);
            broken = true;
            break;
          }
          if (letters[j + 1] && /\W/.exec(letters[j + 1] as string)) {
            setArg(letters[j] as string, next);
            broken = true;
            break;
          } else setArg(letters[j] as string, defaultValue(letters[j] as string));
        }
        key = arg.slice(-1)[0] as string;
        if (!broken && key !== '-') {
          if (checkAllAliases(key, flags.arrays)) i = eatArray(i, key, args);
          else if (checkAllAliases(key, flags.nargs) !== false) i = eatNargs(i, key, args);
          else {
            next = args[i + 1];
            if (
              next !== undefined &&
              (!/^(-|--)[^-]/.test(next) || negative.exec(next)) &&
              !checkAllAliases(key, flags.bools) &&
              !checkAllAliases(key, flags.counts)
            ) {
              setArg(key, next);
              i++;
            } else if (/^(true|false)$/.test(next as string)) {
              setArg(key, next);
              i++;
            } else setArg(key, defaultValue(key));
          }
        }
      } else if (/^-[0-9]$/.exec(arg) && negative.exec(arg) && checkAllAliases(arg.slice(1), flags.bools)) {
        key = arg.slice(1);
        setArg(key, defaultValue(key));
      } else if (arg === '--') {
        notFlags = args.slice(i + 1);
        break;
      } else if (configuration['halt-at-non-option']) {
        notFlags = args.slice(i);
        break;
      } else pushPositional(arg);
    }

    applyEnvVars(argv, true);
    applyEnvVars(argv, false);
    setConfig(argv);
    setConfigObjects();
    applyDefaultsAndAliases(argv, flags.aliases, defaults, true);
    applyCoercions(argv);
    if (configuration['set-placeholder-key']) setPlaceholderKeys(argv);
    Object.keys(flags.counts).forEach((key) => {
      if (!hasKey(argv, key.split('.'))) setArg(key, 0);
    });
    if (notFlagsOption && notFlags.length) argv[notFlagsArgv] = [];
    notFlags.forEach((key) => {
      argv[notFlagsArgv].push(key);
    });
    if (configuration['camel-case-expansion'] && configuration['strip-dashed']) {
      Object.keys(argv)
        .filter((key) => key !== '--' && key.includes('-'))
        .forEach((key) => {
          delete argv[key];
        });
    }
    if (configuration['strip-aliased']) {
      ([] as string[]).concat(...Object.keys(aliases).map((k) => aliases[k] as string[])).forEach((alias) => {
        if (configuration['camel-case-expansion'] && alias.includes('-')) {
          delete argv[alias.split('.').map((prop) => camelCase(prop)).join('.')];
        }
        delete argv[alias];
      });
    }

    function pushPositional(arg: string): void {
      const maybeCoercedNumber = maybeCoerceNumber('_', arg);
      if (typeof maybeCoercedNumber === 'string' || typeof maybeCoercedNumber === 'number') argv._.push(maybeCoercedNumber);
    }

    function eatNargs(i: number, key: string, args: string[], argAfterEqualSign?: string): number {
      let ii: number;
      let toEat: any = checkAllAliases(key, flags.nargs);
      toEat = typeof toEat !== 'number' || isNaN(toEat) ? 1 : toEat;
      if (toEat === 0) {
        if (!isUndefined(argAfterEqualSign)) error = Error(__('Argument unexpected for: %s', key));
        setArg(key, defaultValue(key));
        return i;
      }
      let available = isUndefined(argAfterEqualSign) ? 0 : 1;
      if (configuration['nargs-eats-options']) {
        if (args.length - (i + 1) + available < toEat) error = Error(__('Not enough arguments following: %s', key));
        available = toEat;
      } else {
        for (ii = i + 1; ii < args.length; ii++) {
          const a = args[ii] as string;
          if (!/^-[^0-9]/.exec(a) || negative.exec(a) || isUnknownOptionAsArg(a)) available++;
          else break;
        }
        if (available < toEat) error = Error(__('Not enough arguments following: %s', key));
      }
      let consumed = Math.min(available, toEat);
      if (!isUndefined(argAfterEqualSign) && consumed > 0) {
        setArg(key, argAfterEqualSign);
        consumed--;
      }
      for (ii = i + 1; ii < consumed + i + 1; ii++) setArg(key, args[ii]);
      return i + consumed;
    }

    function eatArray(i: number, key: string, args: string[], argAfterEqualSign?: string): number {
      let argsToSet: any[] = [];
      let next: any = argAfterEqualSign || args[i + 1];
      const nargsCount = checkAllAliases(key, flags.nargs);
      if (checkAllAliases(key, flags.bools) && !/^(true|false)$/.test(next)) {
        argsToSet.push(true);
      } else if (
        isUndefined(next) ||
        (isUndefined(argAfterEqualSign) && /^-/.test(next) && !negative.test(next) && !isUnknownOptionAsArg(next))
      ) {
        if (defaults[key] !== undefined) {
          const defVal = defaults[key];
          argsToSet = Array.isArray(defVal) ? defVal : [defVal];
        }
      } else {
        if (!isUndefined(argAfterEqualSign)) argsToSet.push(processValue(key, argAfterEqualSign, true));
        for (let ii = i + 1; ii < args.length; ii++) {
          if ((!configuration['greedy-arrays'] && argsToSet.length > 0) || (nargsCount && typeof nargsCount === 'number' && argsToSet.length >= nargsCount)) break;
          next = args[ii];
          if (/^-/.test(next) && !negative.test(next) && !isUnknownOptionAsArg(next)) break;
          i = ii;
          argsToSet.push(processValue(key, next, inputIsString));
        }
      }
      if (typeof nargsCount === 'number' && ((nargsCount && argsToSet.length < nargsCount) || (isNaN(nargsCount) && argsToSet.length === 0))) {
        error = Error(__('Not enough arguments following: %s', key));
      }
      setArg(key, argsToSet);
      return i;
    }

    function setArg(key: string, val: any, shouldStripQuotes: boolean = inputIsString): void {
      if (/-/.test(key) && configuration['camel-case-expansion']) {
        const alias = key.split('.').map((prop) => camelCase(prop)).join('.');
        addNewAlias(key, alias);
      }
      const value = processValue(key, val, shouldStripQuotes);
      const splitKey = key.split('.');
      setKey(argv, splitKey, value);
      if (flags.aliases[key]) {
        flags.aliases[key].forEach((x: string) => {
          const keyProperties = x.split('.');
          setKey(argv, keyProperties, value);
        });
      }
      if (splitKey.length > 1 && configuration['dot-notation']) {
        (flags.aliases[splitKey[0] as string] || []).forEach((x: string) => {
          let keyProperties = x.split('.');
          const a = ([] as string[]).concat(splitKey);
          a.shift();
          keyProperties = keyProperties.concat(a);
          if (!(flags.aliases[key] || []).includes(keyProperties.join('.'))) setKey(argv, keyProperties, value);
        });
      }
      if (checkAllAliases(key, flags.normalize) && !checkAllAliases(key, flags.arrays)) {
        const keys = [key].concat(flags.aliases[key] || []);
        keys.forEach((k) => {
          Object.defineProperty(argvReturn, k, {
            enumerable: true,
            get() {
              return val;
            },
            set(v) {
              val = typeof v === 'string' ? mixin.normalize(v) : v;
            },
          });
        });
      }
    }

    function addNewAlias(key: string, alias: string): void {
      if (!(flags.aliases[key] && flags.aliases[key].length)) {
        flags.aliases[key] = [alias];
        newAliases[alias] = true;
      }
      if (!(flags.aliases[alias] && flags.aliases[alias].length)) addNewAlias(alias, key);
    }

    function processValue(key: string, val: any, shouldStripQuotes: boolean): any {
      if (shouldStripQuotes) val = stripQuotes(val);
      if (checkAllAliases(key, flags.bools) || checkAllAliases(key, flags.counts)) {
        if (typeof val === 'string') val = val === 'true';
      }
      let value = Array.isArray(val) ? val.map((v) => maybeCoerceNumber(key, v)) : maybeCoerceNumber(key, val);
      if (checkAllAliases(key, flags.counts) && (isUndefined(value) || typeof value === 'boolean')) value = increment();
      if (checkAllAliases(key, flags.normalize) && checkAllAliases(key, flags.arrays)) {
        if (Array.isArray(val)) value = val.map((v) => mixin.normalize(v));
        else value = mixin.normalize(val);
      }
      return value;
    }

    function maybeCoerceNumber(key: string, value: any): any {
      if (!configuration['parse-positional-numbers'] && key === '_') return value;
      if (!checkAllAliases(key, flags.strings) && !checkAllAliases(key, flags.bools) && !Array.isArray(value)) {
        const shouldCoerceNumber =
          looksLikeNumber(value) && configuration['parse-numbers'] && Number.isSafeInteger(Math.floor(parseFloat(`${value}`)));
        if (shouldCoerceNumber || (!isUndefined(value) && checkAllAliases(key, flags.numbers))) value = Number(value);
      }
      return value;
    }

    function setConfig(argv: any): void {
      const configLookup: any = Object.create(null);
      applyDefaultsAndAliases(configLookup, flags.aliases, defaults);
      Object.keys(flags.configs).forEach((configKey) => {
        const configPath = argv[configKey] || configLookup[configKey];
        if (configPath) {
          try {
            let config: any = null;
            const resolvedConfigPath = mixin.resolve(mixin.cwd(), configPath);
            const resolveConfig = flags.configs[configKey];
            if (typeof resolveConfig === 'function') {
              try {
                config = resolveConfig(resolvedConfigPath);
              } catch (e) {
                config = e;
              }
              if (config instanceof Error) {
                error = config;
                return;
              }
            } else config = mixin.require(resolvedConfigPath);
            setConfigObject(config);
          } catch (ex: any) {
            if (ex.name === 'PermissionDenied') error = ex;
            else if (argv[configKey]) error = Error(__('Invalid JSON config file: %s', configPath));
          }
        }
      });
    }

    function setConfigObject(config: any, prev?: string): void {
      Object.keys(config).forEach((key) => {
        const value = config[key];
        const fullKey = prev ? `${prev}.${key}` : key;
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && configuration['dot-notation']) {
          setConfigObject(value, fullKey);
        } else if (!hasKey(argv, fullKey.split('.')) || (checkAllAliases(fullKey, flags.arrays) && configuration['combine-arrays'])) {
          setArg(fullKey, value);
        }
      });
    }

    function setConfigObjects(): void {
      if (typeof configObjects !== 'undefined') configObjects.forEach((configObject) => setConfigObject(configObject));
    }

    function applyEnvVars(argv: any, configOnly: boolean): void {
      if (typeof envPrefix === 'undefined') return;
      const prefix = typeof envPrefix === 'string' ? envPrefix : '';
      const env = mixin.env();
      Object.keys(env).forEach((envVar) => {
        if (prefix === '' || envVar.lastIndexOf(prefix, 0) === 0) {
          const keys = envVar.split('__').map((key, i) => {
            if (i === 0) key = key.substring(prefix.length);
            return camelCase(key);
          });
          if (((configOnly && flags.configs[keys.join('.')]) || !configOnly) && !hasKey(argv, keys)) setArg(keys.join('.'), env[envVar]);
        }
      });
    }

    function applyCoercions(argv: any): void {
      let coerce: any;
      const applied = new Set<string>();
      Object.keys(argv).forEach((key) => {
        if (!applied.has(key)) {
          coerce = checkAllAliases(key, flags.coercions);
          if (typeof coerce === 'function') {
            try {
              const value = maybeCoerceNumber(key, coerce(argv[key]));
              ([] as string[]).concat(flags.aliases[key] || [], key).forEach((ali) => {
                applied.add(ali);
                argv[ali] = value;
              });
            } catch (err: any) {
              error = err;
            }
          }
        }
      });
    }

    function setPlaceholderKeys(argv: any): any {
      flags.keys.forEach((key: string) => {
        if (~key.indexOf('.')) return;
        if (typeof argv[key] === 'undefined') argv[key] = undefined;
      });
      return argv;
    }

    function applyDefaultsAndAliases(obj: any, aliases: any, defaults: any, canLog = false): void {
      Object.keys(defaults).forEach((key) => {
        if (!hasKey(obj, key.split('.'))) {
          setKey(obj, key.split('.'), defaults[key]);
          if (canLog) defaulted[key] = true;
          (aliases[key] || []).forEach((x: string) => {
            if (hasKey(obj, x.split('.'))) return;
            setKey(obj, x.split('.'), defaults[key]);
          });
        }
      });
    }

    function hasKey(obj: any, keys: string[]): boolean {
      let o = obj;
      if (!configuration['dot-notation']) keys = [keys.join('.')];
      keys.slice(0, -1).forEach((key) => {
        o = o[key] || {};
      });
      const key = keys.at(-1) as string;
      if (typeof o !== 'object') return false;
      return key in o;
    }

    function setKey(obj: any, keys: string[], value: any): void {
      let o = obj;
      if (!configuration['dot-notation']) keys = [keys.join('.')];
      keys.slice(0, -1).forEach((key) => {
        key = sanitizeKey(key);
        if (typeof o === 'object' && o[key] === undefined) o[key] = {};
        if (typeof o[key] !== 'object' || Array.isArray(o[key])) {
          if (Array.isArray(o[key])) o[key].push({});
          else o[key] = [o[key], {}];
          o = o[key][o[key].length - 1];
        } else o = o[key];
      });
      const key = sanitizeKey(keys.at(-1) as string);
      const isTypeArray = checkAllAliases(keys.join('.'), flags.arrays);
      const isValueArray = Array.isArray(value);
      let duplicate = configuration['duplicate-arguments-array'];
      if (!duplicate && checkAllAliases(key, flags.nargs)) {
        duplicate = true;
        if ((!isUndefined(o[key]) && flags.nargs[key] === 1) || (Array.isArray(o[key]) && o[key].length === flags.nargs[key])) o[key] = undefined;
      }
      if (value === increment()) o[key] = increment(o[key]);
      else if (Array.isArray(o[key])) {
        if (duplicate && isTypeArray && isValueArray) {
          o[key] = configuration['flatten-duplicate-arrays']
            ? o[key].concat(value)
            : (Array.isArray(o[key][0]) ? o[key] : [o[key]]).concat([value]);
        } else if (!duplicate && Boolean(isTypeArray) === Boolean(isValueArray)) o[key] = value;
        else o[key] = o[key].concat([value]);
      } else if (o[key] === undefined && isTypeArray) o[key] = isValueArray ? value : [value];
      else if (duplicate && !(o[key] === undefined || checkAllAliases(key, flags.counts) || checkAllAliases(key, flags.bools))) o[key] = [o[key], value];
      else o[key] = value;
    }

    function extendAliases(...objs: any[]): void {
      objs.forEach((obj) => {
        Object.keys(obj || {}).forEach((key) => {
          if (flags.aliases[key]) return;
          flags.aliases[key] = ([] as string[]).concat(aliases[key] || []);
          flags.aliases[key].concat(key).forEach((x: string) => {
            if (/-/.test(x) && configuration['camel-case-expansion']) {
              const c = camelCase(x);
              if (c !== key && flags.aliases[key].indexOf(c) === -1) {
                flags.aliases[key].push(c);
                newAliases[c] = true;
              }
            }
          });
          flags.aliases[key].concat(key).forEach((x: string) => {
            if (x.length > 1 && /[A-Z]/.test(x) && configuration['camel-case-expansion']) {
              const c = decamelize(x, '-');
              if (c !== key && flags.aliases[key].indexOf(c) === -1) {
                flags.aliases[key].push(c);
                newAliases[c] = true;
              }
            }
          });
          flags.aliases[key].forEach((x: string) => {
            flags.aliases[x] = [key].concat(flags.aliases[key].filter((y: string) => x !== y));
          });
        });
      });
    }

    function checkAllAliases(key: string, flag: any): any {
      const toCheck = ([] as string[]).concat(flags.aliases[key] || [], key);
      const keys = Object.keys(flag);
      const setAlias = toCheck.find((k) => keys.includes(k));
      return setAlias ? flag[setAlias] : false;
    }

    function hasAnyFlag(key: string): boolean {
      const flagsKeys = Object.keys(flags);
      const toCheck = ([] as any[]).concat(flagsKeys.map((k) => flags[k]));
      return toCheck.some((flag) => (Array.isArray(flag) ? flag.includes(key) : flag[key]));
    }

    function hasFlagsMatching(arg: string, ...patterns: RegExp[][]): boolean {
      const toCheck = ([] as RegExp[]).concat(...patterns);
      return toCheck.some((pattern) => {
        const match = pattern.exec(arg);
        return match && hasAnyFlag(match[1] as string);
      });
    }

    function hasAllShortFlags(arg: string): boolean {
      if (negative.exec(arg) || !/^-[^-]+/.exec(arg)) return false;
      let hasAllFlags = true;
      let next: string;
      const letters = arg.slice(1).split('');
      for (let j = 0; j < letters.length; j++) {
        next = arg.slice(j + 2);
        if (!hasAnyFlag(letters[j] as string)) {
          hasAllFlags = false;
          break;
        }
        if (
          (letters[j + 1] && letters[j + 1] === '=') ||
          next === '-' ||
          (/[A-Za-z]/.test(letters[j] as string) && /^-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) ||
          (letters[j + 1] && /\W/.exec(letters[j + 1] as string))
        ) {
          break;
        }
      }
      return hasAllFlags;
    }

    function isUnknownOptionAsArg(arg: string): boolean {
      return configuration['unknown-options-as-args'] && isUnknownOption(arg);
    }

    function isUnknownOption(arg: string): boolean {
      arg = arg.replace(/^-{3,}/, '--');
      if (negative.exec(arg)) return false;
      if (hasAllShortFlags(arg)) return false;
      const flagWithEquals = /^-+([^=]+?)=[\s\S]*$/;
      const normalFlag = /^-+([^=]+?)$/;
      const flagEndingInHyphen = /^-+([^=]+?)-$/;
      const flagEndingInDigits = /^-+([^=]+?\d+)$/;
      const flagEndingInNonWordCharacters = /^-+([^=]+?)\W+.*$/;
      return !hasFlagsMatching(arg, [flagWithEquals, negatedBoolean, normalFlag, flagEndingInHyphen, flagEndingInDigits, flagEndingInNonWordCharacters]);
    }

    function defaultValue(key: string): any {
      if (!checkAllAliases(key, flags.bools) && !checkAllAliases(key, flags.counts) && `${key}` in defaults) return defaults[key];
      return defaultForType(guessType(key));
    }

    function defaultForType(type: string): any {
      const def: any = {
        [DefaultValuesForTypeKey.BOOLEAN]: true,
        [DefaultValuesForTypeKey.STRING]: '',
        [DefaultValuesForTypeKey.NUMBER]: undefined,
        [DefaultValuesForTypeKey.ARRAY]: [],
      };
      return def[type];
    }

    function guessType(key: string): string {
      let type: string = DefaultValuesForTypeKey.BOOLEAN;
      if (checkAllAliases(key, flags.strings)) type = DefaultValuesForTypeKey.STRING;
      else if (checkAllAliases(key, flags.numbers)) type = DefaultValuesForTypeKey.NUMBER;
      else if (checkAllAliases(key, flags.bools)) type = DefaultValuesForTypeKey.BOOLEAN;
      else if (checkAllAliases(key, flags.arrays)) type = DefaultValuesForTypeKey.ARRAY;
      return type;
    }

    function isUndefined(num: any): num is undefined {
      return num === undefined;
    }

    function checkConfiguration(): void {
      Object.keys(flags.counts).find((key) => {
        if (checkAllAliases(key, flags.arrays)) {
          error = Error(__('Invalid configuration: %s, opts.count excludes opts.array.', key));
          return true;
        } else if (checkAllAliases(key, flags.nargs)) {
          error = Error(__('Invalid configuration: %s, opts.count excludes opts.narg.', key));
          return true;
        }
        return false;
      });
    }

    return {
      aliases: Object.assign({}, flags.aliases),
      argv: Object.assign(argvReturn, argv),
      configuration,
      defaulted: Object.assign({}, defaulted),
      error,
      newAliases: Object.assign({}, newAliases),
    };
  }
}

function combineAliases(aliases: Record<string, any>): Record<string, string[]> {
  const aliasArrays: string[][] = [];
  const combined: Record<string, string[]> = Object.create(null);
  let change = true;
  Object.keys(aliases).forEach((key) => {
    aliasArrays.push(([] as string[]).concat(aliases[key], key));
  });
  while (change) {
    change = false;
    for (let i = 0; i < aliasArrays.length; i++) {
      for (let ii = i + 1; ii < aliasArrays.length; ii++) {
        const intersect = (aliasArrays[i] as string[]).filter((v) => (aliasArrays[ii] as string[]).indexOf(v) !== -1);
        if (intersect.length) {
          aliasArrays[i] = (aliasArrays[i] as string[]).concat(aliasArrays[ii] as string[]);
          aliasArrays.splice(ii, 1);
          change = true;
          break;
        }
      }
    }
  }
  aliasArrays.forEach((aliasArray) => {
    aliasArray = aliasArray.filter((v, i, self) => self.indexOf(v) === i);
    const lastAlias = aliasArray.pop();
    if (lastAlias !== undefined && typeof lastAlias === 'string') combined[lastAlias] = aliasArray;
  });
  return combined;
}

function increment(orig?: number): number {
  return orig !== undefined ? orig + 1 : 1;
}

function sanitizeKey(key: string): string {
  if (key === '__proto__') return '___proto___';
  return key;
}

function stripQuotes(val: any): any {
  return typeof val === 'string' && (val[0] === "'" || val[0] === '"') && val.at(-1) === val[0] ? val.substring(1, val.length - 1) : val;
}

const env = process.env;
const nodeRequire = createRequire(import.meta.url);
const parser = new YargsParser({
  cwd: process.cwd,
  env: () => env,
  format,
  normalize,
  resolve,
  require: (path: string) => {
    if (typeof nodeRequire !== 'undefined') return nodeRequire(path);
    if (/\.json$/.exec(path)) return JSON.parse(readFileSync(path, 'utf8'));
    throw Error('only .json config files are supported in ESM');
  },
});

export interface Parser {
  (args: string | any[], opts?: any): Record<string, any>;
  detailed: (args: string | any[], opts?: any) => DetailedArguments;
  camelCase: typeof camelCase;
  decamelize: typeof decamelize;
  looksLikeNumber: typeof looksLikeNumber;
}

const yargsParser = function Parser(args: string | any[], opts?: any): Record<string, any> {
  return parser.parse(args.slice(), opts).argv;
} as Parser;
yargsParser.detailed = (args, opts) => parser.parse(args.slice(), opts);
yargsParser.camelCase = camelCase;
yargsParser.decamelize = decamelize;
yargsParser.looksLikeNumber = looksLikeNumber;

export { yargsParser as Parser };
/** `burgee/yargs/parser`: what `import parser from 'yargs-parser'` gives, the same object the front-end parses with. */
export default yargsParser;
