/**
 * `expand` and `rawlist` — the two prompts answered by typing a choice's key, as
 * `@inquirer/prompts` exports them.
 *
 * Each is graded by its own package's suite. They share one idea, which is why they share a
 * file: every choice has a key, the user types it into readline's line, and Enter answers
 * with the choice whose key it is. `rawlist` numbers its choices `1`, `2`, `3` unless a choice
 * names its own key, and lets the arrow keys walk the list too. `expand` collapses to one
 * line of letters, `(Yadxh)`, and expands to the full list on `h` — or from the start, with
 * `expanded: true`.
 */
import { styleText } from 'node:util';

import { canMove, step } from './inquirer-choices.js';
import { createPrompt, Separator, useKeypress, usePrefix } from './inquirer.js';
import { ValidationError } from './inquirer-errors.js';
import { useMemo, useState } from './inquirer-hooks.js';
import { isDownKey, isEnterKey, isUpKey } from './inquirer-keys.js';
import { makeTheme, type PartialDeep, type Status, type Theme } from './inquirer-theme.js';

/** `parseInt`'s radix. */
const DECIMAL = 10;

/** The answer a key that names no choice gets, with what was typed shown in red. */
const notAnOption = (typed: string): string => `"${styleText('red', typed)}" isn't an available option`;

/** The keys `expand` accepts: a letter or a digit, `h` aside, because `h` is help. */
export type ExpandKey = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'i' | 'j' | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

/** An `expand` choice: a key, and a value, a name, or both. */
export type ExpandChoice<Value> = { key: ExpandKey; value: Value } | { key: ExpandKey; name: string; value: Value };

/** `expand`'s config, as the incumbent declares it. */
export interface ExpandConfig<Value> {
  message: string;
  choices: readonly (Separator | { key: ExpandKey; name: Value & string; value?: never } | ExpandChoice<Value>)[];
  default?: ExpandKey | 'h';
  expanded?: boolean;
  theme?: PartialDeep<Theme>;
}

interface Keyed<Value> {
  value: Value;
  name: string;
  key: string;
}

/** The help row `expand` adds while collapsed. */
const HELP: Keyed<undefined> = { key: 'h', name: 'Help, list all options', value: undefined };

/** One row of an expanded list: `  y) Overwrite`, or the separator indented by one. */
const listRow = (row: Separator | Keyed<unknown>, highlighted: boolean, highlight: (text: string) => string): string => {
  if (Separator.isSeparator(row)) return ` ${row.separator}`;
  const line = `  ${row.key}) ${row.name}`;
  return highlighted ? highlight(line) : line;
};

/** The collapsed hint's letter for a row: nothing for a separator, the default's in capitals. */
const letterOf = (row: Separator | Keyed<unknown>, defaultKey: string): string => {
  if (Separator.isSeparator(row)) return '';
  return row.key === defaultKey ? row.key.toUpperCase() : row.key;
};

/** The choice a key names, if any. */
const keyed = <Value>(choices: readonly (Separator | Keyed<Value>)[], key: string): Keyed<Value> | undefined =>
  choices.find((choice): choice is Keyed<Value> => !Separator.isSeparator(choice) && choice.key === key);

export const expand = createPrompt(<Value>(config: ExpandConfig<Value>, done: (value: Value) => void) => {
  const { default: defaultKey = 'h' } = config;
  const choices = useMemo(
    () =>
      config.choices.map((choice): Separator | Keyed<Value> => {
        if (Separator.isSeparator(choice)) return choice;
        const name: string = 'name' in choice ? choice.name : String(choice.value);
        return { value: ('value' in choice ? choice.value : name) as Value, name, key: choice.key };
      }),
    [config.choices],
  );
  const [status, setStatus] = useState<Status>('idle');
  const [value, setValue] = useState<string>('');
  const [expanded, setExpanded] = useState<boolean>(config.expanded ?? false);
  const [errorMsg, setError] = useState<string>();
  const theme = makeTheme(config.theme);
  const prefix = usePrefix({ theme, status });

  useKeypress((event, rl) => {
    if (!isEnterKey(event)) {
      setValue(rl.line);
      setError(undefined);
      return;
    }
    const answer = (value.trim() || defaultKey).toLowerCase();
    if (answer === 'h' && !expanded) {
      setExpanded(true);
      return;
    }
    const chosen = keyed(choices, answer);
    if (chosen) {
      setStatus('done');
      // The default may have answered, and the done frame reads the key from here.
      setValue(answer);
      done(chosen.value);
    } else setError(value === '' ? 'Please input a value' : notAnOption(value));
  });

  const message = theme.style.message(config.message, status);
  // `done` is reached only through a key that named a choice, and that key is the value now.
  if (status === 'done') return `${prefix} ${message} ${theme.style.answer((keyed(choices, value.toLowerCase()) as Keyed<Value>).name)}`;

  const typed = value.trim().toLowerCase();
  const rows: readonly (Separator | Keyed<Value | undefined>)[] = expanded ? choices : [...choices, HELP];
  const letters = expanded ? '' : ` ${theme.style.defaultAnswer(rows.map((row) => letterOf(row, defaultKey)).join(''))}`;
  const list = expanded ? rows.map((row) => listRow(row, !Separator.isSeparator(row) && row.key === typed, theme.style.highlight)).join('\n') : '';
  const current = keyed(choices, typed);
  const tip = current ? `${styleText('cyan', '>>')} ${current.name}` : '';
  return [`${prefix} ${message}${letters} ${value}`, [list, tip, errorMsg ? theme.style.error(errorMsg) : ''].filter(Boolean).join('\n')];
});

/** A `rawlist` choice as a caller writes it. */
export interface RawlistChoice<Value> {
  value: Value;
  name?: string;
  short?: string;
  key?: string;
  description?: string;
}

interface RawlistRow<Value> extends Keyed<Value> {
  short: string;
  description?: string | undefined;
}

/** What `rawlist` adds to the shared theme. */
export interface RawlistTheme {
  style: { description: (text: string) => string };
}

/** `rawlist`'s config, as the incumbent declares it. */
export interface RawlistConfig<Value> {
  message: string;
  choices: readonly (Value | RawlistChoice<Value> | Separator)[];
  loop?: boolean;
  theme?: PartialDeep<Theme & RawlistTheme>;
  default?: NoInfer<Value>;
}

/** Whether `choice` was written as an object with a `value`, rather than as the value itself. */
const isChoiceObject = (choice: unknown): choice is { value: unknown } => typeof choice === 'object' && choice !== null && 'value' in choice;

const isRow = <Value>(row: Separator | RawlistRow<Value> | undefined): row is RawlistRow<Value> => row !== undefined && !Separator.isSeparator(row);

/**
 * The choice `typed` picks and where it is: a choice's own key first (as typed, then trimmed),
 * then a 1-based position among the choices when it holds a digit.
 */
function picked<Value>(typed: string, rows: readonly (Separator | RawlistRow<Value>)[]): RawlistRow<Value> | undefined {
  const choices = rows.filter(isRow);
  const trimmed = typed.trim();
  const byKey = choices.find((row) => row.key === typed || row.key === trimmed);
  if (byKey !== undefined || !/\d/u.test(typed)) return byKey;
  return choices[Number.parseInt(typed, DECIMAL) - 1];
}

export const rawlist = createPrompt(<Value>(config: RawlistConfig<Value>, done: (value: Value) => void) => {
  const { loop = true } = config;
  const rows = useMemo(() => {
    let position = 0;
    return config.choices.map((choice): Separator | RawlistRow<Value> => {
      if (Separator.isSeparator(choice)) return choice;
      position += 1;
      if (!isChoiceObject(choice)) {
        const name = String(choice);
        return { value: choice as Value, name, short: name, key: String(position) };
      }
      const { name = String(choice.value), short, key, description } = choice as RawlistChoice<Value>;
      return { value: choice.value, name, short: short ?? name, key: key ?? String(position), description };
    });
  }, [config.choices]);
  const [status, setStatus] = useState<Status>('idle');
  const [value, setValue] = useState<string>(() => (config.default == null ? '' : (rows.find((row): row is RawlistRow<Value> => isRow(row) && row.value === config.default)?.key ?? '')));
  const [errorMsg, setError] = useState<string>();
  const theme = makeTheme<RawlistTheme>({ style: { description: (text: string) => styleText('cyan', text) } }, config.theme);
  const { keybindings } = theme;
  const prefix = usePrefix({ status, theme });

  const bounds = useMemo(() => {
    const first = rows.findIndex(isRow);
    // `[select prompt]`, and not `[rawlist prompt]`: the incumbent's message, copied from select's.
    if (first === -1) throw new ValidationError('[select prompt] No selectable choices. All choices are disabled.');
    return { first, last: rows.findLastIndex(isRow) };
  }, [rows]);

  const submit = (): void => {
    const chosen = picked(value, rows);
    if (chosen === undefined) {
      setError(value === '' ? 'Please input a value' : notAnOption(value));
      return;
    }
    setValue(chosen.short);
    setStatus('done');
    done(chosen.value);
  };

  /** An arrow: the next choice's key into the line, or the first (last) one when none is picked. */
  const move = (up: boolean): void => {
    const chosen = picked(value, rows);
    if (chosen === undefined) {
      const start = up ? rows.findLast(isRow) : rows.find(isRow);
      setValue((start as RawlistRow<Value>).key);
      return;
    }
    const at = rows.indexOf(chosen);
    if (canMove(loop, up, at, bounds)) setValue((rows[step(rows, at, up ? -1 : 1, isRow)] as RawlistRow<Value>).key);
  };

  useKeypress((key, rl) => {
    const up = isUpKey(key, keybindings);
    if (isEnterKey(key)) submit();
    else if (up || isDownKey(key, keybindings)) {
      rl.clearLine(0);
      move(up);
    } else {
      setValue(rl.line);
      setError(undefined);
    }
  });

  const message = theme.style.message(config.message, status);
  if (status === 'done') return `${prefix} ${message} ${theme.style.answer(value)}`;

  const chosen = picked(value, rows);
  const list = rows.map((row) => listRow(row, chosen !== undefined && !Separator.isSeparator(row) && row.key === chosen.key, theme.style.highlight)).join('\n');
  const description = !errorMsg && chosen?.description ? theme.style.description(chosen.description) : '';
  return [`${prefix} ${message} ${value}`, [list, errorMsg ? theme.style.error(errorMsg) : '', description].filter(Boolean).join('\n')];
});
