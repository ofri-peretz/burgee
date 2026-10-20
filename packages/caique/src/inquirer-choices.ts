/**
 * What `select` and `checkbox` share: a choice list, normalised; moving through it; and the
 * frame drawn around a page of it.
 *
 * Upstream writes each of these twice, once in each prompt's package. Here they are one copy,
 * because two drop-ins of the same behaviour drift apart one bug fix at a time.
 */
import { styleText } from 'node:util';

import { HIDE_CURSOR } from 'closeout/cursor';

import { type Choice, type Item, type NormalizedChoice } from './inquirer-choice.js';
import { ValidationError } from './inquirer-errors.js';
import { isDownKey, isUpKey, type Keybinding, type KeypressEvent } from './inquirer-keys.js';
import { UNICODE } from './inquirer-theme.js';
import { Separator } from './inquirer.js';

/** `@inquirer/figures`' glyphs a list prompt draws, with its fallbacks where unicode is not drawn. */
export const POINTER = UNICODE ? '❯' : '>';

/** Not a separator. */
export const isNavigable = <Value>(item: Item<Value> | undefined): item is NormalizedChoice<Value> => item !== undefined && !Separator.isSeparator(item);

/** Not a separator, and not disabled. */
export const isSelectable = <Value>(item: Item<Value> | undefined): item is NormalizedChoice<Value> => isNavigable(item) && !item.disabled;

/** Every choice with its defaults filled in. A bare value is its own name. */
export function normalizeChoices<Value>(choices: readonly (Value | Choice<Value> | Separator)[]): Item<Value>[] {
  return choices.map((choice) => {
    if (Separator.isSeparator(choice)) return choice;
    const written: Choice<Value> = typeof choice === 'object' && choice !== null && 'value' in choice ? (choice as Choice<Value>) : { value: choice };
    const name = written.name ?? String(written.value);
    const normalized: NormalizedChoice<Value> = {
      value: written.value,
      name,
      short: written.short ?? name,
      checkedName: written.checkedName ?? name,
      disabled: written.disabled ?? false,
      checked: written.checked ?? false,
    };
    if (written.description) normalized.description = written.description;
    return normalized;
  });
}

/** The first and last rows a cursor may stand on. A list with none is the prompt's `ValidationError`. */
export function boundsOf<Value>(items: readonly Item<Value>[], prompt: string): { first: number; last: number } {
  const first = items.findIndex(isNavigable);
  if (first === -1) throw new ValidationError(`[${prompt} prompt] No selectable choices. All choices are disabled.`);
  return { first, last: items.findLastIndex(isNavigable) };
}

/**
 * Where an up or down key moves the cursor: the next navigable row that way, wrapping when the
 * list loops and standing still at an end when it does not. `undefined` for any other key.
 */
export function moveCursor<Value>(
  key: KeypressEvent,
  keybindings: readonly Keybinding[],
  { items, active, loop, bounds }: { items: readonly Item<Value>[]; active: number; loop: boolean; bounds: { first: number; last: number } },
): number | undefined {
  const up = isUpKey(key, keybindings);
  if (!up && !isDownKey(key, keybindings)) return undefined;
  if (!loop && active === (up ? bounds.first : bounds.last)) return active;
  let next = active;
  do next = (next + (up ? -1 : 1) + items.length) % items.length;
  while (!isNavigable(items[next]));
  return next;
}

/** The row of the `n`th choice, counting from one and skipping separators; -1 when there is none. */
export function nthChoice<Value>(items: readonly Item<Value>[], n: number): number {
  let seen = 0;
  return items.findIndex((item) => isNavigable(item) && ++seen === n);
}

/** Upstream's help line: each key bold, each action dim, joined by a dim bullet. */
export const keysHelpTip = (keys: [key: string, action: string][]): string | undefined =>
  keys.map(([key, action]) => `${styleText('bold', key)} ${styleText('dim', action)}`).join(styleText('dim', ' • '));

/** The open frame of a list prompt: header, page, a spacer, and whatever of the rest is set. */
export const listFrame = (header: string, page: string, rest: (string | undefined)[]): string =>
  `${[header, page, ' ', ...rest]
    .filter(Boolean)
    .join('\n')
    .trimEnd()}${HIDE_CURSOR}`;
