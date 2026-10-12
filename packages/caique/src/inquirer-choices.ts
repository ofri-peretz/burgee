/**
 * What the list prompts share: a choice as a caller writes it, the same choice normalised,
 * the walk from one navigable item to the next, and the line of key hints under a list.
 *
 * `select`, `search` and `checkbox` each normalise the same way — a bare value is its own
 * name, `short` falls back to `name`, `disabled` to `false` — so the rule is written once.
 * `checkbox` adds two fields of its own on top (`checkedName`, `checked`), and `rawlist` and
 * `expand` key their choices differently enough to keep their own.
 */
import { styleText } from 'node:util';

import { Separator } from './inquirer-core.js';

/** A choice as a caller writes it, beside a bare value or a `Separator`. */
export interface Choice<Value> {
  value: Value;
  name?: string;
  description?: string;
  short?: string;
  disabled?: boolean | string;
  type?: never;
}

/** A choice with every field the prompt draws filled in. */
export interface NormalizedChoice<Value> {
  value: Value;
  name: string;
  description?: string;
  short: string;
  disabled: boolean | string;
}

/** One row of a list: a choice, or a separator between choices. */
export type Item<Value> = NormalizedChoice<Value> | Separator;

/** Whether `choice` was written as an object with a `value`, rather than as the value itself. */
export const isChoiceObject = <Value>(choice: unknown): choice is Choice<Value> => typeof choice === 'object' && choice !== null && 'value' in choice;

/** Any choice that is not a separator: the cursor may rest on it, disabled or not. */
export const isNavigable = <Value>(item: Item<Value> | undefined): item is NormalizedChoice<Value> => item !== undefined && !Separator.isSeparator(item);

/** A choice that can be answered with: navigable, and not disabled. */
export const isSelectable = <Value>(item: Item<Value> | undefined): item is NormalizedChoice<Value> => isNavigable(item) && !item.disabled;

/** `select`'s and `search`'s normalisation, which is also the base of `checkbox`'s. */
export function normalizeChoices<Value>(choices: readonly (Value | Choice<Value> | Separator)[]): Item<Value>[] {
  return choices.map((choice) => {
    if (Separator.isSeparator(choice)) return choice;
    if (!isChoiceObject<Value>(choice)) {
      const name = String(choice);
      return { value: choice as Value, name, short: name, disabled: false };
    }
    const name = choice.name ?? String(choice.value);
    const normalized: NormalizedChoice<Value> = { value: choice.value, name, short: choice.short ?? name, disabled: choice.disabled ?? false };
    // Set only when there is one, so a choice without a description has no key for it at all.
    if (choice.description) normalized.description = choice.description;
    return normalized;
  });
}

/**
 * Whether the cursor may move from `at` towards `up`'s end: always in a looping list, and
 * otherwise only while it is not already on the first (or last) navigable item.
 */
export const canMove = (loop: boolean, up: boolean, at: number, bounds: { first: number; last: number }): boolean => loop || at !== (up ? bounds.first : bounds.last);

/** The first and last navigable index, or `-1` for both when there is none. */
export function boundsOf<Row>(items: readonly Row[], counts: (item: Row) => boolean): { first: number; last: number } {
  return { first: items.findIndex(counts), last: items.findLastIndex(counts) };
}

/**
 * The index one step from `from` in `offset`'s direction that `lands` accepts, coming round
 * the end of the list. Called only where such an index exists, so it always stops.
 */
export function step<Row>(items: readonly Row[], from: number, offset: 1 | -1, lands: (item: Row | undefined) => boolean): number {
  let next = from;
  do {
    next = (next + offset + items.length) % items.length;
  } while (!lands(items[next]));
  return next;
}

/**
 * The position of the `n`-th choice (1-based) counting choices only, separators skipped, or
 * `-1`. What a number key selects in `select` and toggles in `checkbox`.
 */
export function nthChoice<Value>(items: readonly Item<Value>[], n: number): number {
  let seen = 0;
  return items.findIndex((item) => !Separator.isSeparator(item) && ++seen === n);
}

/** The key hints under a list, `↑↓ navigate • ⏎ select`, with each key bold and each action dim. */
export const keysHelpTip = (keys: [key: string, action: string][]): string | undefined =>
  keys.map(([key, action]) => `${styleText('bold', key)} ${styleText('dim', action)}`).join(styleText('dim', ' • '));
