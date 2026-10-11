/**
 * `select` — one answer from a list, as `@inquirer/prompts` exports it.
 *
 * Graded by `@inquirer/select`'s own suite, `select.test.ts` and `pagination.test.ts`, which
 * render it through a headless terminal and assert the screen. So the frame is the
 * incumbent's to the character: the message line, the page, a blank line, the active
 * choice's description, an error, and the key hints, in that order, each only when present.
 *
 * Typing jumps. A digit selects the n-th choice; any other key searches the choice names by
 * prefix, unless vim keybindings are on, where `j` and `k` are movement. What was typed is
 * readline's own line buffer, cleared 700 ms after the last key, which is how "type `ba`
 * quickly" reaches "banana" and "type `b`, wait, type `a`" reaches "apple".
 */
import { styleText } from 'node:util';

import { HIDE_CURSOR } from 'closeout/cursor';

import { boundsOf, canMove, type Choice, isNavigable, isSelectable, type Item, keysHelpTip, type NormalizedChoice, normalizeChoices, nthChoice, step } from './inquirer-choices.js';
import { createPrompt, Separator, useKeypress, usePrefix } from './inquirer-core.js';
import { ValidationError } from './inquirer-errors.js';
import { type PromptReadline, useEffect, useMemo, useRef, useState } from './inquirer-hooks.js';
import { isBackspaceKey, isDownKey, isEnterKey, isNumberKey, isUpKey } from './inquirer-keys.js';
import { usePagination } from './inquirer-pagination.js';
import { makeTheme, type PartialDeep, POINTER, type Status, type Theme } from './inquirer-theme.js';

/** How long a typed jump is remembered before the next key starts a new one. */
const JUMP_RESET_MS = 700;

const DEFAULT_PAGE_SIZE = 7;

/** What `select` adds to the shared theme. */
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
  style: {
    disabled: (text: string) => styleText('dim', text),
    description: (text: string) => styleText('cyan', text),
    keysHelpTip,
  },
  i18n: { disabledError: 'This option is disabled and cannot be selected.' },
  indexMode: 'hidden',
};

/** `select`'s config, as the incumbent declares it. */
export interface SelectConfig<Value> {
  message: string;
  choices: readonly (Value | Choice<Value> | Separator)[];
  pageSize?: number;
  loop?: boolean;
  default?: NoInfer<Value>;
  theme?: PartialDeep<Theme & SelectTheme>;
}

export const select = createPrompt(<Value>(config: SelectConfig<Value>, done: (value: Value) => void) => {
  const { loop = true, pageSize = DEFAULT_PAGE_SIZE } = config;
  const theme = makeTheme<SelectTheme>(selectTheme, config.theme);
  const { keybindings } = theme;
  const [status, setStatus] = useState<Status>('idle');
  const prefix = usePrefix({ status, theme });
  const jumpReset = useRef<NodeJS.Timeout | undefined>(undefined);
  // `j` and `k` move under vim keybindings, so they cannot also be typed into a jump.
  const jumping = !keybindings.includes('vim');

  const items = useMemo(() => normalizeChoices(config.choices), [config.choices]);
  const bounds = useMemo(() => {
    const found = boundsOf(items, isNavigable);
    if (found.first === -1) throw new ValidationError('[select prompt] No selectable choices. All choices are disabled.');
    return found;
  }, [items]);
  const defaultIndex = useMemo(() => ('default' in config ? items.findIndex((item) => isSelectable(item) && item.value === config.default) : -1), [config.default, items]);

  const [active, setActive] = useState(defaultIndex === -1 ? bounds.first : defaultIndex);
  // `active` only ever holds a navigable index: it starts on one and every move lands on one.
  const chosen = items[active] as NormalizedChoice<Value>;
  const [errorMsg, setError] = useState<string>();

  /** Forget what was typed once the user has stopped typing, so the next key starts afresh. */
  const forgetJumpSoon = (rl: PromptReadline): void => {
    jumpReset.current = setTimeout(() => {
      rl.clearLine(0);
    }, JUMP_RESET_MS);
  };

  const submit = (): void => {
    if (chosen.disabled) {
      setError(theme.i18n.disabledError);
      return;
    }
    setStatus('done');
    done(chosen.value);
  };

  /** A digit: the n-th choice, counting choices only, when it can be answered. */
  const jumpToNumber = (rl: PromptReadline): void => {
    const position = nthChoice(items, Number(rl.line));
    if (isSelectable(items[position])) setActive(position);
    forgetJumpSoon(rl);
  };

  /** Anything else typed: the first answerable choice whose name starts with the line. */
  const jumpToName = (rl: PromptReadline): void => {
    const typed = rl.line.toLowerCase();
    const match = items.findIndex((item) => isSelectable(item) && item.name.toLowerCase().startsWith(typed));
    if (match !== -1) setActive(match);
    forgetJumpSoon(rl);
  };

  useKeypress((key, rl) => {
    clearTimeout(jumpReset.current);
    if (errorMsg) setError(undefined);
    const up = isUpKey(key, keybindings);
    if (isEnterKey(key)) submit();
    else if (up || isDownKey(key, keybindings)) {
      rl.clearLine(0);
      if (canMove(loop, up, active, bounds)) setActive(step(items, active, up ? -1 : 1, isNavigable));
    } else if (isNumberKey(key) && !Number.isNaN(Number(rl.line))) jumpToNumber(rl);
    else if (isBackspaceKey(key)) rl.clearLine(0);
    else if (jumping) jumpToName(rl);
  });

  useEffect(
    () => () => {
      clearTimeout(jumpReset.current);
    },
    [],
  );

  const message = theme.style.message(config.message, status);
  // Paged before the `done` frame returns, as upstream does: `usePagination` holds a hook slot,
  // and a render that skipped it would hand every later slot to the wrong hook.
  let separators = 0;
  const page = usePagination<Item<Value>>({
    items,
    active,
    renderItem({ item, isActive, index }) {
      if (Separator.isSeparator(item)) {
        separators++;
        return ` ${item.separator}`;
      }
      const label = theme.indexMode === 'number' ? `${index + 1 - separators}. ` : '';
      if (item.disabled) {
        const reason = typeof item.disabled === 'string' ? item.disabled : '(disabled)';
        return theme.style.disabled(`${isActive ? theme.icon.cursor : '-'} ${label}${item.name} ${reason}`);
      }
      const line = `${isActive ? theme.icon.cursor : ' '} ${label}${item.name}`;
      return isActive ? theme.style.highlight(line) : line;
    },
    pageSize,
    loop,
  });
  if (status === 'done') return [prefix, message, theme.style.answer(chosen.short)].filter(Boolean).join(' ');

  const helpLine = theme.style.keysHelpTip([
    ['↑↓', 'navigate'],
    ['⏎', 'select'],
  ]);
  const body = [[prefix, message].filter(Boolean).join(' '), page, ' ', chosen.description ? theme.style.description(chosen.description) : '', errorMsg ? theme.style.error(errorMsg) : '', helpLine]
    .filter(Boolean)
    .join('\n')
    .trimEnd();
  return `${body}${HIDE_CURSOR}`;
});
