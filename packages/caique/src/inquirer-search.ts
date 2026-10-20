/**
 * `search` — one answer from a list the caller computes from what the user types, as
 * `@inquirer/prompts` exports it.
 *
 * Graded by `@inquirer/search`'s own suite. Every change to the typed term calls `source`
 * again with an `AbortSignal`, and the call before it is aborted: an answer that arrives for
 * a term the user has already typed past is dropped, never drawn. The prompt reads `loading`
 * while a call is in flight, which is what holds the arrow keys still — moving through a list
 * that is about to be replaced would select something the user never saw.
 *
 * Tab completes the term to the active choice's name. Enter answers with the active choice,
 * after `validate`; a choice that fails validation and is not already what was typed becomes
 * the typed term instead, so the user sees exactly what they are answering with.
 */
import { styleText } from 'node:util';

import { type Choice, type Item, type NormalizedChoice } from './inquirer-choice.js';
import { alwaysValid, canMove, isSelectable, keysHelpTip, normalizeChoices, POINTER, step } from './inquirer-choices.js';
import { createPrompt, Separator, useKeypress, usePrefix } from './inquirer.js';
import { type PromptReadline, useEffect, useMemo, useRef, useState } from './inquirer-hooks.js';
import { isDownKey, isEnterKey, isTabKey, isUpKey } from './inquirer-keys.js';
import { usePagination } from './inquirer-pagination.js';
import { makeTheme, type PartialDeep, type Status, type Theme } from './inquirer-theme.js';

const DEFAULT_PAGE_SIZE = 7;

/** What `search` adds to the shared theme. */
export interface SearchTheme {
  icon: { cursor: string };
  style: {
    disabled: (text: string) => string;
    searchTerm: (text: string) => string;
    description: (text: string) => string;
    keysHelpTip: (keys: [key: string, action: string][]) => string | undefined;
  };
}

const searchTheme: SearchTheme = {
  icon: { cursor: POINTER },
  style: {
    disabled: (text: string) => styleText('dim', `- ${text}`),
    searchTerm: (text: string) => styleText('cyan', text),
    description: (text: string) => styleText('cyan', text),
    keysHelpTip,
  },
};

/** A `search` choice as a caller writes it: `select`'s, without `checkbox`'s fields. */
export type SearchChoice<Value> = Omit<Choice<Value>, 'checked' | 'checkedName'>;

/** `search`'s config, as the incumbent declares it. */
export interface SearchConfig<Value> {
  message: string;
  source: (term: string | undefined, opt: { signal: AbortSignal }) => readonly (Value | SearchChoice<Value> | Separator)[] | Promise<readonly (Value | SearchChoice<Value> | Separator)[]>;
  validate?: (value: Value) => boolean | string | Promise<string | boolean>;
  pageSize?: number;
  default?: NoInfer<Value>;
  initialValue?: string;
  theme?: PartialDeep<Theme & SearchTheme>;
}

export const search = createPrompt(<Value>(config: SearchConfig<Value>, done: (value: Value) => void) => {
  const { pageSize = DEFAULT_PAGE_SIZE, validate = alwaysValid } = config;
  const theme = makeTheme<SearchTheme>(searchTheme, config.theme);
  const [status, setStatus] = useState<Status>('loading');
  const [term, setTerm] = useState<string>(config.initialValue ?? '');
  const [results, setResults] = useState<readonly Item<Value>[]>([]);
  const [searchError, setSearchError] = useState<string>();
  // `default` places the cursor on the first result list only; later lists start at the top.
  const defaultApplied = useRef(false);
  const prefix = usePrefix({ status, theme });

  const bounds = useMemo(() => ({ first: results.findIndex(isSelectable), last: results.findLastIndex(isSelectable) }), [results]);
  const [active = bounds.first, setActive] = useState<number>();

  useEffect(
    (rl) => {
      // The term starts as `initialValue`; writing it puts it in readline's line, so typing edits it.
      rl.write(term);
    },
    // Stryker disable next-line ArrayDeclaration: any constant list runs the effect once, on the first render, which is all this asks of it
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setSearchError(undefined);
    const fetchResults = async (): Promise<void> => {
      const found = await config.source(term || undefined, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const normalized = normalizeChoices(found);
      let start: number | undefined;
      if (!defaultApplied.current && 'default' in config) {
        const at = normalized.findIndex((item) => isSelectable(item) && item.value === config.default);
        start = at === -1 ? undefined : at;
        defaultApplied.current = true;
      }
      setActive(start);
      setResults(normalized);
      setStatus('idle');
    };
    // A failed search is shown as the error of the term it was for; an aborted one, never.
    fetchResults().catch((error: unknown) => {
      if (!controller.signal.aborted && error instanceof Error) setSearchError(error.message);
    });
    return () => {
      controller.abort();
    };
  }, [term]);

  // The cursor never rests on a separator, so whatever it points at is a choice or nothing.
  const chosen = results[active] as NormalizedChoice<Value> | undefined;

  /** Enter on a choice: validate it; a refused choice not already typed becomes the term. */
  const submit = async (rl: PromptReadline, answer: NormalizedChoice<Value>): Promise<void> => {
    setStatus('loading');
    const verdict = await validate(answer.value);
    setStatus('idle');
    if (verdict === true) {
      setStatus('done');
      done(answer.value);
    } else if (answer.name === term) setSearchError(verdict || 'You must provide a valid value');
    else {
      rl.write(answer.name);
      setTerm(answer.name);
    }
  };

  /** An arrow, once the results are in: the next answerable choice, stopping at either end. */
  const move = (rl: PromptReadline, up: boolean): void => {
    rl.clearLine(0);
    if (canMove(false, up, active, bounds)) setActive(step(results, active, up ? -1 : 1, isSelectable));
  };

  useKeypress(async (key, rl) => {
    if (isEnterKey(key)) {
      // readline cleared the line on Enter; with nothing to answer, the term goes back.
      if (chosen && status === 'idle') await submit(rl, chosen);
      else rl.write(term);
    } else if (isTabKey(key) && chosen) {
      rl.clearLine(0);
      rl.write(chosen.name);
      setTerm(chosen.name);
    } else if (status !== 'loading' && (isUpKey(key) || isDownKey(key))) move(rl, isUpKey(key));
    else setTerm(rl.line);
  });

  const message = theme.style.message(config.message, status);
  const page = usePagination<Item<Value>>({
    items: results,
    active,
    renderItem({ item, isActive }) {
      if (Separator.isSeparator(item)) return ` ${item.separator}`;
      if (item.disabled) return theme.style.disabled(`${item.name} ${typeof item.disabled === 'string' ? item.disabled : '(disabled)'}`);
      const line = `${isActive ? theme.icon.cursor : ' '} ${item.name}`;
      return isActive ? theme.style.highlight(line) : line;
    },
    pageSize,
    loop: false,
  });

  if (status === 'done' && chosen) return [prefix, message, theme.style.answer(chosen.short)].filter(Boolean).join(' ').trimEnd();

  let error: string | undefined;
  if (searchError) error = theme.style.error(searchError);
  else if (results.length === 0 && term !== '' && status === 'idle') error = theme.style.error('No results found');

  const helpLine = theme.style.keysHelpTip([
    ['↑↓', 'navigate'],
    ['⏎', 'select'],
  ]);
  const header = [prefix, message, theme.style.searchTerm(term)].filter(Boolean).join(' ').trimEnd();
  const body = [error ?? page, ' ', chosen?.description ? theme.style.description(chosen.description) : '', helpLine].filter(Boolean).join('\n').trimEnd();
  return [header, body];
});
