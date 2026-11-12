/**
 * `@inquirer/prompts`' `select`: one choice from a list, by arrow keys, by number or by typing
 * the start of its name. Graded by `select`'s own two suites in the `inquirer-prompts` host.
 */
import { styleText } from 'node:util';

import { type Choice } from './inquirer-choice.js';
import {
  boundsOf,
  isSelectable,
  keysHelpTip,
  listFrame,
  moveCursor,
  normalizeChoices,
  nthChoice,
  POINTER,
} from './inquirer-choices.js';
import { useMemo, useRef, useState } from './inquirer-hooks.js';
import { isBackspaceKey, isEnterKey, isNumberKey } from './inquirer-keys.js';
import { usePagination } from './inquirer-pagination.js';
import { makeTheme, type PartialTheme, type Status } from './inquirer-theme.js';
import { createPrompt, Separator, useEffect, useKeypress, usePrefix } from './inquirer.js';

/** How long a typed search or number is remembered before the next key starts a new one. */
const SEARCH_RESET_MS = 700;

/** What `select` adds to the core theme. */
export interface SelectTheme {
  icon: { cursor: string };
  style: {
    disabled: (text: string) => string;
    description: (text: string) => string;
    keysHelpTip: (keys: [key: string, action: string][]) => string | undefined;
  };
  i18n: { disabledError: string };
  indexMode: 'hidden' | 'number';
}

const selectTheme: SelectTheme = {
  icon: { cursor: POINTER },
  style: { disabled: (text) => styleText('dim', text), description: (text) => styleText('cyan', text), keysHelpTip },
  i18n: { disabledError: 'This option is disabled and cannot be selected.' },
  // Stryker disable next-line StringLiteral: every mode but `number` draws no index
  indexMode: 'hidden',
};

/** `select`'s configuration, as `@inquirer/select` declares it. */
export interface SelectConfig<Value> {
  message: string;
  choices: readonly (Value | Omit<Choice<Value>, 'checked' | 'checkedName'> | Separator)[];
  pageSize?: number;
  loop?: boolean;
  default?: NoInfer<Value>;
  theme?: PartialTheme<SelectTheme>;
}

/** Ask for one of `choices`. */
export const select = createPrompt(<Value>(config: SelectConfig<Value>, done: (value: Value) => void) => {
  const { loop = true, pageSize = 7 } = config;
  const theme = makeTheme<SelectTheme>(selectTheme, config.theme);
  const { keybindings } = theme;
  const [status, setStatus] = useState<Status>('idle');
  const prefix = usePrefix({ status, theme });
  const searchTimeout = useRef<NodeJS.Timeout>();
  // Vim's j and k would be typed into the search, so vim keybindings turn it off.
  const searchEnabled = !keybindings.includes('vim');

  // Stryker disable next-line ArrayDeclaration: the config a prompt is called with does not change while it runs, so the memo never has to be recomputed
  const items = useMemo(() => normalizeChoices(config.choices), [config.choices]);
  // Stryker disable next-line ArrayDeclaration: the config a prompt is called with does not change while it runs, so the memo never has to be recomputed
  const bounds = useMemo(() => boundsOf(items, 'select'), [items]);
  // Stryker disable next-line ArrayDeclaration: the config a prompt is called with does not change while it runs, so the memo never has to be recomputed
  const defaultIndex = useMemo(() => ('default' in config ? items.findIndex((item) => isSelectable(item) && item.value === config.default) : -1), [config.default, items]);
  const [active, setActive] = useState(defaultIndex === -1 ? bounds.first : defaultIndex);
  // `bounds` guarantees a navigable row, and every move lands on one.
  const selected = items[active] as Exclude<(typeof items)[number], Separator>;
  const [errorMsg, setError] = useState<string>();

  useKeypress((key, rl) => {
    clearTimeout(searchTimeout.current);
    // Stryker disable next-line ConditionalExpression: clearing an error that is not there changes nothing drawn
    if (errorMsg) setError(undefined);
    const clearSoon = (): void => {
      searchTimeout.current = setTimeout(() => {
        // Stryker disable next-line NumericLiteral: readline's `Interface#clearLine()` takes no argument; the 0 is `@inquirer/core`'s call shape
        rl.clearLine(0);
      }, SEARCH_RESET_MS);
    };
    const moved = moveCursor(key, keybindings, { items, active, loop, bounds });

    if (isEnterKey(key)) {
      if (selected.disabled) setError(theme.i18n.disabledError);
      else {
        setStatus('done');
        done(selected.value);
      }
    } else if (moved !== undefined) {
      // Stryker disable next-line NumericLiteral: readline's `Interface#clearLine()` takes no argument; the 0 is `@inquirer/core`'s call shape
      rl.clearLine(0);
      setActive(moved);
    } else if (isNumberKey(key) && !Number.isNaN(Number(rl.line))) {
      const position = nthChoice(items, Number(rl.line));
      if (isSelectable(items[position])) setActive(position);
      clearSoon();
    } else if (isBackspaceKey(key)) {
      // Stryker disable next-line NumericLiteral: readline's `Interface#clearLine()` takes no argument; the 0 is `@inquirer/core`'s call shape
      rl.clearLine(0);
    } else if (searchEnabled) {
      const term = rl.line.toLowerCase();
      const match = items.findIndex((item) => isSelectable(item) && item.name.toLowerCase().startsWith(term));
      if (match !== -1) setActive(match);
      clearSoon();
    }
  });

  useEffect(
    () => () => {
      clearTimeout(searchTimeout.current);
    },
    // Stryker disable next-line ArrayDeclaration: a list of constants never changes either, so the cleanup still runs once, on the way out
    [],
  );

  const message = theme.style.message(config.message, status);
  let separatorCount = 0;
  const page = usePagination({
    items,
    active,
    renderItem({ item, isActive, index }) {
      if (Separator.isSeparator(item)) {
        separatorCount++;
        return ` ${item.separator}`;
      }
      const indexLabel = theme.indexMode === 'number' ? `${index + 1 - separatorCount}. ` : '';
      if (item.disabled) {
        const label = typeof item.disabled === 'string' ? item.disabled : '(disabled)';
        return theme.style.disabled(`${isActive ? theme.icon.cursor : '-'} ${indexLabel}${item.name} ${label}`);
      }
      const line = `${isActive ? theme.icon.cursor : ' '} ${indexLabel}${item.name}`;
      return isActive ? theme.style.highlight(line) : line;
    },
    pageSize,
    loop,
  });

  if (status === 'done') return [prefix, message, theme.style.answer(selected.short)].filter(Boolean).join(' ');

  return listFrame([prefix, message].filter(Boolean).join(' '), page, [
    selected.description ? theme.style.description(selected.description) : '',
    errorMsg ? theme.style.error(errorMsg) : '',
    theme.style.keysHelpTip([
      ['↑↓', 'navigate'],
      ['⏎', 'select'],
    ]),
  ]);
});
