/**
 * The engine under `caique/clack`: clack's symbols and settings, its cancel value, and the
 * keypress loop every one of its twelve prompts runs on.
 *
 * `@clack/prompts` builds each prompt on a class from `@clack/core`. caique cannot depend on
 * that package (U6), so this file is the part of it the prompts need, written against the
 * behaviour the incumbent's suite and its own published build show — not a port of its code:
 *
 * - **The write order is the incumbent's**, because callers and `guide.test.ts` read it: the
 *   first write of a prompt hides the cursor, the second is the whole first frame, and the
 *   last two after an answer are a newline and the cursor shown again.
 * - **The cursor is closeout's to hide.** clack writes `cursor.hide` on any stream it drives,
 *   terminal or not; so does this, through `hideCursor()` with the output viewed as the
 *   terminal it is being driven as — the arrangement `raw.ts` already makes — and the restore
 *   is registered on `closeout/exit-hook` in the same call, so a prompt that dies by a signal
 *   still gives the cursor back. clack registers nothing and does not.
 * - **Raw mode is closeout's too.** clack switches it on and off whoever held it; `rawMode()`
 *   turns it off only when this prompt turned it on, so a program that went raw first keeps it.
 * - **Keys come from `node:readline`'s keypress decoder**, the same one clack's `readline`
 *   interface installs, so a person and a test that emits `keypress` drive the same loop.
 *
 * Every frame is a pure function of the prompt's state, which is U3's static projection: what
 * the prompt is when nothing moves is exactly its last frame.
 */
import { emitKeypressEvents } from 'node:readline';
import { styleText } from 'node:util';

import { hideCursor, rawMode } from 'closeout/cursor';
import exitHook from 'closeout/exit-hook';
import { wrap } from 'linegauge/wrap';

import { processFacts, processRuntime } from './runtime.js';

/** A stream a list can measure itself against. Anything with a size, including a test double. */
export interface SizedOutput {
  columns?: number;
  rows?: number;
  isTTY?: boolean;
}

/** The streams and settings every clack call accepts. */
export interface CommonOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream & SizedOutput;
  signal?: AbortSignal;
  withGuide?: boolean;
}

type Primitive = Readonly<string | boolean | number>;

/** One choice in a list: a primitive value may go without a label, anything else may not. */
export type Option<Value> = Value extends Primitive
  ? { value: Value; label?: string; hint?: string; disabled?: boolean }
  : { value: Value; label: string; hint?: string; disabled?: boolean };

/** Where a prompt is in its life. The frame is drawn from this and nothing else. */
export type State = 'initial' | 'active' | 'cancel' | 'submit' | 'error' | 'validating';

/** What a key means once aliases are applied. */
export type Action = 'up' | 'down' | 'left' | 'right' | 'space' | 'enter' | 'cancel';

type MaybePromise<T> = T | Promise<T>;

/** A Standard Schema, read structurally: the one method a validator library exposes. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly validate: (value: unknown) => MaybePromise<{ readonly issues?: readonly { readonly message: string }[] | undefined; readonly value?: Output }>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

/** A function returning the problem, or a Standard Schema that finds it. */
export type Validate<TValue> = ((value: TValue | undefined) => MaybePromise<string | Error | undefined>) | StandardSchemaV1<TValue | undefined, unknown>;

/** The date field order, as clack names it. */
export type DateFormat = 'YMD' | 'MDY' | 'DMY';

/** What `updateSettings` takes. */
export interface ClackSettings {
  /** Extra keys for an action — `{ w: 'up' }` — which never replace an existing alias. */
  aliases?: Record<string, Action>;
  messages?: { cancel?: string; error?: string };
  /** `false` draws every prompt without its left-hand guide. */
  withGuide?: boolean;
}

/** The process-wide settings every prompt here reads, and `updateSettings` writes. */
export const settings = {
  actions: new Set<Action>(['up', 'down', 'left', 'right', 'space', 'enter', 'cancel']),
  aliases: new Map<string, Action>([
    ['k', 'up'],
    ['j', 'down'],
    ['h', 'left'],
    ['l', 'right'],
    ['\u0003', 'cancel'],
    ['escape', 'cancel'],
  ]),
  messages: { cancel: 'Canceled', error: 'Something went wrong' },
  withGuide: true,
};

/**
 * Change the settings every later prompt reads.
 *
 * **These are caique's settings, not `@clack/core`'s**, and that is the one place this
 * subpath cannot follow the incumbent: clack's live in a module caique does not depend on
 * (U6), so a program that calls `@clack/core`'s `updateSettings` is changing a package our
 * prompts never read. A program that imports this one from `caique/clack` gets the behaviour.
 */
export function updateSettings(updates: ClackSettings): void {
  for (const [key, action] of Object.entries(updates.aliases ?? {})) {
    if (settings.actions.has(action) && !settings.aliases.has(key)) settings.aliases.set(key, action);
  }
  if (updates.messages?.cancel !== undefined) settings.messages.cancel = updates.messages.cancel;
  if (updates.messages?.error !== undefined) settings.messages.error = updates.messages.error;
  if (updates.withGuide !== undefined) settings.withGuide = updates.withGuide !== false;
}

/** What every prompt resolves to when it is cancelled. Test it with `isCancel`. */
export const CANCEL_SYMBOL: unique symbol = Symbol('clack:cancel');

/** Whether a prompt's answer is a cancellation rather than an answer. */
export const isCancel = (value: unknown): value is symbol => value === CANCEL_SYMBOL;

function unicodeSupported(): boolean {
  const { env } = processRuntime();
  if (processFacts().platform !== 'win32') return env['TERM'] !== 'linux';
  return (
    Boolean(env['CI']) ||
    Boolean(env['WT_SESSION']) ||
    env['TERM_PROGRAM'] === 'vscode' ||
    env['TERM'] === 'xterm-256color' ||
    env['TERM'] === 'alacritty' ||
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm'
  );
}

/** Whether the terminal can draw clack's box characters; read once, as the incumbent reads it. */
export const unicode = unicodeSupported();
/**
 * Whether `CI` is the string `true`, which is the test clack makes. This and the glyph table
 * above stay clack's rules rather than roundel's: `interactive()` asks whether a person can
 * answer, which clack never asks, and clack's table counts `CI` where roundel's `unicode()` does not.
 */
export const isCI = (): boolean => processRuntime().env['CI'] === 'true';
/** Whether a stream is a terminal. */
export const isTTY = (output: { isTTY?: boolean }): boolean => output.isTTY === true;
/** The first glyph where the terminal draws unicode, the second where it does not. */
export const unicodeOr = (glyph: string, fallback: string): string => (unicode ? glyph : fallback);

export const S_STEP_ACTIVE = unicodeOr('◆', '*');
export const S_STEP_CANCEL = unicodeOr('■', 'x');
export const S_STEP_ERROR = unicodeOr('▲', 'x');
export const S_STEP_SUBMIT = unicodeOr('◇', 'o');
export const S_BAR_START = unicodeOr('┌', 'T');
export const S_BAR = unicodeOr('│', '|');
export const S_BAR_END = unicodeOr('└', '—');
export const S_BAR_START_RIGHT = unicodeOr('┐', 'T');
export const S_BAR_END_RIGHT = unicodeOr('┘', '—');
export const S_RADIO_ACTIVE = unicodeOr('●', '>');
export const S_RADIO_INACTIVE = unicodeOr('○', ' ');
export const S_CHECKBOX_ACTIVE = unicodeOr('◻', '[•]');
export const S_CHECKBOX_SELECTED = unicodeOr('◼', '[+]');
export const S_CHECKBOX_INACTIVE = unicodeOr('◻', '[ ]');
export const S_PASSWORD_MASK = unicodeOr('▪', '•');
export const S_BAR_H = unicodeOr('─', '-');
export const S_CORNER_TOP_RIGHT = unicodeOr('╮', '+');
export const S_CONNECT_LEFT = unicodeOr('├', '+');
export const S_CORNER_BOTTOM_RIGHT = unicodeOr('╯', '+');
export const S_CORNER_BOTTOM_LEFT = unicodeOr('╰', '+');
export const S_CORNER_TOP_LEFT = unicodeOr('╭', '+');
export const S_INFO = unicodeOr('●', '•');
export const S_SUCCESS = unicodeOr('◆', '*');
export const S_WARN = unicodeOr('▲', '!');
export const S_ERROR = unicodeOr('■', 'x');

type Format = Parameters<typeof styleText>[0];
/** `styleText`, shortened, because every line of every frame calls it. */
export const paint = (format: Format, text: string): string => styleText(format, text);

const STEP_COLOUR: Record<State, Format> = { initial: 'cyan', active: 'cyan', cancel: 'red', error: 'yellow', submit: 'green', validating: 'dim' };
const STEP_GLYPH: Record<State, string> = { initial: S_STEP_ACTIVE, active: S_STEP_ACTIVE, cancel: S_STEP_CANCEL, error: S_STEP_ERROR, submit: S_STEP_SUBMIT, validating: S_STEP_ACTIVE };

/** The glyph that opens a prompt's title line, coloured for its state. */
export const symbol = (state: State): string => paint(STEP_COLOUR[state], STEP_GLYPH[state]);

/** The guide bar beside a prompt's body, coloured for its state; none while it validates. */
export const symbolBar = (state: State): string | undefined => (state === 'validating' ? undefined : paint(STEP_COLOUR[state], S_BAR));

/** The key hints under a list: one line, and the closing guide under it when there is one. */
export function formatInstructionFooter(instructions: string[], hasGuide: boolean): string[] {
  const lines = [`${hasGuide ? `${paint('cyan', S_BAR)}  ` : ''}${instructions.join(' • ')}`];
  if (hasGuide) lines.push(paint('cyan', S_BAR_END));
  return lines;
}

export const SELECT_INSTRUCTIONS = [`${paint('dim', '↑/↓')} to navigate`, `${paint('dim', 'Enter:')} confirm`];
export const MULTISELECT_INSTRUCTIONS = [`${paint('dim', '↑/↓')} to navigate`, `${paint('dim', 'Space:')} select`, `${paint('dim', 'Enter:')} confirm`];

/** Whether this call draws the guide: its own option first, then the setting. */
export const guided = (opts: CommonOptions): boolean => (opts.withGuide ?? settings.withGuide) !== false;

/** Run a validator of either shape, and say what is wrong or nothing. */
export function runValidation<T>(validate: Validate<T>, value: T | undefined): MaybePromise<string | Error | undefined> {
  if (typeof validate === 'function') return validate(value);
  const result = validate['~standard'].validate(value);
  return result instanceof Promise ? result.then(firstIssue) : firstIssue(result);
}

/** A Standard Schema result's first problem, which is the one a prompt has room to show. */
function firstIssue(result: { issues?: readonly { message: string }[] | undefined }): string | undefined {
  return result.issues?.[0]?.message;
}

/** A keypress as `node:readline` reports it. */
export interface Keypress {
  name?: string | undefined;
  sequence?: string | undefined;
  ctrl?: boolean | undefined;
  meta?: boolean | undefined;
  shift?: boolean | undefined;
}

/** The mutable state of one running prompt: what its frame is drawn from. */
export interface Prompt<T> {
  state: State;
  value: T | undefined;
  error: string;
  /** What has been typed, for the prompts that take typing. */
  userInput: string;
  /** Where in `userInput` the cursor sits. */
  cursor: number;
}

/** One prompt, described: how keys change its state and how its state is drawn. */
export interface Definition<T> extends CommonOptions {
  validate?: Validate<T> | undefined;
  /** Whether typing edits `userInput`. List prompts leave it off and take `j`/`k` as moves. */
  track?: boolean;
  initialValue?: T | undefined;
  initialUserInput?: string | undefined;
  /** Called whenever `userInput` changes. */
  onInput?: (prompt: Prompt<T>) => void;
  /** Called on every key, after the line editor, with the action the key maps to. */
  onKey?: (prompt: Prompt<T>, char: string | undefined, key: Keypress, action: Action | undefined) => void;
  /** Whether a key the line editor would insert is a command here instead. */
  isActionKey?: (prompt: Prompt<T>, char: string | undefined, key: Keypress) => boolean;
  /** Whether enter submits. `multiline` answers no, and inserts a newline instead. */
  shouldSubmit?: (prompt: Prompt<T>) => boolean;
  /** Called once, when the prompt is answered or cancelled, before its last frame. */
  finalize?: (prompt: Prompt<T>) => void;
  render: (prompt: Prompt<T>) => string;
}

const CSI = '\u001B[';
/** Back to the first column of a frame of `lines` lines, and clear from there down. */
const erase = (lines: number): string => `${lines > 1 ? `${CSI}${String(lines - 1)}A` : ''}${CSI}1G${CSI}J`;

/** The width a frame wraps to when the stream does not say, which is clack's too. */
const DEFAULT_COLUMNS = 80;

/** The columns a frame may use: the stream's own, or clack's default when it has none. */
export const columnsOf = (output: SizedOutput): number => (typeof output.columns === 'number' && output.columns > 0 ? output.columns : DEFAULT_COLUMNS);

/** Whether a key cancels, through any alias it is known by. */
const cancels = (char: string | undefined, key: Keypress): boolean => [char, key.name, key.sequence].some((k) => k !== undefined && settings.aliases.get(k) === 'cancel');

function actionOf(key: Keypress, track: boolean): Action | undefined {
  if (key.name === undefined) return undefined;
  if (!track && settings.aliases.has(key.name)) return settings.aliases.get(key.name);
  return [...settings.actions].find((action) => action === key.name);
}

/** Keys the line editor never inserts, whatever their `char` says. */
const NOT_TYPED = new Set(['return', 'enter', 'escape', 'tab', 'up', 'down']);

/** Whether a key is text to insert rather than a command: printable, and no modifier held. */
const printable = (char: string | undefined, key: Keypress): char is string =>
  key.ctrl !== true && key.meta !== true && char !== undefined && char !== '' && !NOT_TYPED.has(key.name ?? '') && char >= ' ';

/** Where a key that only moves the cursor puts it, or `undefined` for any other key. */
function moved(name: string | undefined, cursor: number, length: number): number | undefined {
  switch (name) {
    case 'left':
      return Math.max(0, cursor - 1);
    case 'right':
      return Math.min(length, cursor + 1);
    case 'home':
      return 0;
    case 'end':
      return length;
    default:
      return undefined;
  }
}

/** One key's edit to the typed line: insert, delete, move. What `readline` does for clack. Says whether the text changed. */
function edit<T>(prompt: Prompt<T>, char: string | undefined, key: Keypress): boolean {
  const { userInput: line, cursor } = prompt;
  const set = (next: string, at: number): boolean => {
    prompt.userInput = next;
    prompt.cursor = at;
    return true;
  };
  const at = moved(key.name, cursor, line.length);
  if (at !== undefined) {
    prompt.cursor = at;
    return false;
  }
  if (key.name === 'backspace') return cursor > 0 && set(line.slice(0, cursor - 1) + line.slice(cursor), cursor - 1);
  if (key.name === 'delete') return cursor < line.length && set(line.slice(0, cursor) + line.slice(cursor + 1), cursor);
  if (key.ctrl === true && key.name === 'u') return set(line.slice(cursor), 0);
  return printable(char, key) && set(line.slice(0, cursor) + char + line.slice(cursor), cursor + char.length);
}

type Raw = NodeJS.ReadableStream & { isTTY?: boolean; isRaw?: boolean; setRawMode?: (raw: boolean) => unknown };
type Output = NodeJS.WritableStream & SizedOutput;

const noop = (): void => undefined;

/** How long a lone escape waits to become a sequence: clack's 50 ms, not readline's 500. */
const ESCAPE_TIMEOUT = 50;

/**
 * The keypress decoder's options. `node:readline` types its second argument as a whole
 * `Interface` and reads one field of it, which is all a prompt without an interface can give.
 */
// eslint-disable-next-line reliability/no-unsafe-type-narrowing -- the decoder reads `escapeCodeTimeout` and nothing else from its second argument
const DECODER = { escapeCodeTimeout: ESCAPE_TIMEOUT } as unknown as Parameters<typeof emitKeypressEvents>[1];

/** One running prompt: its state, its streams, and the frame it drew last. */
class Session<T> {
  readonly prompt: Prompt<T>;
  private previous = '';
  private restore = noop;
  private unraw = noop;
  private closed = false;

  constructor(
    private readonly definition: Definition<T>,
    private readonly input: Raw,
    private readonly output: Output,
    private readonly settle: (answer: T | symbol) => void,
  ) {
    this.prompt = { state: 'initial', value: definition.initialValue, error: '', userInput: '', cursor: 0 };
    if (definition.initialUserInput !== undefined) {
      this.prompt.userInput = definition.initialUserInput;
      this.prompt.cursor = definition.initialUserInput.length;
      definition.onInput?.(this.prompt);
    }
  }

  /** Attach, draw the first frame, and wait — or cancel at once if the signal already fired. */
  open(): void {
    const { signal } = this.definition;
    if (signal?.aborted === true) {
      this.prompt.state = 'cancel';
      this.close();
      return;
    }
    signal?.addEventListener('abort', this.onAbort, { once: true });
    emitKeypressEvents(this.input, DECODER);
    this.input.on('keypress', this.onKeypress);
    this.unraw = rawMode(this.input, exitHook);
    this.input.resume();
    this.draw();
  }

  /** Draw the current frame, if it changed. The first draw hides the cursor and registers its return. */
  private draw(): void {
    const frame = wrap(this.definition.render(this.prompt), columnsOf(this.output), { hard: true, trim: false });
    if (frame === this.previous) return;
    if (this.prompt.state === 'initial') {
      this.restore = hideCursor({ write: (text: string) => this.output.write(text), isTTY: true }, exitHook);
      this.output.write(frame);
      this.prompt.state = 'active';
    } else {
      this.output.write(erase(this.previous.split('\n').length) + frame);
    }
    this.previous = frame;
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.input.removeListener('keypress', this.onKeypress);
    this.definition.signal?.removeEventListener('abort', this.onAbort);
    this.output.write('\n');
    this.unraw();
    this.input.pause();
    this.restore();
    this.settle(this.prompt.state === 'submit' ? (this.prompt.value as T) : CANCEL_SYMBOL);
  }

  private finish(): void {
    this.definition.finalize?.(this.prompt);
    this.draw();
    this.close();
  }

  private readonly onAbort = (): void => {
    this.prompt.state = 'cancel';
    this.finish();
  };

  /** Validate, then submit — or stay open with the problem shown. */
  private async submit(): Promise<void> {
    const { validate } = this.definition;
    if (validate !== undefined) {
      let problem = runValidation(validate, this.prompt.value);
      if (problem instanceof Promise) {
        this.prompt.state = 'validating';
        this.draw();
        problem = await problem;
      }
      if (problem !== undefined && problem !== '') {
        this.prompt.error = problem instanceof Error ? problem.message : problem;
        this.prompt.state = 'error';
        return;
      }
    }
    this.prompt.state = 'submit';
  }

  /** The typing half of a key: the line editor, unless this prompt reads the key as a command. */
  private type(char: string | undefined, key: Keypress): void {
    const { definition, prompt } = this;
    if (definition.track !== true || (definition.isActionKey?.(prompt, char, key) ?? false)) return;
    if (edit(prompt, char, key)) definition.onInput?.(prompt);
  }

  private readonly onKeypress = async (char: string | undefined, key: Keypress = {}): Promise<void> => {
    const { definition, prompt } = this;
    if (this.closed || prompt.state === 'validating') return;
    this.type(char, key);
    if (prompt.state === 'error') prompt.state = 'active';
    definition.onKey?.(prompt, char, key, actionOf(key, definition.track === true));
    const submits = key.name === 'return' && prompt.state !== 'submit' && (definition.shouldSubmit?.(prompt) ?? true);
    if (submits) await this.submit();
    if (cancels(char, key)) prompt.state = 'cancel';
    if (prompt.state === 'submit' || prompt.state === 'cancel') this.finish();
    else this.draw();
  };
}

/**
 * Run one prompt to its answer, or to `CANCEL_SYMBOL`.
 *
 * Everything a caller can observe happens synchronously inside this call: the keypress
 * listener is attached and the first frame is written before it returns, so a key emitted
 * on the next line is answered — which is how clack behaves and what its tests rely on.
 */
export function run<T>(definition: Definition<T>): Promise<T | symbol> {
  const runtime = processRuntime();
  const input: Raw = definition.input ?? runtime.stdin;
  const output = definition.output ?? runtime.stdout;
  return new Promise((resolve) => {
    new Session(definition, input, output, resolve).open();
  });
}

/** The typed line, with the cursor drawn as clack draws it: inverse under a character, a block at the end. */
export function withCursor(line: string, cursor: number, block = '█'): string {
  if (cursor >= line.length) return `${line}${block}`;
  return `${line.slice(0, cursor)}${paint('inverse', line.slice(cursor, cursor + 1))}${line.slice(cursor + 1)}`;
}

/** An empty line: the placeholder with the cursor on its first character, or a hidden cell. */
export const placeholderOf = (placeholder: string | undefined): string =>
  placeholder !== undefined && placeholder.length > 0 ? paint('inverse', placeholder.slice(0, 1)) + paint('dim', placeholder.slice(1)) : paint(['inverse', 'hidden'], '_');

/** The body of a frame, and what to show once it is answered. */
export interface Look {
  /** Lines under the title while the prompt is live. */
  body: string[];
  /** What the prompt answered, shown after it closes. Empty shows nothing. */
  summary: string;
  /** Lines under the body instead of the closing guide — instructions, usually. */
  footer?: string[] | undefined;
  /** The validation problem, drawn under the body in the error state. */
  error?: string | undefined;
}

/** A multi-line string with `first` before its first line and `rest` before the others. */
export const prefixed = (text: string, first: string, rest: string): string =>
  text
    .split('\n')
    .map((line, i) => (i === 0 ? first : rest) + line)
    .join('\n');

/** What a frame's parts are drawn with: the guide on or off, and a bar in a colour. */
interface Pen {
  guide: boolean;
  bar: (format: Format) => string;
}

const penOf = (opts: CommonOptions): Pen => {
  const guide = guided(opts);
  return { guide, bar: (format) => (guide ? `${paint(format, S_BAR)}  ` : '') };
};

/** The grey bar that opens an answered line: followed by two spaces only when something follows it. */
const closingBar = (pen: Pen, text: string): string => {
  if (!pen.guide) return '';
  return text === '' ? paint('gray', S_BAR) : `${paint('gray', S_BAR)}  `;
};

const submitted = (pen: Pen, summary: string): string => {
  const text = summary === '' ? '' : paint('dim', summary);
  return prefixed(text, closingBar(pen, text), pen.bar('gray'));
};

const cancelled = (pen: Pen, summary: string): string => {
  const text = summary.trim() === '' ? '' : paint(['strikethrough', 'dim'], summary);
  const tail = text !== '' && pen.guide ? `\n${paint('gray', S_BAR)}` : '';
  return `${prefixed(text, closingBar(pen, text), pen.bar('gray'))}${tail}`;
};

const failing = (pen: Pen, look: Look): string => {
  const problem = prefixed(paint('yellow', look.error ?? ''), pen.guide ? `${paint('yellow', S_BAR_END)}  ` : '', '   ');
  return `${look.body.map((line) => pen.bar('yellow') + line).join('\n')}\n${problem}\n`;
};

const live = (pen: Pen, state: State, look: Look): string => {
  const footer = look.footer ?? (pen.guide ? [paint('cyan', S_BAR_END)] : []);
  const colour: Format = state === 'validating' ? 'dim' : 'cyan';
  return `${look.body.map((line) => pen.bar(colour) + line).join('\n')}\n${footer.join('\n')}\n`;
};

/**
 * One frame in clack's shape: the guide above, the state's glyph beside the message, the body
 * behind a bar in the state's colour, and — once answered — the summary dimmed, or struck
 * through when it was cancelled. `withGuide: false` drops every bar and nothing else.
 */
export function frame(opts: CommonOptions, state: State, message: string, look: Look): string {
  const pen = penOf(opts);
  const title = `${pen.guide ? `${paint('gray', S_BAR)}\n` : ''}${prefixed(message, `${symbol(state)}  `, pen.bar('gray'))}\n`;
  if (state === 'submit') return title + submitted(pen, look.summary);
  if (state === 'cancel') return title + cancelled(pen, look.summary);
  if (state === 'error') return title + failing(pen, look);
  return title + live(pen, state, look);
}
