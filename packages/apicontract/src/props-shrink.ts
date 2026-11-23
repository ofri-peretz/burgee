/**
 * The smallest counterexample (contract-properties constraints): from a failing value, take any
 * smaller one that still fails, until none does. Smaller is fewer keys and items, shorter text,
 * numbers nearer zero. Greedy, and bounded: it stops after `budget` tries.
 */
import { isDict } from './diff-normalise.js';

function* smallerArray(value: readonly unknown[]): Generator<unknown> {
  // A single item's removal below is already the empty list.
  if (value.length > 1) yield [];
  for (let index = 0; index < value.length; index += 1) yield value.filter((_, at) => at !== index);
  for (const [index, old] of value.entries()) {
    for (const item of smaller(old)) yield value.map((each, at) => (at === index ? item : each));
  }
}

function* smallerObject(value: Readonly<Record<string, unknown>>): Generator<unknown> {
  const entries = Object.entries(value);
  for (const [key] of entries) yield Object.fromEntries(entries.filter(([name]) => name !== key));
  for (const [key, old] of entries) {
    for (const item of smaller(old)) yield Object.fromEntries(entries.map(([name, each]) => [name, name === key ? item : each]));
  }
}

function* smallerString(value: string): Generator<unknown> {
  const points = [...value];
  if (points.length === 0) return;
  yield '';
  if (points.length === 1) return;
  yield points.slice(0, Math.floor(points.length / 2)).join('');
  yield points.slice(0, -1).join('');
}

function* smallerNumber(value: number): Generator<unknown> {
  if (value === 0) return;
  yield 0;
  if (!Number.isInteger(value)) yield Math.trunc(value);
  if (Math.abs(value) > 1) yield Math.trunc(value / 2);
  // One step nearer zero: halving alone stops at 12 when only more than 9 fails.
  if (Number.isInteger(value) && Math.abs(value) > 2) yield value - Math.sign(value);
  // Stryker disable next-line EqualityOperator: equivalent, zero returned above
  if (value < 0) yield -value;
}

/** Values a step smaller than `value`, smallest first. */
export function* smaller(value: unknown): Generator<unknown> {
  if (Array.isArray(value)) yield* smallerArray(value);
  else if (isDict(value)) yield* smallerObject(value);
  else if (typeof value === 'string') yield* smallerString(value);
  else if (typeof value === 'number') yield* smallerNumber(value);
  else if (value === true) yield false;
}

/** The default number of candidates tried. */
export const BUDGET = 500;

/** A value no larger than `value` for which `fails` still holds. */
export const shrink = (value: unknown, fails: (candidate: unknown) => boolean, budget = BUDGET): unknown => {
  let current = value;
  let tries = 0;
  let improved = true;
  while (improved && tries < budget) {
    improved = false;
    for (const candidate of smaller(current)) {
      tries += 1;
      if (fails(candidate)) {
        current = candidate;
        improved = true;
        break;
      }
      if (tries >= budget) break;
    }
  }
  return current;
};
