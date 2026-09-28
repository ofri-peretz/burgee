/**
 * clack's typed and listed prompts, each one a {@link Definition} run by `clack-core.ts`'s
 * loop: how its keys change its state, and how that state is drawn. The searchable three are
 * in `clack-search.ts` and `date` is in `clack-date.ts`.
 *
 * **The keys and the answers are clack's; the frames are clack's shape and not its bytes.**
 * Every prompt draws the guide, the state glyph, a body behind a bar in the state's colour and
 * a dimmed summary once answered, and `withGuide: false` removes every bar — that much is
 * graded, by `guide.test.ts`. Frame-for-frame agreement is what the seventeen snapshot files
 * of clack's suite would grade, and they are subtracted from the row by D-001: matching them
 * would be copying clack's renderer, not offering its API.
 */
import { type CommonOptions, frame, MULTISELECT_INSTRUCTIONS, type Option, paint, placeholderOf, type Prompt, run, S_CHECKBOX_INACTIVE, S_CHECKBOX_SELECTED, S_PASSWORD_MASK, S_RADIO_ACTIVE, S_RADIO_INACTIVE, SELECT_INSTRUCTIONS, type State, type Validate, withCursor } from './clack-core.js';
import { boxLook, checkbox, type Choice, findCursor, footerOf, labelOf, radio, radioLook, requiredCheck, stepOf, summaryOf, toggled, windowOf, wrapIndex } from './clack-list.js';

export type Answer<T> = Promise<T | symbol>;

export interface TextOptions extends CommonOptions {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
  validate?: Validate<string>;
}

export interface MultiLineOptions extends TextOptions {
  /** Draw a `[ submit ]` button, reached with tab, instead of submitting on a second enter. */
  showSubmit?: boolean;
}

export interface PasswordOptions extends CommonOptions {
  message: string;
  mask?: string;
  validate?: Validate<string>;
  clearOnError?: boolean;
}

export interface ConfirmOptions extends CommonOptions {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
  vertical?: boolean;
}

export interface SelectOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValue?: Value;
  maxItems?: number;
  showInstructions?: boolean;
}

export interface SelectKeyOptions<Value extends string> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValue?: Value;
  caseSensitive?: boolean;
}

export interface MultiSelectOptions<Value> extends CommonOptions {
  message: string;
  options: Option<Value>[];
  initialValues?: Value[];
  maxItems?: number;
  required?: boolean;
  cursorAt?: Value;
  showInstructions?: boolean;
}

export interface GroupMultiSelectOptions<Value> extends CommonOptions {
  message: string;
  options: Record<string, Option<Value>[]>;
  initialValues?: Value[];
  maxItems?: number;
  required?: boolean;
  cursorAt?: Value;
  selectableGroups?: boolean;
  groupSpacing?: number;
  showInstructions?: boolean;
}

/** What a typed prompt's value is: exactly what has been typed. */
const mirror = (prompt: Prompt<string>): void => {
  prompt.value = prompt.userInput;
};

/** An empty answer becomes the default, or the empty string — never `undefined`. */
const defaulted =
  (fallback: string | undefined) =>
  (prompt: Prompt<string>): void => {
    if (prompt.value === undefined || prompt.value === '') prompt.value = fallback ?? '';
  };

/** `text` — one line of typing, with a placeholder, a default and a validator. */
export const text = (opts: TextOptions): Answer<string> =>
  run<string>({
    ...opts,
    initialValue: undefined,
    track: true,
    initialUserInput: opts.initialValue,
    onInput: mirror,
    finalize: defaulted(opts.defaultValue),
    render: (prompt) => {
      const typed = prompt.userInput === '' ? placeholderOf(opts.placeholder) : withCursor(prompt.userInput, prompt.cursor);
      return frame(opts, prompt.state, opts.message, { body: [typed], summary: prompt.value ?? '', error: prompt.error });
    },
  });

/** `password` — typing that is drawn as a mask and never echoed. */
export const password = (opts: PasswordOptions): Answer<string> => {
  const mask = opts.mask ?? S_PASSWORD_MASK;
  return run<string>({
    ...opts,
    track: true,
    onInput: mirror,
    finalize: defaulted(undefined),
    render: (prompt) => {
      const masked = mask.repeat(prompt.userInput.length);
      if (prompt.state === 'error' && opts.clearOnError === true) {
        prompt.userInput = '';
        prompt.cursor = 0;
        prompt.value = '';
      }
      const typed = prompt.cursor >= masked.length ? `${masked}${paint(['inverse', 'hidden'], '_')}` : withCursor(masked, prompt.cursor);
      return frame(opts, prompt.state, opts.message, { body: [typed], summary: masked, error: prompt.error });
    },
  });
};

/** One side of a confirm: filled and bright when it is the answer, hollow and dim when not. */
const side = (on: boolean, label: string): string => (on ? `${paint('green', S_RADIO_ACTIVE)} ${label}` : `${paint('dim', S_RADIO_INACTIVE)} ${paint('dim', label)}`);

/** `confirm` — yes or no: arrows toggle, `y` and `n` answer at once. */
export const confirm = (opts: ConfirmOptions): Answer<boolean> => {
  const active = opts.active ?? 'Yes';
  const inactive = opts.inactive ?? 'No';
  return run<boolean>({
    ...opts,
    initialValue: opts.initialValue ?? true,
    onKey: (prompt, char, _key, action) => {
      if (stepOf(action) !== 0) prompt.value = prompt.value !== true;
      const letter = char?.toLowerCase();
      if (letter !== 'y' && letter !== 'n') return;
      prompt.value = letter === 'y';
      prompt.state = 'submit';
    },
    render: (prompt) => {
      const yes = prompt.value === true;
      const body = opts.vertical === true ? [side(yes, active), side(!yes, inactive)] : [`${side(yes, active)} ${paint('dim', '/')} ${side(!yes, inactive)}`];
      return frame(opts, prompt.state, opts.message, { body, summary: yes ? active : inactive });
    },
  });
};

/** The first enabled option at or after `index`. */
const enabledFrom = (index: number, options: readonly Choice[]): number => (options[index]?.disabled === true ? findCursor(index, 1, options) : index);

/** `select` — one option from a list, drawn through `limitOptions`. */
export const select = <Value>(opts: SelectOptions<Value>): Answer<Value> => {
  const { options } = opts;
  let cursor = enabledFrom(
    Math.max(
      options.findIndex((option) => option.value === opts.initialValue),
      0,
    ),
    options,
  );
  return run<Value>({
    ...opts,
    initialValue: options[cursor]?.value,
    onKey: (prompt, _char, _key, action) => {
      const step = stepOf(action);
      if (step === 0) return;
      cursor = findCursor(cursor, step, options);
      prompt.value = options[cursor]?.value;
    },
    render: (prompt) => {
      const footer = footerOf(opts, SELECT_INSTRUCTIONS);
      const body = windowOf({ opts, options, cursor, style: (option, on) => radio(option, radioLook(option, on)), footer: footer?.length ?? 1 });
      const chosen = options[cursor];
      return frame(opts, prompt.state, opts.message, { body, summary: chosen === undefined ? '' : labelOf(chosen), footer });
    },
  });
};

/** The key a `selectKey` option answers to: the first character of its value. */
const keyFor = (value: string, caseSensitive: boolean): string => (caseSensitive ? value.slice(0, 1) : value.slice(0, 1).toLowerCase());

/** `selectKey` — one option, chosen by pressing the first letter of its value. */
export const selectKey = <Value extends string>(opts: SelectKeyOptions<Value>): Answer<Value> => {
  const caseSensitive = opts.caseSensitive === true;
  const values = opts.options.map((option) => option.value as Value);
  const keys = values.map((value) => keyFor(value, caseSensitive));
  const cursor = Math.max(keys.indexOf(opts.initialValue ?? ''), 0);
  return run<Value>({
    ...opts,
    initialValue: values[cursor],
    onKey: (prompt, char) => {
      if (char?.length !== 1) return;
      const hit = values[keys.indexOf(keyFor(char, caseSensitive))];
      if (hit === undefined) return;
      prompt.value = hit;
      prompt.state = 'submit';
    },
    render: (prompt) => {
      const body = opts.options.map((option, i) => {
        const key = i === cursor ? paint(['bgCyan', 'gray'], ` ${option.value} `) : paint(['gray', 'bgWhite', 'inverse'], ` ${option.value} `);
        return `${key} ${labelOf(option)}`;
      });
      const chosen = opts.options.find((option) => option.value === prompt.value);
      return frame(opts, prompt.state, opts.message, { body, summary: chosen === undefined ? '' : labelOf(chosen) });
    },
  });
};

/** A multi-selection's frame: the window, the footer — gone while an error takes its place — and the summary. */
function multiFrame<T extends Choice>(opts: CommonOptions & { message: string; maxItems?: number; showInstructions?: boolean }, prompt: Prompt<unknown[]>, list: { rows: T[]; cursor: number; style: (row: T, on: boolean) => string; answered: readonly Choice[] }): string {
  const footer = prompt.state === 'error' ? undefined : footerOf(opts, MULTISELECT_INSTRUCTIONS);
  const body = windowOf({ opts, options: list.rows, cursor: list.cursor, style: list.style, footer: footer?.length ?? 2 });
  const empty = prompt.state === 'cancel' ? '' : 'none';
  return frame(opts, prompt.state, opts.message, { body, summary: summaryOf(list.answered, prompt.value ?? [], empty), footer, error: prompt.error });
}

/** `multiselect` — any number of options: space toggles, `a` toggles all, `i` inverts. */
export const multiselect = <Value>(opts: MultiSelectOptions<Value>): Answer<Value[]> => {
  const { options } = opts;
  let cursor = enabledFrom(
    Math.max(
      options.findIndex((option) => option.value === opts.cursorAt),
      0,
    ),
    options,
  );
  const enabled = options.filter((option) => option.disabled !== true).map((option) => option.value);
  const keyed = (chosen: Value[], name: string | undefined): Value[] | undefined => {
    if (name === 'a') return chosen.length === enabled.length ? [] : [...enabled];
    if (name === 'i') return enabled.filter((value) => !chosen.includes(value));
    return undefined;
  };
  return run<Value[]>({
    ...opts,
    initialValue: [...(opts.initialValues ?? [])],
    validate: requiredCheck(opts.required ?? true),
    onKey: (prompt, _char, key, action) => {
      const chosen = prompt.value ?? [];
      const all = keyed(chosen, key.name);
      if (all !== undefined) prompt.value = all;
      else if (action === 'space') prompt.value = toggled(chosen, options[cursor]?.value as Value);
      else if (stepOf(action) !== 0) cursor = findCursor(cursor, stepOf(action), options);
    },
    render: (prompt) => {
      const chosen = prompt.value ?? [];
      return multiFrame(opts, prompt as Prompt<unknown[]>, { rows: options, cursor, style: (option, on) => checkbox(option, boxLook(option, on, chosen)), answered: options });
    },
  });
};

/** One row of a grouped list: a group's header, or an option inside a group. */
interface GroupRow extends Choice {
  group: true | string;
}

/** A grouped list, flattened: each group's header followed by its members, and the cursor over all of them. */
class Grouped {
  readonly rows: GroupRow[];
  cursor: number;

  constructor(
    options: Record<string, readonly Choice[]>,
    private readonly selectable: boolean,
    private readonly spacing: number,
    cursorAt: unknown,
  ) {
    this.rows = Object.entries(options).flatMap(([name, members]) => [{ value: name, label: name, group: true as const }, ...members.map((member) => ({ ...member, group: name }))]);
    this.cursor = Math.max(
      this.rows.findIndex((row) => row.value === cursorAt),
      selectable ? 0 : 1,
    );
  }

  private membersOf(name: unknown): GroupRow[] {
    return this.rows.filter((row) => row.group === name);
  }

  private allChosen(name: unknown, chosen: readonly unknown[]): boolean {
    return this.membersOf(name).every((row) => chosen.includes(row.value));
  }

  /** Step the cursor, skipping a group header once when headers cannot be chosen. */
  move(step: number): void {
    this.cursor = wrapIndex(this.cursor + step, this.rows.length);
    if (!this.selectable && this.rows[this.cursor]?.group === true) this.cursor = wrapIndex(this.cursor + step, this.rows.length);
  }

  /** Toggle the row under the cursor; a header toggles every member of its group. */
  toggle(chosen: unknown[]): unknown[] {
    const row = this.rows[this.cursor];
    if (row === undefined) return chosen;
    if (row.group !== true) return toggled(chosen, row.value);
    const members = this.membersOf(row.value).map((member) => member.value);
    return this.allChosen(row.value, chosen) ? chosen.filter((value) => !members.includes(value)) : [...new Set([...chosen, ...members])];
  }

  private header(row: GroupRow, on: boolean, chosen: readonly unknown[]): string {
    const gap = '\n'.repeat(Math.max(this.spacing, 0));
    const label = on ? labelOf(row) : paint('dim', labelOf(row));
    if (!this.selectable) return `${gap}${label}`;
    const colour = on ? 'cyan' : 'dim';
    const mark = this.allChosen(row.value, chosen) ? paint('green', S_CHECKBOX_SELECTED) : paint(colour, S_CHECKBOX_INACTIVE);
    return `${gap}${mark} ${label}`;
  }

  /** Draw one row. A member is indented under its group, behind a plain branch — never a guide glyph with colour. */
  draw(row: GroupRow, on: boolean, chosen: readonly unknown[]): string {
    if (row.group === true) return this.header(row, on, chosen);
    const last = this.membersOf(row.group).at(-1) === row;
    const branch = last ? '└' : '│';
    const indent = this.selectable ? `${branch} ` : '  ';
    return `${indent}${checkbox(row, boxLook(row, on, chosen))}`;
  }

  get members(): GroupRow[] {
    return this.rows.filter((row) => row.group !== true);
  }
}

/** `groupMultiselect` — a multi-selection in named groups; a group toggles all of its options. */
export const groupMultiselect = <Value>(opts: GroupMultiSelectOptions<Value>): Answer<Value[]> => {
  const list = new Grouped(opts.options as Record<string, readonly Choice[]>, opts.selectableGroups !== false, opts.groupSpacing ?? 0, opts.cursorAt);
  return run<Value[]>({
    ...opts,
    initialValue: [...(opts.initialValues ?? [])],
    validate: requiredCheck(opts.required ?? true),
    onKey: (prompt, _char, _key, action) => {
      if (action === 'space') prompt.value = list.toggle(prompt.value ?? []) as Value[];
      else if (stepOf(action) !== 0) list.move(stepOf(action));
    },
    render: (prompt) => {
      const chosen = prompt.value ?? [];
      return multiFrame(opts, prompt as Prompt<unknown[]>, { rows: list.rows, cursor: list.cursor, style: (row, on) => list.draw(row, on, chosen), answered: list.members });
    },
  });
};

/** Move a text cursor by columns and rows through a multi-line string, as clack's editor does. */
function moveTextCursor(at: number, dy: number, value: string): number {
  const rows = value.split('\n');
  let row = 0;
  let column = at;
  for (const line of rows) {
    if (column <= line.length) break;
    column -= line.length + 1;
    row++;
  }
  row = Math.max(0, Math.min(rows.length - 1, row + dy));
  column = Math.min(column, rows[row]?.length ?? 0);
  return rows.slice(0, row).reduce((total, line) => total + line.length + 1, 0) + column;
}

/** The typed text with its cursor; on a line break the block sits at the end of the line. */
function multilineCursor(typed: string, at: number): string {
  if (typed[at] === '\n') return `${typed.slice(0, at)}█\n${typed.slice(at + 1)}`;
  return withCursor(typed, at);
}

/** Where a multiline prompt's focus is: the text, or the `[ submit ]` button. */
interface Editor {
  focus: 'editor' | 'submit';
  /** Set by one enter at the end of the text; a second submits. */
  armed: boolean;
}

const insert = (prompt: Prompt<string>, piece: string): void => {
  prompt.userInput = prompt.userInput.slice(0, prompt.cursor) + piece + prompt.userInput.slice(prompt.cursor);
  prompt.cursor += piece.length;
  prompt.value = prompt.userInput;
};

/** Enter in a multiline prompt: a newline, unless it is the second at the end, or the button has focus. */
function enter(prompt: Prompt<string>, editor: Editor, showSubmit: boolean): boolean {
  if (showSubmit) {
    if (editor.focus === 'submit') return true;
    insert(prompt, '\n');
    return false;
  }
  const second = editor.armed;
  editor.armed = true;
  if (!second || prompt.cursor !== prompt.userInput.length) {
    insert(prompt, '\n');
    return false;
  }
  if (prompt.userInput.endsWith('\n')) {
    prompt.userInput = prompt.userInput.slice(0, -1);
    prompt.cursor--;
    prompt.value = prompt.userInput;
  }
  return true;
}

/** `multiline` — typing across lines; a second enter at the end submits, or tab reaches `[ submit ]`. */
export const multiline = (opts: MultiLineOptions): Answer<string> => {
  const showSubmit = opts.showSubmit === true;
  const editor: Editor = { focus: 'editor', armed: false };
  return run<string>({
    ...opts,
    initialValue: undefined,
    track: true,
    initialUserInput: opts.initialValue,
    onInput: (prompt) => {
      mirror(prompt);
      editor.focus = 'editor';
    },
    onKey: (prompt, _char, key) => {
      if (key.name === 'return') return;
      editor.armed = false;
      if (key.name === 'up' || key.name === 'down') prompt.cursor = moveTextCursor(prompt.cursor, key.name === 'up' ? -1 : 1, prompt.userInput);
      else if (key.name === 'tab' && showSubmit) editor.focus = editor.focus === 'editor' ? 'submit' : 'editor';
    },
    shouldSubmit: (prompt) => enter(prompt, editor, showSubmit),
    finalize: defaulted(opts.defaultValue),
    render: (prompt) => {
      const typed = prompt.userInput === '' ? placeholderOf(opts.placeholder) : multilineCursor(prompt.userInput, prompt.cursor);
      const colour = editor.focus === 'submit' ? 'cyan' : 'dim';
      const button = showSubmit ? [paint(colour, '[ submit ]')] : [];
      return frame(opts, prompt.state, opts.message, { body: [...typed.split('\n'), ...button], summary: answered(prompt.state) ? (prompt.value ?? '') : '', error: prompt.error });
    },
  });
};

const answered = (state: State): boolean => state === 'submit' || state === 'cancel';
