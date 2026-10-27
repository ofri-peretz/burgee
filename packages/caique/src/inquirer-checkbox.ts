/**
 * `@inquirer/prompts`' `checkbox`: any number of choices from a list, toggled with space, by
 * number, or all at once. Graded by `checkbox`'s own suite in the `inquirer-prompts` host.
 */
import { styleText } from 'node:util';

import { type Choice, type Item, type NormalizedChoice } from './inquirer-choice.js';

import {
  boundsOf,
  isNavigable,
  isSelectable,
  keysHelpTip,
  listFrame,
  moveCursor,
  normalizeChoices,
  nthChoice,
  POINTER,
} from './inquirer-choices.js';
import { useMemo, useState } from './inquirer-hooks.js';
import { isEnterKey, isNumberKey, isSpaceKey } from './inquirer-keys.js';
import { usePagination } from './inquirer-pagination.js';
import { makeTheme, type PartialTheme, type Status, UNICODE } from './inquirer-theme.js';
import { createPrompt, Separator, useKeypress, usePrefix } from './inquirer.js';

/** What `checkbox` adds to the core theme. */
export interface CheckboxTheme {
  icon: { checked: string; unchecked: string; cursor: string; disabledChecked: string; disabledUnchecked: string };
  style: {
    disabled: (text: string) => string;
    renderSelectedChoices: <T>(selectedChoices: readonly NormalizedChoice<T>[], allChoices: readonly Item<T>[]) => string;
    description: (text: string) => string;
    keysHelpTip: (keys: [key: string, action: string][]) => string | undefined;
  };
  i18n: { disabledError: string };
}

const checkboxTheme: CheckboxTheme = {
  icon: {
    checked: styleText('green', UNICODE ? '◉' : '(*)'),
    unchecked: UNICODE ? '◯' : '( )',
    cursor: POINTER,
    disabledChecked: styleText('green', UNICODE ? '◎' : '( )'),
    disabledUnchecked: '-',
  },
  style: {
    disabled: (text) => styleText('dim', text),
    renderSelectedChoices: (selected) => selected.map((choice) => choice.short).join(', '),
    description: (text) => styleText('cyan', text),
    keysHelpTip,
  },
  i18n: { disabledError: 'This option is disabled and cannot be toggled.' },
};

/** `checkbox`'s configuration, as `@inquirer/checkbox` declares it. */
export interface CheckboxConfig<Value> {
  message: string;
  prefix?: string;
  pageSize?: number;
  choices: readonly (Value | Choice<Value> | Separator)[];
  loop?: boolean;
  required?: boolean;
  validate?: (choices: readonly NormalizedChoice<Value>[]) => boolean | string | Promise<string | boolean>;
  theme?: PartialTheme<CheckboxTheme>;
  shortcuts?: { all?: string | null; invert?: string | null };
}

const isChecked = <Value>(item: Item<Value>): item is NormalizedChoice<Value> => isNavigable(item) && item.checked;

const check =
  (checked?: boolean) =>
  <Value>(item: Item<Value>): Item<Value> =>
    isSelectable(item) ? { ...item, checked: checked ?? !item.checked } : item;

/** Toggle every selectable choice. */
const toggle = check();

const anything = (): true => true;

/** Ask for any of `choices`. */
export const checkbox = createPrompt(<Value>(config: CheckboxConfig<Value>, done: (value: Value[]) => void) => {
  const { pageSize = 7, loop = true, required, validate = anything } = config;
  const shortcuts = { all: 'a', invert: 'i', ...config.shortcuts };
  const theme = makeTheme<CheckboxTheme>(checkboxTheme, config.theme);
  const { keybindings } = theme;
  const [status, setStatus] = useState<Status>('idle');
  const prefix = usePrefix({ status, theme });
  const [items, setItems] = useState<readonly Item<Value>[]>(normalizeChoices(config.choices));
  const bounds = useMemo(() => boundsOf(items, 'checkbox'), [items]);
  const [active, setActive] = useState(bounds.first);
  const [errorMsg, setError] = useState<string>();
  const toggleAt = (position: number): void => {
    setItems(items.map((choice, i) => (i === position ? toggle(choice) : choice)));
  };

  const submit = async (): Promise<void> => {
    // Loading until `validate` answers, and every key ignored meanwhile (@inquirer/checkbox 5.2.7).
    setStatus('loading');
    const selection = items.filter(isChecked);
    const isValid = await validate([...selection]);
    setStatus('idle');
    if (required && selection.length === 0) setError('At least one choice must be selected');
    else if (isValid === true) {
      setStatus('done');
      done(selection.map((choice) => choice.value));
    } else setError(isValid || 'You must select a valid value');
  };

  useKeypress(async (key) => {
    if (status !== 'idle') return;
    const moved = moveCursor(key, keybindings, { items, active, loop, bounds });
    if (isEnterKey(key)) await submit();
    else if (moved !== undefined) {
      if (errorMsg) setError(undefined);
      setActive(moved);
    } else if (isSpaceKey(key)) {
      // `active` is always a navigable row.
      if ((items[active] as NormalizedChoice<Value>).disabled) setError(theme.i18n.disabledError);
      else {
        setError(undefined);
        toggleAt(active);
      }
    } else if (key.name === shortcuts.all) {
      setItems(items.map(check(items.some((choice) => isSelectable(choice) && !choice.checked))));
    } else if (key.name === shortcuts.invert) {
      setItems(items.map(toggle));
    } else if (isNumberKey(key)) {
      const position = nthChoice(items, Number(key.name));
      if (isSelectable(items[position])) {
        setActive(position);
        toggleAt(position);
      }
    }
  });

  const message = theme.style.message(config.message, status);
  let description: string | undefined;
  const page = usePagination({
    items,
    active,
    renderItem({ item, isActive }) {
      if (Separator.isSeparator(item)) return ` ${item.separator}`;
      const cursor = isActive ? theme.icon.cursor : ' ';
      if (item.disabled) {
        const label = typeof item.disabled === 'string' ? item.disabled : '(disabled)';
        return theme.style.disabled(`${cursor}${item.checked ? theme.icon.disabledChecked : theme.icon.disabledUnchecked} ${item.name} ${label}`);
      }
      if (isActive) description = item.description;
      const line = `${cursor}${item.checked ? `${theme.icon.checked} ${item.checkedName}` : `${theme.icon.unchecked} ${item.name}`}`;
      return isActive ? theme.style.highlight(line) : line;
    },
    pageSize,
    loop,
  });

  if (status === 'done') {
    const answer = theme.style.answer(theme.style.renderSelectedChoices(items.filter(isChecked), items));
    return [prefix, message, answer].filter(Boolean).join(' ');
  }

  const keys: [string, string][] = [
    ['↑↓', 'navigate'],
    ['space', 'select'],
  ];
  if (shortcuts.all) keys.push([shortcuts.all, 'all']);
  if (shortcuts.invert) keys.push([shortcuts.invert, 'invert']);
  keys.push(['⏎', 'submit']);
  return listFrame([prefix, message].filter(Boolean).join(' '), page, [
    description ? theme.style.description(description) : '',
    errorMsg ? theme.style.error(errorMsg) : '',
    theme.style.keysHelpTip(keys),
  ]);
});
