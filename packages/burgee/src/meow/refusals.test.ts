/**
 * Everything `burgee/meow` refuses, in meow 14.1.0's words, called directly: the declaration
 * checks, a default of the wrong kind, `commands`, `choices` at parse time, required flags and
 * required input. Throws where meow throws; prints and exits 2 where meow does.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { checkChoices, checkDefaultTypes, checkInput, checkRequired, effectiveDefault, requireImportMeta, validateCommands, validateFlags } from './validate.js';

class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super(`exit ${String(code)}`);
  }
}

let err: string;
beforeEach(() => {
  err = '';
  vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => ((err += String(s)), true));
  vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new Exit(code === null ? undefined : Number(code));
  });
});
afterEach(() => vi.restoreAllMocks());

/** The exit code a check ended with, or undefined when it returned. */
const exitOf = (fn: () => void): number | undefined => {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof Exit) return error.code;
    throw error;
  }
};

describe('validateFlags: the declaration mistakes, collected into one error', () => {
  it('names a kebab key, a deprecated alias, and non-array choices, in meow’s order', () => {
    const flags = { 'foo-bar': { type: 'string' }, old: { type: 'string', alias: 'o' }, pick: { type: 'string', choices: 'a' } } as never;
    expect(() => validateFlags(flags)).toThrow(
      new Error(
        "Flag keys may not contain '-'. Invalid flags: `foo-bar`\n" +
          'The option `alias` has been renamed to `shortFlag`. The following flags need to be updated: `--old`\n' +
          'The option `choices` must be an array. Invalid flags: `--pick`',
      ),
    );
  });
  it('accepts `--` itself, the one key allowed to contain a dash', () => {
    expect(() => validateFlags({ '--': { type: 'string' } } as never)).not.toThrow();
  });
  it('refuses a default outside its choices, a list default included', () => {
    expect(() => validateFlags({ mode: { type: 'string', choices: ['a', 'b'], default: 'c' } } as never)).toThrow(
      'Each value of the option `default` must exist within the option `choices`. Invalid flags: `--mode`',
    );
    expect(() => validateFlags({ modes: { type: 'string', isMultiple: true, choices: ['a', 'b'], default: ['a', 'z'] } } as never)).toThrow(/Invalid flags: `--modes`/);
    expect(() => validateFlags({ modes: { type: 'string', isMultiple: true, choices: ['a', 'b'], default: ['a', 'b'] } } as never)).not.toThrow();
  });
});

describe('effectiveDefault and checkDefaultTypes', () => {
  it('gives a repeatable boolean its boolean default as a list, and any other repeatable flag an empty list', () => {
    expect(effectiveDefault({ type: 'boolean', isMultiple: true }, {})).toEqual({ value: [false] });
    expect(effectiveDefault({ type: 'number', isMultiple: true }, {})).toEqual({ value: [] });
    expect(effectiveDefault({ type: 'string' }, {})).toBeUndefined();
  });
  it('types a repeatable flag with no type as a string array, and accepts an empty list for any array', () => {
    expect(() => checkDefaultTypes({ tags: { isMultiple: true, default: [1] } } as never, {})).toThrow(new TypeError('Expected "tags" default value to be of type "string-array", got "number-array"'));
    expect(() => checkDefaultTypes({ tags: { type: 'number', isMultiple: true, default: [] } } as never, {})).not.toThrow();
  });
  it('names null as null', () => {
    expect(() => checkDefaultTypes({ name: { type: 'string', default: null } } as never, {})).toThrow(new TypeError('Expected "name" default value to be of type "string", got "null"'));
  });
});

describe('importMeta and commands', () => {
  it('refuses an importMeta whose url is not a file URL', () => {
    expect(() => requireImportMeta({ url: 'https://example.com/cli.js' } as ImportMeta)).toThrow(new TypeError('The `importMeta` option is required. Its value must be `import.meta`.'));
  });
  it('refuses commands that are not a list, an empty list, and a word no one could type', () => {
    expect(() => validateCommands('run' as never)).toThrow(new TypeError('The `commands` option must be an array of strings.'));
    expect(() => validateCommands([])).toThrow(new TypeError('The `commands` option must contain at least one command.'));
    for (const bad of [[''], ['two words'], ['-x'], [3]]) {
      expect(() => validateCommands(bad as never)).toThrow(new TypeError('The `commands` option must be an array of non-empty strings without whitespace that do not start with `-`.'));
    }
    expect(() => validateCommands(['run'])).not.toThrow();
  });
});

describe('checkChoices, at parse time', () => {
  const specs = { mode: { type: 'string', choices: ['fast', 'slow'] }, need: { type: 'string', choices: ['a'], isRequired: true }, free: { type: 'string' } } as never;
  it('passes a value in its choices, and an absent value that is not required', () => {
    expect(() => checkChoices(specs, { mode: 'fast', need: 'a' })).not.toThrow();
  });
  it('names one unknown value, several in the plural, and a required flag with none, in one error', () => {
    expect(() => checkChoices(specs, { mode: ['x', 'fast', 'y'] })).toThrow(
      new Error('Unknown values for flag `--mode`: `x`, `y`. Value must be one of: [`fast`, `slow`]\nFlag `--need` has no value. Value must be one of: [`a`]'),
    );
    expect(() => checkChoices(specs, { mode: 'x', need: 'a' })).toThrow(new Error('Unknown value for flag `--mode`: `x`. Value must be one of: [`fast`, `slow`]'));
  });
  it('skips a flag whose choices is not a list — validateFlags has already refused it', () => {
    expect(() => checkChoices({ pick: { type: 'string', choices: 'a' } } as never, { pick: 'z' })).not.toThrow();
  });
  it('reads isRequired: false as not required', () => {
    expect(() => checkChoices({ opt: { type: 'string', choices: ['a'], isRequired: false } } as never, {})).not.toThrow();
  });
});

describe('checkRequired', () => {
  it('asks a predicate, and refuses one that answers something other than a boolean', () => {
    const when = vi.fn(() => true);
    expect(exitOf(() => checkRequired({ port: { type: 'number', isRequired: when } } as never, { host: 'x' }, ['in']))).toBe(2);
    expect(when).toHaveBeenCalledWith({ host: 'x' }, ['in']);
    expect(() => checkRequired({ port: { type: 'number', isRequired: () => 'yes' } } as never, {}, [])).toThrow(
      new TypeError('Return value for isRequired callback should be of type boolean, but string was returned.'),
    );
    expect(exitOf(() => checkRequired({ port: { type: 'number', isRequired: () => false } } as never, {}, []))).toBeUndefined();
  });
  it('counts an empty list as missing for a repeatable flag, names the short flag, and pluralises', () => {
    const specs = { tag: { type: 'string', isMultiple: true, isRequired: true, shortFlag: 't' }, name: { type: 'string', isRequired: true } } as never;
    expect(exitOf(() => checkRequired(specs, { tag: [] }, []))).toBe(2);
    expect(err).toBe('Missing required flags\n\t--tag, -t\n\t--name\n');
    expect(exitOf(() => checkRequired(specs, { tag: ['a'], name: '' }, []))).toBeUndefined();
  });
});

describe('checkInput', () => {
  it('asks a predicate with the input alone, and refuses a non-boolean answer', () => {
    const when = vi.fn(() => true);
    expect(exitOf(() => checkInput({ input: { isRequired: when } } as never, []))).toBe(2);
    expect(when).toHaveBeenCalledWith([]);
    expect(err).toBe('Missing required input\n');
    expect(() => checkInput({ input: { isRequired: () => 1 } } as never, [])).toThrow(new TypeError('Return value for isRequired callback should be of type boolean, but number was returned.'));
  });
  it('requires nothing when the predicate says no, or when there is input', () => {
    expect(exitOf(() => checkInput({ input: { isRequired: () => false } } as never, []))).toBeUndefined();
    expect(exitOf(() => checkInput({ input: { isRequired: true } } as never, ['a']))).toBeUndefined();
    expect(exitOf(() => checkInput({ input: { isRequired: true } } as never, []))).toBe(2);
  });
});
