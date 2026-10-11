/**
 * `checkbox` — any number of answers from a list, as `@inquirer/prompts` exports it.
 *
 * Graded by `@inquirer/checkbox`'s own suite, which renders it through a headless terminal
 * and asserts the screen. Space toggles the active choice, `a` toggles all of them and `i`
 * inverts the selection (both renameable, or switched off, through `shortcuts`), and a digit
 * moves to the n-th choice and toggles it.
 *
 * Its answer is checked twice on Enter, in the incumbent's order: `validate` first, awaited,
 * and then `required` — so a `validate` that returns `true` still cannot submit an empty
 * selection when one is required, and a `validate` with side effects runs either way.
 */
import { styleText } from 'node:util';

import { HIDE_CURSOR } from 'closeout/cursor';

import { alwaysValid, boundsOf, canMove, type Choice, isChoiceObject, isNavigable, keysHelpTip, nthChoice, step } from './inquirer-choices.js';
import { createPrompt, Separator, useKeypress, usePrefix } from './inquirer-core.js';
import { ValidationError } from './inquirer-errors.js';
import { useMemo, useState } from './inquirer-hooks.js';
import { isDownKey, isEnterKey, isNumberKey, isSpaceKey, isUpKey } from './inquirer-keys.js';
import { usePagination } from './inquirer-pagination.js';
import { CIRCLE, CIRCLE_DOUBLE, CIRCLE_FILLED, makeTheme, type PartialDeep, POINTER, type Status, type Theme } from './inquirer-theme.js';

const DEFAULT_PAGE_SIZE = 7;

/** A checkbox choice as a caller writes it: a `select` choice, plus its checked state. */
export interface CheckboxChoice<Value> extends Choice<Value> {
  checkedName?: string;
  checked?: boolean;
}

/** A checkbox choice with every field filled in. */
export interface CheckboxNormalizedChoice<Value> {
  value: Value;
  name: string;
  checkedName: string;
  description?: string;
  short: string;
  disabled: boolean | string;
  checked: boolean;
}

type Row<Value> = CheckboxNormalizedChoice<Value> | Separator;

/** What `checkbox` adds to the shared theme. */
export interface CheckboxTheme {
  icon: { checked: string; unchecked: string; cursor: string; disabledChecked: string; disabledUnchecked: string };
  style: {
    disabled: (text: string) => string;
    renderSelectedChoices: <Value>(selected: readonly CheckboxNormalizedChoice<Value>[], all: readonly Row<Value>[]) => string;
    description: (text: string) => string;
    keysHelpTip: (keys: [key: string, action: string][]) => string | undefined;
  };
  i18n: { disabledError: string };
}

const checkboxTheme: CheckboxTheme = {
  icon: {
    checked: styleText('green', CIRCLE_FILLED),
    unchecked: CIRCLE,
    cursor: POINTER,
    disabledChecked: styleText('green', CIRCLE_DOUBLE),
    disabledUnchecked: '-',
  },
  style: {
    disabled: (text: string) => styleText('dim', text),
    renderSelectedChoices: (selected) => selected.map((choice) => choice.short).join(', '),
    description: (text: string) => styleText('cyan', text),
    keysHelpTip,
  },
  i18n: { disabledError: 'This option is disabled and cannot be toggled.' },
};

/** `checkbox`'s config, as the incumbent declares it. */
export interface CheckboxConfig<Value> {
  message: string;
  prefix?: string;
  pageSize?: number;
  choices: readonly (Value | CheckboxChoice<Value> | Separator)[];
  loop?: boolean;
  required?: boolean;
  validate?: (choices: readonly CheckboxNormalizedChoice<Value>[]) => boolean | string | Promise<string | boolean>;
  theme?: PartialDeep<Theme & CheckboxTheme>;
  /** The keys that check every choice and invert the selection; `null` switches one off. */
  shortcuts?: { all?: string | null; invert?: string | null };
}

const isChecked = <Value>(item: Row<Value> | undefined): item is CheckboxNormalizedChoice<Value> => item !== undefined && !Separator.isSeparator(item) && item.checked;

/** A choice the user can toggle: not a separator, not disabled. */
const canToggle = <Value>(item: Row<Value> | undefined): item is CheckboxNormalizedChoice<Value> => item !== undefined && !Separator.isSeparator(item) && !item.disabled;

/** The row with its check set to `checked`, when it can be toggled at all. */
const setCheck = <Value>(item: Row<Value>, checked: boolean): Row<Value> => (canToggle(item) ? { ...item, checked } : item);

/** The row with its check flipped, when it can be toggled at all. */
const toggle = <Value>(item: Row<Value>): Row<Value> => setCheck(item, !isChecked(item));

function normalize<Value>(choices: readonly (Value | CheckboxChoice<Value> | Separator)[]): Row<Value>[] {
  return choices.map((choice) => {
    if (Separator.isSeparator(choice)) return choice;
    if (!isChoiceObject<Value>(choice)) {
      const name = String(choice);
      return { value: choice as Value, name, short: name, checkedName: name, disabled: false, checked: false };
    }
    const { checkedName, checked } = choice as CheckboxChoice<Value>;
    const name = choice.name ?? String(choice.value);
    const normalized: CheckboxNormalizedChoice<Value> = { value: choice.value, name, short: choice.short ?? name, checkedName: checkedName ?? name, disabled: choice.disabled ?? false, checked: checked ?? false };
    if (choice.description) normalized.description = choice.description;
    return normalized;
  });
}

export const checkbox = createPrompt(<Value>(config: CheckboxConfig<Value>, done: (value: Value[]) => void) => {
  const { pageSize = DEFAULT_PAGE_SIZE, loop = true, required, validate = alwaysValid } = config;
  const shortcuts = { all: 'a', invert: 'i', ...config.shortcuts };
  const theme = makeTheme<CheckboxTheme>(checkboxTheme, config.theme);
  const { keybindings } = theme;
  const [status, setStatus] = useState<Status>('idle');
  const prefix = usePrefix({ status, theme });
  const [items, setItems] = useState<readonly Row<Value>[]>(normalize(config.choices));

  const bounds = useMemo(() => {
    const found = boundsOf(items, isNavigable);
    if (found.first === -1) throw new ValidationError('[checkbox prompt] No selectable choices. All choices are disabled.');
    return found;
  }, [items]);

  const [active, setActive] = useState(bounds.first);
  const [errorMsg, setError] = useState<string>();

  /** Every row, with the one at `position` toggled. */
  const toggledAt = (position: number): Row<Value>[] => items.map((item, i) => (i === position ? toggle(item) : item));

  /** Enter: `validate` first, awaited, then `required` — the incumbent's order. */
  const submit = async (): Promise<void> => {
    const selection = items.filter(isChecked);
    const verdict = await validate([...selection]);
    if (required && selection.length === 0) setError('At least one choice must be selected');
    else if (verdict === true) {
      setStatus('done');
      done(selection.map((choice) => choice.value));
    } else setError(verdict || 'You must select a valid value');
  };

  /** Space: toggle the active choice, or say why it cannot be. */
  const toggleActive = (): void => {
    // `active` only ever holds a navigable index: it starts on one and every move lands on one.
    const current = items[active] as CheckboxNormalizedChoice<Value>;
    if (current.disabled) {
      setError(theme.i18n.disabledError);
      return;
    }
    setError(undefined);
    setItems(toggledAt(active));
  };

  /** A number key: move to the n-th choice and toggle it, when it can be toggled. */
  const toggleNth = (n: number): void => {
    const position = nthChoice(items, n);
    if (!canToggle(items[position])) return;
    setActive(position);
    setItems(toggledAt(position));
  };

  useKeypress(async (key) => {
    const up = isUpKey(key, keybindings);
    if (isEnterKey(key)) await submit();
    else if (up || isDownKey(key, keybindings)) {
      if (errorMsg) setError(undefined);
      if (canMove(loop, up, active, bounds)) setActive(step(items, active, up ? -1 : 1, isNavigable));
    } else if (isSpaceKey(key)) toggleActive();
    else if (key.name === shortcuts.all) {
      // Check everything, unless everything already is: then uncheck everything.
      const checkAll = items.some((item) => canToggle(item) && !item.checked);
      setItems(items.map((item) => setCheck(item, checkAll)));
    } else if (key.name === shortcuts.invert) setItems(items.map(toggle));
    else if (isNumberKey(key)) toggleNth(Number(key.name));
  });

  const message = theme.style.message(config.message, status);

  let description: string | undefined;
  const page = usePagination<Row<Value>>({
    items,
    active,
    renderItem({ item, isActive }) {
      if (Separator.isSeparator(item)) return ` ${item.separator}`;
      const cursor = isActive ? theme.icon.cursor : ' ';
      if (item.disabled) {
        const reason = typeof item.disabled === 'string' ? item.disabled : '(disabled)';
        const box = item.checked ? theme.icon.disabledChecked : theme.icon.disabledUnchecked;
        return theme.style.disabled(`${cursor}${box} ${item.name} ${reason}`);
      }
      if (isActive) description = item.description;
      const line = `${cursor}${item.checked ? theme.icon.checked : theme.icon.unchecked} ${item.checked ? item.checkedName : item.name}`;
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

  const body = [[prefix, message].filter(Boolean).join(' '), page, ' ', description ? theme.style.description(description) : '', errorMsg ? theme.style.error(errorMsg) : '', theme.style.keysHelpTip(keys)]
    .filter(Boolean)
    .join('\n')
    .trimEnd();
  return `${body}${HIDE_CURSOR}`;
});
