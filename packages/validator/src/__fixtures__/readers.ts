import { inspect } from 'node:util';

import { expect } from 'vitest';

import { check } from '../check.js';
import { issues } from '../issues.js';
import { compile } from '../jit.js';
import { parse } from '../parse.js';
import { type Schema } from '../schema.js';

const compiled = new WeakMap<Schema<unknown>, (value: unknown) => boolean>();

/** The emitted code for a schema, built once. Only tests run emitted text (spec.md R3). */
const emitted = (schema: Schema<unknown>): ((value: unknown) => boolean) => {
  const known = compiled.get(schema);
  if (known !== undefined) return known;
  const made = compile(schema);
  compiled.set(schema, made);
  return made;
};

/**
 * What `check` says of a value, having held the other readers to it (spec.md R2): the emitted code
 * says the same, `issues` is empty exactly on a yes, with and without `first`, and `parse` accepts
 * what `check` accepts and never hands back, unchanged, a value `check` refuses.
 */
export const verdict = (schema: Schema<unknown>, value: unknown): boolean => {
  const yes = check(schema, value);
  const name = inspect(value, { depth: 4, breakLength: Number.POSITIVE_INFINITY });
  expect(emitted(schema)(value), `emitted, on ${name}`).toBe(yes);
  expect(issues(schema, value).length === 0, `issues, on ${name}`).toBe(yes);
  expect(issues(schema, value, { first: true }).length === 0, `the first issue, on ${name}`).toBe(yes);
  const parsed = parse(schema, value);
  if (yes) expect(parsed.ok, `parse, on ${name}`).toBe(true);
  else expect(parsed.ok && Object.is(parsed.value, value), `parse, on ${name}`).toBe(false);
  return yes;
};

/** Holds the readers to each other on every value, and says which they accept. */
export const verdicts = (schema: Schema<unknown>, values: readonly unknown[]): boolean[] => values.map((value) => verdict(schema, value));
