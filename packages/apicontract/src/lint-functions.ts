/**
 * `lint`'s built-in `then` functions (apicontract-lint spec.md R4): each pure and total. A
 * function returns `undefined` when the value holds, else a message saying what is wrong with it.
 * The names and options are Spectral's core functions, so a carried `.spectral.yaml` rule (R9)
 * means here what it meant there.
 */
import { check } from 'loadline';
import { fromJsonSchema, type ImportDraft } from 'loadline/json-schema';

import { type FunctionName } from './lint-names.js';

export const CASINGS = ['camel', 'pascal', 'kebab', 'snake', 'macro', 'flat'] as const;
export type Casing = (typeof CASINGS)[number];

const CASE: Readonly<Record<Casing, RegExp>> = {
  camel: /^[a-z][a-zA-Z\d]*$/u,
  pascal: /^[A-Z][a-zA-Z\d]*$/u,
  kebab: /^[a-z][a-z\d]*(?:-[a-z\d]+)*$/u,
  snake: /^[a-z][a-z\d]*(?:_[a-z\d]+)*$/u,
  macro: /^[A-Z][A-Z\d]*(?:_[A-Z\d]+)*$/u,
  flat: /^[a-z][a-z\d]*$/u,
};

/** A value's own members, read as a record: `{}` for null and undefined, so a missing member reads as `undefined`. */
const membersOf = (value: unknown): Record<string, unknown> => Object(value) as Record<string, unknown>;

const shown = (value: unknown): string => (value === undefined ? 'missing' : JSON.stringify(value));

/** How many of something a value has: a string's characters, an array's items, an object's keys. */
const sizeOf = (value: unknown): number | undefined => {
  if (typeof value === 'string' || Array.isArray(value)) return value.length;
  return typeof value === 'object' && value !== null ? Object.keys(value).length : undefined;
};

const lengthOf = (value: unknown, options: Record<string, unknown>): string | undefined => {
  if (value === undefined) return 'is missing';
  const size = sizeOf(value);
  if (size === undefined) return `${shown(value)} has no length`;
  const { min, max } = options;
  if (typeof min === 'number' && size < min) return `has ${String(size)}, fewer than ${String(min)}`;
  if (typeof max === 'number' && size > max) return `has ${String(size)}, more than ${String(max)}`;
  return undefined;
};

const patternOf = (value: unknown, options: Record<string, unknown>): string | undefined => {
  if (typeof value !== 'string') return `${shown(value)} is not a string`;
  const { match, notMatch } = options;
  // The patterns are the rule's own data, written by the ruleset's owner, never read from the contract.
  // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- a rule's own pattern
  if (typeof match === 'string' && !new RegExp(match, 'u').test(value)) return `${shown(value)} does not match ${match}`;
  // eslint-disable-next-line secure-coding/detect-non-literal-regexp -- a rule's own pattern
  if (typeof notMatch === 'string' && new RegExp(notMatch, 'u').test(value)) return `${shown(value)} matches ${notMatch}`;
  return undefined;
};

const casingOf = (value: unknown, options: Record<string, unknown>): string | undefined => {
  const type = options.type as Casing;
  if (typeof value !== 'string') return `${shown(value)} is not a string`;
  return CASE[type].test(value) ? undefined : `${shown(value)} is not ${type} case`;
};

const xorOf = (value: unknown, options: Record<string, unknown>): string | undefined => {
  const names = (options.properties ?? []) as string[];
  const present = names.filter((name) => membersOf(value)[name] !== undefined);
  if (present.length === 1) return undefined;
  const has = present.length === 0 ? 'none' : present.join(' and ');
  return `has ${has} of ${names.join(', ')}; exactly one is wanted`;
};

/** Whether `value` is valid against a JSON Schema, by the validator package's reader. */
export const validAgainst = (schema: unknown, value: unknown, draft: ImportDraft = '2020-12'): string | undefined => {
  const imported = fromJsonSchema(schema, { draft });
  return check(imported.schema, value) ? undefined : `${shown(value)} is not valid against its schema`;
};

/** Apply one function to one value: `undefined` when it holds, else what is wrong. */
export const apply = (name: FunctionName, value: unknown, options: Record<string, unknown> = {}): string | undefined => {
  switch (name) {
    case 'truthy': {
      return value === undefined || value === null || value === false || value === '' || value === 0 ? `is ${shown(value)}` : undefined;
    }
    case 'falsy': {
      return value === undefined || value === null || value === false || value === '' || value === 0 ? undefined : `is ${shown(value)}`;
    }
    case 'defined': {
      return value === undefined ? 'is missing' : undefined;
    }
    case 'undefined': {
      return value === undefined ? undefined : `is ${shown(value)}`;
    }
    case 'pattern': {
      return patternOf(value, options);
    }
    case 'casing': {
      return casingOf(value, options);
    }
    case 'enumeration': {
      const values = (options.values ?? []) as unknown[];
      return values.includes(value) ? undefined : `${shown(value)} is not one of ${values.map((item) => JSON.stringify(item)).join(', ')}`;
    }
    case 'length': {
      return lengthOf(value, options);
    }
    case 'xor': {
      return xorOf(value, options);
    }
    case 'schema': {
      return validAgainst(options.schema, value);
    }
  }
};

export { FUNCTIONS, type FunctionName } from './lint-names.js';
