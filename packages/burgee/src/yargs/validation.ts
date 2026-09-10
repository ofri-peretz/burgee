/**
 * yargs' validation — demanded options and commands, unknown arguments under strict
 * modes, choices, implications, conflicts, and `recommendCommands` — ported for
 * `burgee/yargs`. Every message is the upstream's through y18n.
 */
 
import type { PlatformShim } from './shim.js';
import { argsert, levenshtein as distance, objFilter } from './utils.js';

const specialKeys = ['$0', '--', '_'];

export interface ValidationInstance {
  nonOptionCount: (argv: any) => void;
  positionalCount: (required: number, observed: number) => void;
  requiredArguments: (argv: any, demandedOptions: Record<string, string | undefined>) => void;
  unknownArguments: (argv: any, aliases: Record<string, string[]>, positionalMap: any, isDefaultCommand: boolean, checkPositionals?: boolean) => void;
  unknownCommands: (argv: any) => boolean;
  isValidAndSomeAliasIsNotNew: (key: string, aliases: Record<string, string[]>) => boolean;
  limitedChoices: (argv: any) => void;
  implies: (key: string | Record<string, any>, value?: any) => void;
  getImplied: () => Record<string, any[]>;
  implications: (argv: any) => void;
  conflicts: (key: string | Record<string, any>, value?: any) => void;
  getConflicting: () => Record<string, any[]>;
  conflicting: (argv: any) => void;
  recommendCommands: (cmd: string, potentialCommands: string[]) => void;
  reset: (localLookup: Record<string, boolean>) => ValidationInstance;
  freeze: () => void;
  unfreeze: () => void;
}

export function validation(yargs: any, usage: any, shim: PlatformShim): ValidationInstance {
  const __ = shim.y18n.__;
  const __n = shim.y18n.__n;
  const self = {} as ValidationInstance;

  self.nonOptionCount = function nonOptionCount(argv) {
    const demandedCommands = yargs.getDemandedCommands();
    const positionalCount = argv._.length + (argv['--'] ? argv['--'].length : 0);
    const _s = positionalCount - yargs.getInternalMethods().getContext().commands.length;
    if (demandedCommands._ && (_s < demandedCommands._.min || _s > demandedCommands._.max)) {
      if (_s < demandedCommands._.min) {
        if (demandedCommands._.minMsg !== undefined) {
          usage.fail(
            demandedCommands._.minMsg
              ? demandedCommands._.minMsg.replace(/\$0/g, _s.toString()).replace(/\$1/, demandedCommands._.min.toString())
              : null,
          );
        } else {
          usage.fail(
            __n(
              'Not enough non-option arguments: got %s, need at least %s',
              'Not enough non-option arguments: got %s, need at least %s',
              _s,
              _s.toString(),
              demandedCommands._.min.toString(),
            ),
          );
        }
      } else if (_s > demandedCommands._.max) {
        if (demandedCommands._.maxMsg !== undefined) {
          usage.fail(
            demandedCommands._.maxMsg
              ? demandedCommands._.maxMsg.replace(/\$0/g, _s.toString()).replace(/\$1/, demandedCommands._.max.toString())
              : null,
          );
        } else {
          usage.fail(
            __n(
              'Too many non-option arguments: got %s, maximum of %s',
              'Too many non-option arguments: got %s, maximum of %s',
              _s,
              _s.toString(),
              demandedCommands._.max.toString(),
            ),
          );
        }
      }
    }
  };

  self.positionalCount = function positionalCount(required, observed) {
    if (observed < required) {
      usage.fail(
        __n(
          'Not enough non-option arguments: got %s, need at least %s',
          'Not enough non-option arguments: got %s, need at least %s',
          observed,
          `${observed}`,
          `${required}`,
        ),
      );
    }
  };

  self.requiredArguments = function requiredArguments(argv, demandedOptions) {
    let missing: Record<string, string | undefined> | null = null;
    for (const key of Object.keys(demandedOptions)) {
      if (!Object.prototype.hasOwnProperty.call(argv, key) || typeof argv[key] === 'undefined') {
        missing = missing || {};
        missing[key] = demandedOptions[key];
      }
    }
    if (missing) {
      const customMsgs: string[] = [];
      for (const key of Object.keys(missing)) {
        const msg = missing[key];
        if (msg && customMsgs.indexOf(msg) < 0) customMsgs.push(msg);
      }
      const customMsg = customMsgs.length ? `\n${customMsgs.join('\n')}` : '';
      usage.fail(__n('Missing required argument: %s', 'Missing required arguments: %s', Object.keys(missing).length, Object.keys(missing).join(', ') + customMsg));
    }
  };

  self.unknownArguments = function unknownArguments(argv, aliases, positionalMap, isDefaultCommand, checkPositionals = true) {
    const commandKeys: string[] = yargs.getInternalMethods().getCommandInstance().getCommands();
    const unknown: string[] = [];
    const currentContext = yargs.getInternalMethods().getContext();
    Object.keys(argv).forEach((key) => {
      if (
        !specialKeys.includes(key) &&
        !Object.prototype.hasOwnProperty.call(positionalMap, key) &&
        !Object.prototype.hasOwnProperty.call(yargs.getInternalMethods().getParseContext(), key) &&
        !self.isValidAndSomeAliasIsNotNew(key, aliases)
      ) {
        unknown.push(key);
      }
    });
    if (checkPositionals && (currentContext.commands.length > 0 || commandKeys.length > 0 || isDefaultCommand)) {
      argv._.slice(currentContext.commands.length).forEach((key: any) => {
        if (!commandKeys.includes(`${key}`)) unknown.push(`${key}`);
      });
    }
    if (checkPositionals) {
      const demandedCommands = yargs.getDemandedCommands();
      const maxNonOptDemanded = demandedCommands._?.max || 0;
      const expected = currentContext.commands.length + maxNonOptDemanded;
      if (expected < argv._.length) {
        argv._.slice(expected).forEach((key: any) => {
          key = String(key);
          if (!currentContext.commands.includes(key) && !unknown.includes(key)) unknown.push(key);
        });
      }
    }
    if (unknown.length) {
      usage.fail(__n('Unknown argument: %s', 'Unknown arguments: %s', unknown.length, unknown.map((s) => (s.trim() ? s : `"${s}"`)).join(', ')));
    }
  };

  self.unknownCommands = function unknownCommands(argv) {
    const commandKeys: string[] = yargs.getInternalMethods().getCommandInstance().getCommands();
    const unknown: string[] = [];
    const currentContext = yargs.getInternalMethods().getContext();
    if (currentContext.commands.length > 0 || commandKeys.length > 0) {
      argv._.slice(currentContext.commands.length).forEach((key: any) => {
        if (!commandKeys.includes(`${key}`)) unknown.push(`${key}`);
      });
    }
    if (unknown.length > 0) {
      usage.fail(__n('Unknown command: %s', 'Unknown commands: %s', unknown.length, unknown.join(', ')));
      return true;
    }
    return false;
  };

  self.isValidAndSomeAliasIsNotNew = function isValidAndSomeAliasIsNotNew(key, aliases) {
    if (!Object.prototype.hasOwnProperty.call(aliases, key)) return false;
    const newAliases = yargs.parsed.newAliases;
    return [key, ...(aliases[key] as string[])].some((a) => !Object.prototype.hasOwnProperty.call(newAliases, a) || !newAliases[key]);
  };

  self.limitedChoices = function limitedChoices(argv) {
    const options = yargs.getOptions();
    const invalid: Record<string, any[]> = {};
    if (!Object.keys(options.choices).length) return;
    Object.keys(argv).forEach((key) => {
      if (specialKeys.indexOf(key) === -1 && Object.prototype.hasOwnProperty.call(options.choices, key)) {
        ([] as any[]).concat(argv[key]).forEach((value) => {
          if (options.choices[key].indexOf(value) === -1 && value !== undefined) invalid[key] = (invalid[key] || []).concat(value);
        });
      }
    });
    const invalidKeys = Object.keys(invalid);
    if (!invalidKeys.length) return;
    let msg = __('Invalid values:');
    invalidKeys.forEach((key) => {
      msg += `\n  ${__('Argument: %s, Given: %s, Choices: %s', key, usage.stringifiedValues(invalid[key]), usage.stringifiedValues(options.choices[key]))}`;
    });
    usage.fail(msg);
  };

  let implied: Record<string, any[]> = {};
  self.implies = function implies(key, value) {
    argsert('<string|object> [array|number|string]', [key, value], arguments.length);
    if (typeof key === 'object') {
      Object.keys(key).forEach((k) => {
        self.implies(k, key[k]);
      });
    } else {
      yargs.global(key);
      if (!implied[key]) implied[key] = [];
      if (Array.isArray(value)) value.forEach((i) => self.implies(key, i));
      else {
        shim.assert.notStrictEqual(value, undefined);
        (implied[key] as any[]).push(value);
      }
    }
  };
  self.getImplied = function getImplied() {
    return implied;
  };

  function keyExists(argv: any, val: any): any {
    const num = Number(val);
    val = isNaN(num) ? val : num;
    if (typeof val === 'number') val = argv._.length >= val;
    else if (/^--no-.+/.exec(val)) {
      val = (/^--no-(.+)/.exec(val) as RegExpExecArray)[1];
      val = !Object.prototype.hasOwnProperty.call(argv, val);
    } else val = Object.prototype.hasOwnProperty.call(argv, val);
    return val;
  }

  self.implications = function implications(argv) {
    const implyFail: string[] = [];
    Object.keys(implied).forEach((key) => {
      const origKey = key;
      (implied[key] || []).forEach((value) => {
        let k: any = origKey;
        const origValue = value;
        k = keyExists(argv, k);
        value = keyExists(argv, value);
        if (k && !value) implyFail.push(` ${origKey} -> ${origValue}`);
      });
    });
    if (implyFail.length) {
      let msg = `${__('Implications failed:')}\n`;
      implyFail.forEach((value) => {
        msg += value;
      });
      usage.fail(msg);
    }
  };

  let conflicting: Record<string, any[]> = {};
  self.conflicts = function conflicts(key, value) {
    argsert('<string|object> [array|string]', [key, value], arguments.length);
    if (typeof key === 'object') {
      Object.keys(key).forEach((k) => {
        self.conflicts(k, key[k]);
      });
    } else {
      yargs.global(key);
      if (!conflicting[key]) conflicting[key] = [];
      if (Array.isArray(value)) value.forEach((i) => self.conflicts(key, i));
      else (conflicting[key] as any[]).push(value);
    }
  };
  self.getConflicting = () => conflicting;

  self.conflicting = function conflictingFn(argv) {
    Object.keys(argv).forEach((key) => {
      if (conflicting[key]) {
        (conflicting[key] as any[]).forEach((value) => {
          if (value && argv[key] !== undefined && argv[value] !== undefined) usage.fail(__('Arguments %s and %s are mutually exclusive', key, value));
        });
      }
    });
    if (yargs.getInternalMethods().getParserConfiguration()['strip-dashed']) {
      Object.keys(conflicting).forEach((key) => {
        (conflicting[key] as any[]).forEach((value) => {
          if (value && argv[shim.Parser.camelCase(key)] !== undefined && argv[shim.Parser.camelCase(value)] !== undefined) {
            usage.fail(__('Arguments %s and %s are mutually exclusive', key, value));
          }
        });
      });
    }
  };

  self.recommendCommands = function recommendCommands(cmd, potentialCommands) {
    const threshold = 3;
    potentialCommands = potentialCommands.sort((a, b) => b.length - a.length);
    let recommended: string | null = null;
    let bestDistance = Infinity;
    for (let i = 0, candidate; (candidate = potentialCommands[i]) !== undefined; i++) {
      const d = distance(cmd, candidate);
      if (d <= threshold && d < bestDistance) {
        bestDistance = d;
        recommended = candidate;
      }
    }
    if (recommended) usage.fail(__('Did you mean %s?', recommended));
  };

  self.reset = function reset(localLookup) {
    implied = objFilter(implied, (k) => !localLookup[k]);
    conflicting = objFilter(conflicting, (k) => !localLookup[k]);
    return self;
  };

  const frozens: { implied: Record<string, any[]>; conflicting: Record<string, any[]> }[] = [];
  self.freeze = function freeze() {
    frozens.push({ implied, conflicting });
  };
  self.unfreeze = function unfreeze() {
    const frozen = frozens.pop();
    shim.assert.notStrictEqual(frozen, undefined);
    ({ implied, conflicting } = frozen as { implied: Record<string, any[]>; conflicting: Record<string, any[]> });
  };

  return self;
}
