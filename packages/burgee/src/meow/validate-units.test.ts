/**
 * `burgee/meow`'s checks one by one (`validate.ts`): each boundary meow's own suite reaches only
 * through a whole run, and the wording of each message, which an agent reads to fix its call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { host } from '../runtime.js';

import {
  checkChoices,
  checkDefaultTypes,
  checkInput,
  checkRequired,
  checkSetOnce,
  checkUnknownFlags,
  effectiveDefault,
  requireImportMeta,
  validateCommands,
  validateFlags,
} from './validate.js';

/** What `reportAndExit` wrote, with `exit` turned into a throw so the call returns here. */
let written = '';
beforeEach(() => {
  written = '';
  vi.spyOn(host.stderr, 'write').mockImplementation((chunk) => ((written += String(chunk)), true));
  vi.spyOn(host, 'exit').mockImplementation((code) => {
    throw new Error(`exit ${String(code)}`);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateFlags', () => {
  it('names every renamed or kebab-cased flag, comma-separated', () => {
    expect(() => validateFlags({ a: { alias: 'x' } as never })).toThrow('The following flags need to be updated: `--a`');
    expect(() => validateFlags({ 'a-b': {}, 'c-d': {} })).toThrow('Invalid flags: `a-b`, `c-d`');
  });

  it('refuses choices of another type than the flag, even one, and only when a type is declared', () => {
    expect(() => validateFlags({ logLevel: { type: 'string', choices: [1] } as never })).toThrow("Invalid flags: (`--log-level`, type: 'string')");
    expect(() => validateFlags({ level: { choices: ['x', 1] } as never })).not.toThrow();
  });
});

describe('effectiveDefault and checkDefaultTypes', () => {
  it('gives a boolean no default when booleanDefault is set to undefined', () => {
    expect(effectiveDefault({ type: 'boolean' }, { booleanDefault: undefined } as never)).toBeUndefined();
  });

  it('skips the `--` key, and reads an empty array as an array, not as the declared scalar type', () => {
    expect(() => checkDefaultTypes({ '--': { type: 'string', default: 1 } as never }, {} as never)).not.toThrow();
    expect(() => checkDefaultTypes({ name: { type: 'string', default: [] } as never }, {} as never)).toThrow(new TypeError('Expected "name" default value to be of type "string", got "array"'));
    expect(() => checkDefaultTypes({ names: { type: 'string', isMultiple: true, default: [] } as never }, {} as never)).not.toThrow();
  });
});

describe('requireImportMeta', () => {
  const refusal = new TypeError('The `importMeta` option is required. Its value must be `import.meta`.');
  it.each([undefined, 'import.meta', { url: 1 }, { url: 'not a file url' }])('refuses %j with meow’s message', (meta) => {
    expect(() => requireImportMeta(meta as never)).toThrow(refusal);
  });
});

describe('validateCommands', () => {
  it('refuses a list where any one command is bad', () => {
    expect(() => validateCommands(['ok', '-x'])).toThrow('do not start with `-`');
    expect(() => validateCommands(['ok', 'fine'])).not.toThrow();
  });
});

describe('checkChoices', () => {
  it('names the flag by its dashed name', () => {
    expect(() => checkChoices({ logLevel: { choices: ['a'] } as never }, { logLevel: 'b' })).toThrow('Unknown value for flag `--log-level`: `b`.');
  });

  it('says nothing of an absent value unless the flag is required', () => {
    expect(() => checkChoices({ level: { choices: ['a'] } as never }, {})).not.toThrow();
    expect(() => checkChoices({ level: { choices: ['a'], isRequired: true } as never }, {})).toThrow('Flag `--level` has no value.');
  });
});

describe('checkRequired', () => {
  it('counts an empty array as missing only for an isMultiple flag', () => {
    expect(() => checkRequired({ a: { isRequired: true } as never }, { a: [] }, [])).not.toThrow();
    expect(() => checkRequired({ a: { isRequired: true, isMultiple: true } as never }, { a: [] }, [])).toThrow('exit 2');
  });

  it('names the short flag beside the long one', () => {
    expect(() => checkRequired({ name: { isRequired: true, shortFlag: 'n' } as never }, {}, [])).toThrow('exit 2');
    expect(written).toBe('Missing required flag\n\t--name, -n\n');
  });
});

describe('checkUnknownFlags', () => {
  it('reports a dashed word that is not a negative number, and nothing else', () => {
    expect(() => checkUnknownFlags([5, '-', 'abc', '-12', '-1.5', '-.5', '-12.25', '-1e5', '-1E+10', '-2.5e-3'])).not.toThrow();
    for (const word of ['-1x', '-x-1', '-a.5', '-1.x', '-1e', '-1ex', '-1e*5', '-1e+']) {
      written = '';
      expect(() => checkUnknownFlags([word]), word).toThrow('exit 2');
      expect(written).toBe(`Unknown flag\n${word}\n`);
    }
  });
});

describe('checkInput', () => {
  it('demands no input when isRequired is absent', () => {
    expect(() => checkInput({ input: {} } as never, [])).not.toThrow();
    expect(() => checkInput({ input: { isRequired: true } } as never, [])).toThrow('exit 2');
  });
});

describe('checkSetOnce', () => {
  it('lets the `--` key hold many words', () => {
    expect(() => checkSetOnce({ '--': {} }, { '--': ['a', 'b'] })).not.toThrow();
    expect(() => checkSetOnce({ name: {} }, { name: ['a', 'b'] })).toThrow('The flag --name can only be set once.');
  });
});
