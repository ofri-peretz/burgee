/**
 * The parts of `@clack/prompts` that write rather than ask: `intro`, `outro`, `cancel`,
 * `note`, `log`, `stream`, `spinner`, `tasks` and `group`.
 *
 * **The spinner is where this departs from clack on purpose, and in one direction.** clack
 * animates into any stream it is given, pipes included, and registers its own `SIGINT`,
 * `SIGTERM` and `exit` listeners on `process`. Here the animation runs only on a terminal
 * outside CI; anywhere else a spinner prints each message once and its result once — its
 * static projection, U3 — and the exit path is `closeout/exit-hook`'s, so the restore that
 * hiding the cursor owes is registered in the same call that hides it.
 */
import { performance } from 'node:perf_hooks';

import { hideCursor } from 'closeout/cursor';
import exitHook from 'closeout/exit-hook';
import { visibleWidth, wrap } from 'linegauge/wrap';

import {
  columnsOf,
  type CommonOptions,
  guided,
  isCancel,
  isCI,
  isTTY,
  paint,
  S_BAR,
  S_BAR_END,
  S_BAR_H,
  S_BAR_START,
  S_CONNECT_LEFT,
  S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT,
  S_CORNER_TOP_RIGHT,
  S_ERROR,
  S_INFO,
  S_STEP_CANCEL,
  S_STEP_ERROR,
  S_STEP_SUBMIT,
  S_SUCCESS,
  S_WARN,
  settings,
  unicode,
} from './clack-core.js';
import { processRuntime } from './runtime.js';

type Output = NonNullable<CommonOptions['output']>;
const outputOf = (opts?: CommonOptions): Output => opts?.output ?? processRuntime().stdout;

/** Opens a session: the top of the guide, and a title beside it. */
export const intro = (title = '', opts?: CommonOptions): void => {
  outputOf(opts).write(`${guided(opts ?? {}) ? `${paint('gray', S_BAR_START)}  ` : ''}${title}\n`);
};

/** Closes a session: the end of the guide, and a last message beside it. */
export const outro = (message = '', opts?: CommonOptions): void => {
  outputOf(opts).write(`${guided(opts ?? {}) ? `${paint('gray', S_BAR)}\n${paint('gray', S_BAR_END)}  ` : ''}${message}\n\n`);
};

/** Closes a session that was cancelled: the end of the guide, and the message in red. */
export const cancel = (message = '', opts?: CommonOptions): void => {
  outputOf(opts).write(`${guided(opts ?? {}) ? `${paint('gray', S_BAR_END)}  ` : ''}${paint('red', message)}\n\n`);
};

export interface LogMessageOptions extends CommonOptions {
  symbol?: string;
  spacing?: number;
  secondarySymbol?: string;
}

/** One line of a log message: beside its mark when the guide is on, and an empty line is the mark alone. */
function logLine(line: string, mark: string, guide: boolean): string {
  if (!guide) return line;
  return line.length > 0 ? `${mark}  ${line}` : mark;
}

/** A message on the guide: the first line beside `symbol`, the rest beside the bar. */
function message(text: string | string[] = [], opts: LogMessageOptions = {}): void {
  const first = opts.symbol ?? paint('gray', S_BAR);
  const rest = opts.secondarySymbol ?? paint('gray', S_BAR);
  const guide = guided(opts);
  const spacing: string[] = Array.from({ length: opts.spacing ?? 1 }, () => (guide ? rest : ''));
  const lines = (Array.isArray(text) ? text : text.split('\n')).map((line, i) => logLine(line, i === 0 ? first : rest, guide));
  outputOf(opts).write(`${[...spacing, ...lines].join('\n')}\n`);
}

const warn = (text: string, opts?: LogMessageOptions): void => {
  message(text, { ...opts, symbol: paint('yellow', S_WARN) });
};

/** clack's `log`: a message on the guide, with a symbol for its kind. */
export const log = {
  message,
  info: (text: string, opts?: LogMessageOptions): void => {
    message(text, { ...opts, symbol: paint('blue', S_INFO) });
  },
  success: (text: string, opts?: LogMessageOptions): void => {
    message(text, { ...opts, symbol: paint('green', S_SUCCESS) });
  },
  step: (text: string, opts?: LogMessageOptions): void => {
    message(text, { ...opts, symbol: paint('green', S_STEP_SUBMIT) });
  },
  warn,
  /** An alias for `log.warn()`. */
  warning: warn,
  error: (text: string, opts?: LogMessageOptions): void => {
    message(text, { ...opts, symbol: paint('red', S_ERROR) });
  },
};

type Chunks = Iterable<string> | AsyncIterable<string>;

/** A message written as its chunks arrive — for text a model is still producing. */
async function streamed(chunks: Chunks, { symbol = paint('gray', S_BAR) }: LogMessageOptions = {}): Promise<void> {
  const output = processRuntime().stdout;
  const bar = `${paint('gray', S_BAR)}  `;
  output.write(`${paint('gray', S_BAR)}\n${symbol}  `);
  for await (const chunk of chunks) output.write(chunk.replaceAll('\n', `\n${bar}`));
  output.write('\n');
}

const streamWarn = (chunks: Chunks): Promise<void> => streamed(chunks, { symbol: paint('yellow', S_WARN) });

/** clack's `stream`: `log`, for text that arrives in pieces. */
export const stream = {
  message: streamed,
  info: (chunks: Chunks): Promise<void> => streamed(chunks, { symbol: paint('blue', S_INFO) }),
  success: (chunks: Chunks): Promise<void> => streamed(chunks, { symbol: paint('green', S_SUCCESS) }),
  step: (chunks: Chunks): Promise<void> => streamed(chunks, { symbol: paint('green', S_STEP_SUBMIT) }),
  warn: streamWarn,
  warning: streamWarn,
  error: (chunks: Chunks): Promise<void> => streamed(chunks, { symbol: paint('red', S_ERROR) }),
};

export interface NoteOptions extends CommonOptions {
  /** Applied to every line of the message. */
  format?: (line: string) => string;
}

const unchanged = (line: string): string => line;

/** The columns a note's box takes on each side of its text: bars, padding and the guide. */
const NOTE_CHROME = 6;

/** A message in a box on the guide, with a title in its top edge. */
export const note = (text = '', title = '', opts?: NoteOptions): void => {
  const output = outputOf(opts);
  const format = opts?.format ?? unchanged;
  const body = ['', ...wrap(text, columnsOf(output) - NOTE_CHROME, { hard: true, trim: false }).split('\n').map(format), ''];
  const titleWidth = visibleWidth(title);
  const inner = Math.max(...body.map(visibleWidth), titleWidth) + 2;
  const rows = body.map((line) => `${paint('gray', S_BAR)}  ${line}${' '.repeat(inner - visibleWidth(line))}${paint('gray', S_BAR)}`).join('\n');
  const guide = guided(opts ?? {});
  const top = `${paint('green', S_STEP_SUBMIT)}  ${paint('reset', title)} ${paint('gray', S_BAR_H.repeat(Math.max(inner - titleWidth - 1, 1)) + S_CORNER_TOP_RIGHT)}`;
  const bottom = paint('gray', (guide ? S_CONNECT_LEFT : S_CORNER_BOTTOM_LEFT) + S_BAR_H.repeat(inner + 2) + S_CORNER_BOTTOM_RIGHT);
  output.write(`${guide ? `${paint('gray', S_BAR)}\n` : ''}${top}\n${rows}\n${bottom}\n`);
};

export interface SpinnerOptions extends CommonOptions {
  indicator?: 'dots' | 'timer';
  onCancel?: () => void;
  cancelMessage?: string;
  errorMessage?: string;
  frames?: string[];
  delay?: number;
  styleFrame?: (frame: string) => string;
}

export interface SpinnerResult {
  start(msg?: string): void;
  stop(msg?: string): void;
  cancel(msg?: string): void;
  error(msg?: string): void;
  message(msg?: string): void;
  clear(): void;
  readonly isCancelled: boolean;
}

const CSI = '\u001B[';
const eraseLines = (lines: number): string => `${lines > 1 ? `${CSI}${String(lines - 1)}A` : ''}${CSI}1G${CSI}J`;

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const elapsed = (since: number): string => {
  const seconds = (performance.now() - since) / MS_PER_SECOND;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = Math.floor(seconds % SECONDS_PER_MINUTE);
  return minutes > 0 ? `[${String(minutes)}m ${String(rest)}s]` : `[${String(rest)}s]`;
};

/** clack's frame delays: a unicode spinner turns faster than an ASCII one. */
const UNICODE_DELAY = 80;
const ASCII_DELAY = 120;
/** The trailing dots grow to three, an eighth of a dot per frame, then start again. */
const MAX_DOTS = 3;
const DOT_LIMIT = 4;
const DOT_STEP = 0.125;

const magenta = (glyph: string): string => paint('magenta', glyph);
const withoutDots = (msg: string): string => msg.replace(/\.+$/, '');
const noop = (): void => undefined;

/** How a spinner ends: answered, cancelled, or failed. */
type Ending = 'stop' | 'cancel' | 'error';
function endGlyph(ending: Ending): string {
  if (ending === 'stop') return paint('green', S_STEP_SUBMIT);
  return paint('red', ending === 'cancel' ? S_STEP_CANCEL : S_STEP_ERROR);
}

/** A spinner on the guide: animated on a terminal, printed once per message anywhere else. */
class Spinner implements SpinnerResult {
  private spinning = false;
  private cancelled = false;
  private text = '';
  private drawn = '';
  private since = performance.now();
  private timer: ReturnType<typeof setInterval> | undefined;
  private restore = noop;
  private unhook = noop;
  private readonly live: boolean;
  private readonly output: Output;
  private readonly frames: string[];
  private readonly style: (frame: string) => string;

  constructor(private readonly opts: SpinnerOptions) {
    this.output = opts.output ?? processRuntime().stdout;
    this.live = !isCI() && isTTY(this.output);
    this.frames = opts.frames ?? (unicode ? ['◒', '◐', '◓', '◑'] : ['•', 'o', 'O', '0']);
    this.style = opts.styleFrame ?? magenta;
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  private line(glyph: string, dots: number): string {
    if (this.opts.indicator === 'timer') return `${glyph}  ${this.text} ${elapsed(this.since)}`;
    return `${glyph}  ${this.text}${'.'.repeat(Math.floor(dots)).slice(0, MAX_DOTS)}`;
  }

  private readonly onAbort = (): void => {
    this.interrupt('cancel');
  };

  /** A signal or an exit while spinning: end on the configured message, and tell `onCancel`. */
  private interrupt(ending: 'cancel' | 'error'): void {
    const msg = ending === 'error' ? (this.opts.errorMessage ?? settings.messages.error) : (this.opts.cancelMessage ?? settings.messages.cancel);
    const wasSpinning = this.spinning;
    this.cancelled = ending === 'cancel';
    this.end(msg, ending);
    if (wasSpinning && this.cancelled) this.opts.onCancel?.();
  }

  private animate(): void {
    this.restore = hideCursor(this.output, exitHook);
    let frame = 0;
    let dots = 0;
    const tick = (): void => {
      const next = wrap(this.line(this.style(this.frames[frame] ?? ''), dots), columnsOf(this.output), { hard: true, trim: false });
      this.output.write((this.drawn === '' ? '' : eraseLines(this.drawn.split('\n').length)) + next);
      this.drawn = next;
      frame = (frame + 1) % this.frames.length;
      dots = dots < DOT_LIMIT ? dots + DOT_STEP : 0;
    };
    tick();
    this.timer = setInterval(tick, this.opts.delay ?? (unicode ? UNICODE_DELAY : ASCII_DELAY));
  }

  start(msg = ''): void {
    this.spinning = true;
    this.cancelled = false;
    this.text = withoutDots(msg);
    this.since = performance.now();
    if (guided(this.opts)) this.output.write(`${paint('gray', S_BAR)}\n`);
    this.opts.signal?.addEventListener('abort', this.onAbort, { once: true });
    this.unhook = exitHook(this.onAbort);
    if (this.live) this.animate();
    else this.output.write(`${this.style(this.frames[0] ?? '')}  ${this.text}...\n`);
  }

  private end(msg: string, ending: Ending, silent = false): void {
    if (!this.spinning) return;
    this.spinning = false;
    clearInterval(this.timer);
    this.opts.signal?.removeEventListener('abort', this.onAbort);
    if (this.live && this.drawn !== '') this.output.write(eraseLines(this.drawn.split('\n').length));
    this.text = msg === '' ? this.text : msg;
    const glyph = endGlyph(ending);
    const timer = this.opts.indicator === 'timer' ? ` ${elapsed(this.since)}` : '';
    if (!silent) this.output.write(`${glyph}  ${this.text}${timer}\n`);
    this.unhook();
    this.restore();
  }

  stop(msg = ''): void {
    this.end(msg, 'stop');
  }

  cancel(msg = ''): void {
    this.cancelled = true;
    this.end(msg, 'cancel');
  }

  error(msg = ''): void {
    this.end(msg, 'error');
  }

  message(msg = ''): void {
    const next = withoutDots(msg === '' ? this.text : msg);
    if (!this.live && this.spinning && next !== this.text) this.output.write(`${this.style(this.frames[0] ?? '')}  ${next}...\n`);
    this.text = next;
  }

  clear(): void {
    this.end('', 'stop', true);
  }
}

/** A spinner on the guide: animated on a terminal outside CI, printed once per message anywhere else. */
export const spinner = (opts: SpinnerOptions = {}): SpinnerResult => {
  const spin = new Spinner(opts);
  // Bound, because clack's are plain functions: `tasks` hands `spin.message` to a task as a
  // bare callback, and so may any caller.
  return {
    start: spin.start.bind(spin),
    stop: spin.stop.bind(spin),
    cancel: spin.cancel.bind(spin),
    error: spin.error.bind(spin),
    message: spin.message.bind(spin),
    clear: spin.clear.bind(spin),
    get isCancelled() {
      return spin.isCancelled;
    },
  };
};

export interface Task {
  title: string;
  task: (message: (string: string) => void) => string | Promise<string> | void | Promise<void>;
  enabled?: boolean;
}

/** Run tasks one after another, each under its own spinner, each ending on what it returned. */
export const tasks = async (list: Task[], opts?: CommonOptions): Promise<void> => {
  for (const item of list.filter((task) => task.enabled !== false)) {
    const spin = spinner(opts);
    spin.start(item.title);
    // eslint-disable-next-line reliability/no-await-in-loop -- tasks run one after another by definition; each spinner ends before the next starts
    const result = await item.task(spin.message);
    spin.stop(typeof result === 'string' && result !== '' ? result : item.title);
  }
};

type Prettify<T> = { [P in keyof T]: T[P] } & {};

/** What a group resolves to: every prompt's answer, with the cancel symbol taken out of the type. */
export type PromptGroupAwaitedReturn<T> = { [P in keyof T]: Exclude<Awaited<T[P]>, symbol> };

export interface PromptGroupOptions<T> {
  /** Called when a prompt in the group is cancelled, with the answers so far. */
  onCancel?: (opts: { results: Prettify<Partial<PromptGroupAwaitedReturn<T>>> }) => void;
}

/** A named set of prompts, each told the answers before it. */
export type PromptGroup<T> = {
  [P in keyof T]: (opts: { results: Prettify<Partial<PromptGroupAwaitedReturn<Omit<T, P>>>> }) => undefined | Promise<T[P] | undefined>;
};

/** Ask a set of prompts in order; a cancelled one is recorded as `'canceled'` when `onCancel` is given. */
export const group = async <T>(prompts: PromptGroup<T>, opts?: PromptGroupOptions<T>): Promise<Prettify<PromptGroupAwaitedReturn<T>>> => {
  const results = new Map<string, unknown>();
  const soFar = (): never => Object.fromEntries(results) as never;
  for (const [name, ask] of Object.entries(prompts) as [string, (opts: { results: never }) => Promise<unknown> | undefined][]) {
    // eslint-disable-next-line reliability/no-await-in-loop -- each prompt is handed the answers before it, so they cannot run at once
    const answer = await ask({ results: soFar() });
    const cancelledHere = typeof opts?.onCancel === 'function' && isCancel(answer);
    results.set(name, cancelledHere ? 'canceled' : answer);
    if (cancelledHere) opts.onCancel?.({ results: soFar() });
  }
  return soFar();
};
