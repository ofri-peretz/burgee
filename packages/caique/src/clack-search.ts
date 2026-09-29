/**
 * clack's three searchable prompts — `autocomplete`, `autocompleteMultiselect` and `path` —
 * over one engine: a typed search over a list that is re-filtered on every keystroke,
 * navigated with the arrows and, for the multiple kind, toggled with tab, or with space once
 * the arrows are in use. `path` is an autocomplete whose options are the directory entries
 * under what has been typed.
 */
import { type CommonOptions, formatInstructionFooter, frame, guided, type Keypress, type Option, paint, placeholderOf, type Prompt, run, runValidation, type Validate, withCursor } from './clack-core.js';
import { boxLook, checkbox, type Choice, findCursor, labelOf, radio, radioLook, REQUIRED, toggled, windowOf } from './clack-list.js';
import { entriesUnder } from './clack-path.js';
import { type Answer } from './clack-prompts.js';
import { processFacts } from './runtime.js';

interface AutocompleteSharedOptions<Value> extends CommonOptions {
  message: string;
  /** The options, or a function of what has been typed that returns them. */
  options: Option<Value>[] | ((this: { readonly userInput: string }) => Option<Value>[]);
  maxItems?: number;
  placeholder?: string;
  validate?: Validate<Value | Value[]>;
  filter?: (search: string, option: Option<Value>) => boolean;
}

export interface AutocompleteOptions<Value> extends AutocompleteSharedOptions<Value> {
  initialValue?: Value;
  initialUserInput?: string;
  completeOnTab?: boolean;
}

export interface AutocompleteMultiSelectOptions<Value> extends AutocompleteSharedOptions<Value> {
  initialValues?: Value[];
  required?: boolean;
}

export interface PathOptions extends CommonOptions {
  message: string;
  root?: string;
  directory?: boolean;
  initialValue?: string;
  validate?: Validate<string>;
}

/** The default search: the label contains what was typed, ignoring case. */
const matches = (search: string, option: Choice): boolean => labelOf(option).toLowerCase().includes(search.toLowerCase());

interface Mode<Value> {
  multiple: boolean;
  initial: Value[];
  initialUserInput?: string | undefined;
  completeOnTab?: boolean | undefined;
  required?: boolean | undefined;
}

/** A search in progress: the options that match what is typed, which one is focused, and which are chosen. */
class Search<Value> {
  filtered: Option<Value>[];
  cursor = 0;
  navigating = false;
  selected: Value[] = [];
  focused: Value | undefined;
  private readonly context: { userInput: string };
  private readonly filter: ((search: string, option: Option<Value>) => boolean) | undefined;

  constructor(
    private readonly opts: AutocompleteSharedOptions<Value>,
    private readonly mode: Mode<Value>,
  ) {
    this.context = { userInput: mode.initialUserInput ?? '' };
    this.filter = typeof opts.options === 'function' ? opts.filter : (opts.filter ?? matches);
    this.filtered = this.all();
    this.seed();
  }

  private all(): Option<Value>[] {
    const { options } = this.opts;
    return typeof options === 'function' ? options.call(this.context) : options;
  }

  /** Choose the initial values, and put the cursor on the last of them — or on the first option. */
  private seed(): void {
    const { initial, multiple } = this.mode;
    const first = this.filtered[0];
    const fallback = !multiple && first !== undefined ? [first.value] : [];
    const seed = initial.length > 0 ? initial : fallback;
    for (const value of multiple ? seed : seed.slice(0, 1)) {
      const at = this.filtered.findIndex((option) => option.value === value);
      if (at === -1) continue;
      this.selected = multiple ? [...this.selected, value] : [value];
      this.cursor = at;
    }
    this.focused = this.filtered[this.cursor]?.value;
  }

  private follow(): void {
    if (!this.mode.multiple) this.selected = this.focused === undefined ? [] : [this.focused];
  }

  /** Re-filter for what is now typed, keeping the focused option focused if it still matches. */
  refilter(typed: string): void {
    this.context.userInput = typed;
    const options = this.all();
    const { filter } = this;
    this.filtered = typed !== '' && filter !== undefined ? options.filter((option) => filter(typed, option)) : [...options];
    const at = Math.max(
      this.filtered.findIndex((option) => option.value === this.focused),
      0,
    );
    this.cursor = findCursor(at, 0, this.filtered);
    const option = this.filtered[this.cursor];
    this.focused = option === undefined || option.disabled === true ? undefined : option.value;
    this.follow();
  }

  navigate(step: number): void {
    this.cursor = findCursor(this.cursor, step, this.filtered);
    this.focused = this.filtered[this.cursor]?.value;
    this.follow();
    this.navigating = true;
  }

  /** What tab types in, if anything: the placeholder into an empty search, or the focused value with `completeOnTab`. */
  completion(typed: string): string | undefined {
    const { placeholder } = this.opts;
    const { filter } = this;
    const fits = (search: string): boolean => this.all().some((option) => option.disabled !== true && (filter === undefined || filter(search, option)));
    if (typed === '' && placeholder !== undefined && placeholder !== '' && fits(placeholder)) return placeholder;
    // `completeOnTab` is a single search's option; a multiple one never sets it, since tab toggles there.
    if (this.mode.completeOnTab === true && this.focused !== undefined) return String(this.focused);
    return undefined;
  }

  toggleFocused(): void {
    // A search that matches nothing has nothing focused: `refilter` and `navigate` both see to it.
    if (this.focused !== undefined) this.selected = toggled(this.selected, this.focused);
  }

  /** Whether space is a command here rather than a character: in a multiple search, once the arrows are in use. */
  spaceToggles(key: Keypress): boolean {
    return this.mode.multiple && this.navigating && key.name === 'space';
  }

  /** Whether a key toggles the focused option: tab, or space once navigating — in a multiple search only. */
  toggles(key: Keypress): boolean {
    return this.mode.multiple && (key.name === 'tab' || this.spaceToggles(key));
  }

  answer(): Value | Value[] | undefined {
    return this.mode.multiple ? this.selected : this.selected[0];
  }

  summary(): string {
    const count = this.selected.length;
    if (this.mode.multiple) return `${String(count)} item${count === 1 ? '' : 's'} selected`;
    const chosen = this.all().find((option) => option.value === this.selected[0]);
    return chosen === undefined ? '' : labelOf(chosen);
  }

  instructions(): string[] {
    const tab = this.mode.multiple ? [`${paint('dim', 'Tab:')} select`] : [];
    return [`${paint('dim', '↑/↓')} to select`, ...tab, `${paint('dim', 'Enter:')} confirm`, `${paint('dim', 'Type:')} to search`];
  }

  style(option: Option<Value>, on: boolean): string {
    return this.mode.multiple ? checkbox(option, boxLook(option, on, this.selected)) : radio(option, radioLook(option, on));
  }
}

/** Put a completion into the search box, as if it had been typed. */
function retype<Value>(search: Search<Value>, prompt: Prompt<Value | Value[]>, line: string): void {
  prompt.userInput = line;
  prompt.cursor = line.length;
  search.refilter(line);
  search.navigating = false;
}

/** One key, for a search: tab completes or toggles, the arrows move, enter answers, space may toggle. */
function onSearchKey<Value>(search: Search<Value>, prompt: Prompt<Value | Value[]>, key: Keypress): void {
  const completion = key.name === 'tab' ? search.completion(prompt.userInput) : undefined;
  if (completion !== undefined) {
    retype(search, prompt, completion);
    return;
  }
  if (key.name === 'up' || key.name === 'down') search.navigate(key.name === 'up' ? -1 : 1);
  else if (key.name === 'return') prompt.value = search.answer();
  else if (search.toggles(key)) search.toggleFocused();
  else search.navigating = false;
}

function renderSearch<Value>(search: Search<Value>, opts: AutocompleteSharedOptions<Value>, prompt: Prompt<Value | Value[]>): string {
  const typed = prompt.userInput === '' ? placeholderOf(opts.placeholder) : withCursor(prompt.userInput, prompt.cursor);
  const count = search.filtered.length;
  const plural = count === 1 ? '' : 'es';
  const found = prompt.userInput === '' ? '' : paint('dim', ` (${String(count)} match${plural})`);
  const footer = prompt.state === 'error' ? undefined : formatInstructionFooter(search.instructions(), guided(opts));
  const list = count === 0 ? [paint('yellow', 'No matches found')] : windowOf({ opts, options: search.filtered, cursor: search.cursor, style: (option, on) => search.style(option, on), footer: footer?.length ?? 2 });
  return frame(opts, prompt.state, opts.message, { body: [`${paint('dim', 'Search:')} ${typed}${found}`, ...list], summary: search.summary(), footer, error: prompt.error });
}

function searchable<Value>(opts: AutocompleteSharedOptions<Value>, mode: Mode<Value>): Answer<Value | Value[]> {
  const search = new Search(opts, mode);
  return run<Value | Value[]>({
    ...opts,
    track: true,
    initialUserInput: mode.initialUserInput,
    validate: (value) => {
      if (mode.required === true && Array.isArray(value) && value.length === 0) return REQUIRED;
      return opts.validate === undefined ? undefined : runValidation(opts.validate, value);
    },
    isActionKey: (_prompt, _char, key) => key.name === 'tab' || search.spaceToggles(key),
    onInput: (prompt) => {
      search.refilter(prompt.userInput);
    },
    onKey: (prompt, _char, key) => {
      onSearchKey(search, prompt, key);
    },
    render: (prompt) => renderSearch(search, opts, prompt),
  });
}

/** `autocomplete` — `select` with a search box over the list. */
export const autocomplete = <Value>(opts: AutocompleteOptions<Value>): Answer<Value> =>
  searchable(opts, { multiple: false, initial: opts.initialValue === undefined ? [] : [opts.initialValue], initialUserInput: opts.initialUserInput, completeOnTab: opts.completeOnTab }) as Answer<Value>;

/** `autocompleteMultiselect` — `multiselect` with a search box over the list. */
export const autocompleteMultiselect = <Value>(opts: AutocompleteMultiSelectOptions<Value>): Answer<Value[]> =>
  searchable(opts, { multiple: true, initial: opts.initialValues ?? [], required: opts.required }) as Answer<Value[]>;

/** `path` — an autocomplete over the filesystem, starting at `root` or the working directory. */
export const path = (opts: PathOptions): Answer<string> =>
  searchable<string>(
    {
      ...opts,
      maxItems: 5,
      validate: (value) => {
        // A single search: the answer is the focused path or nothing, never a list.
        if (typeof value !== 'string' || value === '') return 'Please select a path';
        return opts.validate === undefined ? undefined : runValidation(opts.validate, value);
      },
      options(this: { readonly userInput: string }) {
        return entriesUnder(this.userInput, opts.directory === true);
      },
    },
    { multiple: false, initial: [], initialUserInput: opts.initialValue ?? opts.root ?? processFacts().cwd, completeOnTab: true },
  ) as Answer<string>;
