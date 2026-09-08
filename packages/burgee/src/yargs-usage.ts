/**
 * yargs' usage — the help screen, `fail`, examples, epilogues, descriptions and the
 * version string — ported for `burgee/yargs`. Help is rendered through the cliui port,
 * so yargs' usage tests compare whole screens byte for byte.
 */
 
import type { PlatformShim } from './yargs-shim.js';
import { objFilter, setBlocking, YError } from './yargs-utils.js';

export type FailureFunction = (msg: string | undefined | null, err: Error | undefined, usage: UsageInstance) => void;

interface IndentedText {
  text: string;
  indentation: number;
}

export interface UsageInstance {
  failFn: (f: FailureFunction | boolean) => void;
  showHelpOnFail: (arg1?: boolean | string, arg2?: string) => UsageInstance;
  fail: (msg?: string | null, err?: Error) => void;
  usage: (msg: string | null, description?: string | false) => UsageInstance;
  getUsage: () => [string, string][];
  getUsageDisabled: () => boolean;
  getPositionalGroupName: () => string;
  example: (cmd: string, description?: string) => void;
  command: (cmd: string, description: string | false, isDefault: boolean, aliases: string[], deprecated?: boolean | string) => void;
  getCommands: () => [string, string, boolean, string[], boolean | string][];
  describe: (keyOrKeys: string | string[] | Record<string, string>, desc?: string) => void;
  getDescriptions: () => Record<string, string | undefined>;
  epilog: (msg: string) => void;
  wrap: (cols: number | null | undefined) => void;
  getWrap: () => number | null | undefined;
  deferY18nLookup: (str: string) => string;
  help: () => string;
  cacheHelpMessage: () => void;
  clearCachedHelpMessage: () => void;
  hasCachedHelpMessage: () => boolean;
  showHelp: (level?: 'error' | 'log' | ((message: string) => void)) => void;
  functionDescription: (fn: { name?: string }) => string;
  stringifiedValues: (values?: any[], separator?: string) => string;
  version: (ver: any) => void;
  showVersion: (level?: 'error' | 'log' | ((message: string) => void)) => void;
  reset: (localLookup: Record<string, boolean>) => UsageInstance;
  freeze: () => void;
  unfreeze: (defaultCommand?: boolean) => void;
}

function isBoolean(fail: FailureFunction | boolean): fail is boolean {
  return typeof fail === 'boolean';
}

export function usage(yargs: any, shim: PlatformShim): UsageInstance {
  const __ = shim.y18n.__;
  const self = {} as UsageInstance;

  const fails: (FailureFunction | boolean)[] = [];
  self.failFn = function failFn(f) {
    fails.push(f);
  };

  let failMessage: string | undefined | null = null;
  let globalFailMessage: string | undefined | null = null;
  let showHelpOnFail = true;
  self.showHelpOnFail = function showHelpOnFailFn(arg1 = true, arg2) {
    const [enabled, message] = typeof arg1 === 'string' ? [true, arg1] : [arg1, arg2];
    if (yargs.getInternalMethods().isGlobalContext()) globalFailMessage = message;
    failMessage = message;
    showHelpOnFail = enabled;
    return self;
  };

  let failureOutput = false;
  self.fail = function fail(msg, err) {
    const logger = yargs.getInternalMethods().getLoggerInstance();
    if (fails.length) {
      for (let i = fails.length - 1; i >= 0; --i) {
        const f = fails[i] as FailureFunction | boolean;
        if (isBoolean(f)) {
          if (err) throw err;
          else if (msg) throw Error(msg);
        } else f(msg, err, self);
      }
    } else {
      if (yargs.getExitProcess()) setBlocking(true);
      if (!failureOutput) {
        failureOutput = true;
        if (showHelpOnFail) {
          yargs.showHelp('error');
          logger.error();
        }
        if (msg || err) logger.error(msg || err);
        const globalOrCommandFailMessage = failMessage || globalFailMessage;
        if (globalOrCommandFailMessage) {
          if (msg || err) logger.error('');
          logger.error(globalOrCommandFailMessage);
        }
      }
      err = err || new YError(msg);
      if (yargs.getExitProcess()) return yargs.exit(1);
      else if (yargs.getInternalMethods().hasParseCallback()) return yargs.exit(1, err);
      else throw err;
    }
  };

  let usages: [string, string][] = [];
  let usageDisabled = false;
  self.usage = (msg, description) => {
    if (msg === null) {
      usageDisabled = true;
      usages = [];
      return self;
    }
    usageDisabled = false;
    usages.push([msg, description || '']);
    return self;
  };
  self.getUsage = () => usages;
  self.getUsageDisabled = () => usageDisabled;
  self.getPositionalGroupName = () => __('Positionals:');

  let examples: [string, string][] = [];
  self.example = (cmd, description) => {
    examples.push([cmd, description || '']);
  };

  let commands: [string, string, boolean, string[], boolean | string][] = [];
  self.command = function command(cmd, description, isDefault, aliases, deprecated = false) {
    if (isDefault) {
      commands = commands.map((cmdArray) => {
        cmdArray[2] = false;
        return cmdArray;
      });
    }
    commands.push([cmd, description || '', isDefault, aliases, deprecated]);
  };
  self.getCommands = () => commands;

  let descriptions: Record<string, string | undefined> = {};
  self.describe = function describe(keyOrKeys, desc) {
    if (Array.isArray(keyOrKeys)) {
      keyOrKeys.forEach((k) => {
        self.describe(k, desc);
      });
    } else if (typeof keyOrKeys === 'object') {
      Object.keys(keyOrKeys).forEach((k) => {
        self.describe(k, keyOrKeys[k]);
      });
    } else descriptions[keyOrKeys] = desc;
  };
  self.getDescriptions = () => descriptions;

  let epilogs: string[] = [];
  self.epilog = (msg) => {
    epilogs.push(msg);
  };

  let wrapSet = false;
  let wrap: number | null | undefined;
  self.wrap = (cols) => {
    wrapSet = true;
    wrap = cols;
  };
  self.getWrap = () => {
    if (shim.getEnv('YARGS_DISABLE_WRAP')) return null;
    if (!wrapSet) {
      wrap = windowWidth();
      wrapSet = true;
    }
    return wrap;
  };

  const deferY18nLookupPrefix = '__yargsString__:';
  self.deferY18nLookup = (str) => deferY18nLookupPrefix + str;

  self.help = function help() {
    if (cachedHelpMessage) return cachedHelpMessage;
    normalizeAliases();
    const base$0 = yargs.customScriptName ? yargs.$0 : shim.path.basename(yargs.$0);
    const demandedOptions = yargs.getDemandedOptions();
    const demandedCommands = yargs.getDemandedCommands();
    const deprecatedOptions = yargs.getDeprecatedOptions();
    const groups = yargs.getGroups();
    const options = yargs.getOptions();
    let keys: string[] = [];
    keys = keys.concat(Object.keys(descriptions));
    keys = keys.concat(Object.keys(demandedOptions));
    keys = keys.concat(Object.keys(demandedCommands));
    keys = keys.concat(Object.keys(options.default));
    keys = keys.filter(filterHiddenOptions);
    keys = Object.keys(
      keys.reduce((acc: Record<string, boolean>, key) => {
        if (key !== '_') acc[key] = true;
        return acc;
      }, {}),
    );
    const theWrap = self.getWrap();
    const ui = shim.cliui({ width: theWrap, wrap: !!theWrap });
    if (!usageDisabled) {
      if (usages.length) {
        usages.forEach((u) => {
          ui.div({ text: `${u[0].replace(/\$0/g, base$0)}`, padding: [0, 0, 0, 0] });
          if (u[1]) ui.div({ text: `${u[1]}`, padding: [1, 0, 0, 0] });
        });
        ui.div();
      } else if (commands.length) {
        let u: string;
        if (demandedCommands._) u = `${base$0} <${__('command')}>\n`;
        else u = `${base$0} [${__('command')}]\n`;
        ui.div(`${u}`);
      }
    }
    if (commands.length > 1 || (commands.length === 1 && !(commands[0] as any[])[2])) {
      ui.div(__('Commands:'));
      const context = yargs.getInternalMethods().getContext();
      const parentCommands = context.commands.length ? `${context.commands.join(' ')} ` : '';
      if (yargs.getInternalMethods().getParserConfiguration()['sort-commands'] === true) {
        commands = commands.sort((a, b) => a[0].localeCompare(b[0]));
      }
      const prefix = base$0 ? `${base$0} ` : '';
      commands.forEach((command) => {
        const commandString = `${prefix}${parentCommands}${command[0].replace(/^\$0 ?/, '')}`;
        ui.span(
          { text: commandString, padding: [0, 2, 0, 2], width: maxWidth(commands, theWrap, `${base$0}${parentCommands}`) + 4 },
          { text: command[1], padding: [0, 0, 0, 0] },
        );
        const hints: string[] = [];
        if (command[2]) hints.push(`[${__('default')}]`);
        if (command[3] && command[3].length) hints.push(`[${__('aliases:')} ${command[3].join(', ')}]`);
        if (command[4]) {
          if (typeof command[4] === 'string') hints.push(`[${__('deprecated: %s', command[4])}]`);
          else hints.push(`[${__('deprecated')}]`);
        }
        if (hints.length) ui.div({ text: hints.join(' '), padding: [0, 0, 0, 2], align: 'right' });
        else ui.div();
      });
      ui.div();
    }
    const aliasKeys: string[] = (Object.keys(options.alias) || []).concat(Object.keys(yargs.parsed.newAliases) || []);
    keys = keys.filter((key) => !yargs.parsed.newAliases[key] && aliasKeys.every((alias) => (options.alias[alias] || []).indexOf(key) === -1));
    const defaultGroup = __('Options:');
    if (!groups[defaultGroup]) groups[defaultGroup] = [];
    addUngroupedKeys(keys, options.alias, groups, defaultGroup);
    const isLongSwitch = (sw: string | IndentedText): boolean => /^--/.test(getText(sw));
    const displayedGroups = Object.keys(groups)
      .filter((groupName) => groups[groupName].length > 0)
      .map((groupName) => {
        const normalizedKeys: string[] = groups[groupName].filter(filterHiddenOptions).map((key: string) => {
          if (aliasKeys.includes(key)) return key;
          for (let i = 0, aliasKey; (aliasKey = aliasKeys[i]) !== undefined; i++) {
            if ((options.alias[aliasKey] || []).includes(key)) return aliasKey;
          }
          return key;
        });
        return { groupName, normalizedKeys };
      })
      .filter(({ normalizedKeys }) => normalizedKeys.length > 0)
      .map(({ groupName, normalizedKeys }) => {
        const switches = normalizedKeys.reduce((acc: Record<string, string | IndentedText>, key) => {
          acc[key] = [key]
            .concat(options.alias[key] || [])
            .map((sw: string) => {
              if (groupName === self.getPositionalGroupName()) return sw;
              return (/^[0-9]$/.test(sw) ? (options.boolean.includes(key) ? '-' : '--') : sw.length > 1 ? '--' : '-') + sw;
            })
            .sort((sw1: string, sw2: string) => (isLongSwitch(sw1) === isLongSwitch(sw2) ? 0 : isLongSwitch(sw1) ? 1 : -1))
            .join(', ');
          return acc;
        }, {});
        return { groupName, normalizedKeys, switches };
      });
    const shortSwitchesUsed = displayedGroups
      .filter(({ groupName }) => groupName !== self.getPositionalGroupName())
      .some(({ normalizedKeys, switches }) => !normalizedKeys.every((key) => isLongSwitch(switches[key] as string)));
    if (shortSwitchesUsed) {
      displayedGroups
        .filter(({ groupName }) => groupName !== self.getPositionalGroupName())
        .forEach(({ normalizedKeys, switches }) => {
          normalizedKeys.forEach((key) => {
            if (isLongSwitch(switches[key] as string)) switches[key] = addIndentation(switches[key] as string, '-x, '.length);
          });
        });
    }
    displayedGroups.forEach(({ groupName, normalizedKeys, switches }) => {
      ui.div(groupName);
      normalizedKeys.forEach((key) => {
        const kswitch = switches[key] as string | IndentedText;
        let desc: string = descriptions[key] || '';
        let type: string | null = null;
        if (desc.includes(deferY18nLookupPrefix)) desc = __(desc.substring(deferY18nLookupPrefix.length));
        if (options.boolean.includes(key)) type = `[${__('boolean')}]`;
        if (options.count.includes(key)) type = `[${__('count')}]`;
        if (options.string.includes(key)) type = `[${__('string')}]`;
        if (options.normalize.includes(key)) type = `[${__('string')}]`;
        if (options.array.includes(key)) type = `[${__('array')}]`;
        if (options.number.includes(key)) type = `[${__('number')}]`;
        const deprecatedExtra = (deprecated: string | boolean): string =>
          typeof deprecated === 'string' ? `[${__('deprecated: %s', deprecated)}]` : `[${__('deprecated')}]`;
        const extra = [
          key in deprecatedOptions ? deprecatedExtra(deprecatedOptions[key]) : null,
          type,
          key in demandedOptions ? `[${__('required')}]` : null,
          options.choices && options.choices[key] ? `[${__('choices:')} ${self.stringifiedValues(options.choices[key])}]` : null,
          defaultString(options.default[key], options.defaultDescription[key]),
        ]
          .filter(Boolean)
          .join(' ');
        ui.span({ text: getText(kswitch), padding: [0, 2, 0, 2 + getIndentation(kswitch)], width: maxWidth(switches, theWrap) + 4 }, desc);
        const shouldHideOptionExtras = yargs.getInternalMethods().getUsageConfiguration()['hide-types'] === true;
        if (extra && !shouldHideOptionExtras) ui.div({ text: extra, padding: [0, 0, 0, 2], align: 'right' });
        else ui.div();
      });
      ui.div();
    });
    if (examples.length) {
      ui.div(__('Examples:'));
      examples.forEach((example) => {
        example[0] = example[0].replace(/\$0/g, base$0);
      });
      examples.forEach((example) => {
        if (example[1] === '') ui.div({ text: example[0], padding: [0, 2, 0, 2] });
        else ui.div({ text: example[0], padding: [0, 2, 0, 2], width: maxWidth(examples, theWrap) + 4 }, { text: example[1], padding: [0, 0, 0, 0] });
      });
      ui.div();
    }
    if (epilogs.length > 0) {
      const e = epilogs.map((epilog) => epilog.replace(/\$0/g, base$0)).join('\n');
      ui.div(`${e}\n`);
    }
    return ui.toString().replace(/\s*$/, '');
  };

  function maxWidth(table: any[][] | Record<string, string | IndentedText>, theWrap: number | null | undefined, modifier?: string): number {
    let width = 0;
    let rows: any[][];
    if (!Array.isArray(table)) rows = Object.values(table).map((v) => [v]);
    else rows = table;
    rows.forEach((v) => {
      width = Math.max(shim.stringWidth(modifier ? `${modifier} ${getText(v[0])}` : getText(v[0])) + getIndentation(v[0]), width);
    });
    if (theWrap) width = Math.min(width, parseInt((theWrap * 0.5).toString(), 10));
    return width;
  }

  function normalizeAliases(): void {
    const demandedOptions = yargs.getDemandedOptions();
    const options = yargs.getOptions();
    (Object.keys(options.alias) || []).forEach((key) => {
      options.alias[key].forEach((alias: string) => {
        if (descriptions[alias]) self.describe(key, descriptions[alias]);
        if (alias in demandedOptions) yargs.demandOption(key, demandedOptions[alias]);
        if (options.boolean.includes(alias)) yargs.boolean(key);
        if (options.count.includes(alias)) yargs.count(key);
        if (options.string.includes(alias)) yargs.string(key);
        if (options.normalize.includes(alias)) yargs.normalize(key);
        if (options.array.includes(alias)) yargs.array(key);
        if (options.number.includes(alias)) yargs.number(key);
      });
    });
  }

  let cachedHelpMessage: string | undefined;
  self.cacheHelpMessage = function () {
    cachedHelpMessage = this.help();
  };
  self.clearCachedHelpMessage = function () {
    cachedHelpMessage = undefined;
  };
  self.hasCachedHelpMessage = function () {
    return !!cachedHelpMessage;
  };

  function addUngroupedKeys(keys: string[], aliases: Record<string, string[]>, groups: Record<string, string[]>, defaultGroup: string): string[] {
    let groupedKeys: string[] = [];
    let toCheck: string[] | null = null;
    Object.keys(groups).forEach((group) => {
      groupedKeys = groupedKeys.concat(groups[group] as string[]);
    });
    keys.forEach((key) => {
      toCheck = [key].concat(aliases[key] as string[]);
      if (!toCheck.some((k) => groupedKeys.indexOf(k) !== -1)) (groups[defaultGroup] as string[]).push(key);
    });
    return groupedKeys;
  }

  function filterHiddenOptions(key: string): boolean {
    return yargs.getOptions().hiddenOptions.indexOf(key) < 0 || yargs.parsed.argv[yargs.getOptions().showHiddenOpt];
  }

  self.showHelp = (level) => {
    const logger = yargs.getInternalMethods().getLoggerInstance();
    if (!level) level = 'error';
    const emit = typeof level === 'function' ? level : logger[level];
    emit(self.help());
  };

  self.functionDescription = (fn) => {
    const description = fn.name ? shim.Parser.decamelize(fn.name, '-') : __('generated-value');
    return ['(', description, ')'].join('');
  };

  self.stringifiedValues = function stringifiedValues(values, separator) {
    let string = '';
    const sep = separator || ', ';
    const array = ([] as any[]).concat(values);
    if (!values || !array.length) return string;
    array.forEach((value) => {
      if (string.length) string += sep;
      string += JSON.stringify(value);
    });
    return string;
  };

  function defaultString(value: any, defaultDescription?: string): string | null {
    let string = `[${__('default:')} `;
    if (value === undefined && !defaultDescription) return null;
    if (defaultDescription) string += defaultDescription;
    else {
      switch (typeof value) {
        case 'string':
          string += `"${value}"`;
          break;
        case 'object':
          string += JSON.stringify(value);
          break;
        default:
          string += value;
      }
    }
    return `${string}]`;
  }

  function windowWidth(): number {
    const max = 80;
    if (shim.process.stdColumns) return Math.min(max, shim.process.stdColumns);
    return max;
  }

  let version: any = null;
  self.version = (ver) => {
    version = ver;
  };

  self.showVersion = (level) => {
    const logger = yargs.getInternalMethods().getLoggerInstance();
    if (!level) level = 'error';
    const emit = typeof level === 'function' ? level : logger[level];
    emit(version);
  };

  self.reset = function reset(localLookup) {
    failMessage = null;
    failureOutput = false;
    usages = [];
    usageDisabled = false;
    epilogs = [];
    examples = [];
    commands = [];
    descriptions = objFilter(descriptions, (k) => !localLookup[k]);
    return self;
  };

  interface Frozen {
    failMessage: string | undefined | null;
    failureOutput: boolean;
    usages: [string, string][];
    usageDisabled: boolean;
    epilogs: string[];
    examples: [string, string][];
    commands: [string, string, boolean, string[], boolean | string][];
    descriptions: Record<string, string | undefined>;
  }
  const frozens: Frozen[] = [];
  self.freeze = function freeze() {
    frozens.push({ failMessage, failureOutput, usages, usageDisabled, epilogs, examples, commands, descriptions });
  };
  self.unfreeze = function unfreeze(defaultCommand = false) {
    const frozen = frozens.pop();
    if (!frozen) return;
    if (defaultCommand) {
      descriptions = { ...frozen.descriptions, ...descriptions };
      commands = [...frozen.commands, ...commands];
      usages = [...frozen.usages, ...usages];
      examples = [...frozen.examples, ...examples];
      epilogs = [...frozen.epilogs, ...epilogs];
    } else ({ failMessage, failureOutput, usages, usageDisabled, epilogs, examples, commands, descriptions } = frozen);
  };

  return self;
}

function isIndentedText(text: string | IndentedText): text is IndentedText {
  return typeof text === 'object';
}

function addIndentation(text: string | IndentedText, indent: number): IndentedText {
  return isIndentedText(text) ? { text: text.text, indentation: text.indentation + indent } : { text, indentation: indent };
}

function getIndentation(text: string | IndentedText): number {
  return isIndentedText(text) ? text.indentation : 0;
}

function getText(text: string | IndentedText): string {
  return isIndentedText(text) ? text.text : text;
}
