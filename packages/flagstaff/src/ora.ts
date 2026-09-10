/**
 * `flagstaff/ora` — ora 9's public API, ported method for method and graded by ora's own
 * suite through `compat-oracle` (R6, U11). Its eight dependencies come with it: the
 * spinner corpus is `spinners.json` beside this file, the display width is `width.ts`,
 * the colours are `roundel/chalk`, the cursor control is `cursor.ts` (shared with
 * `flagstaff/log-update`, which ports the same chain), and the log symbols, the stdin
 * discarder, the interactivity and unicode probes are the fifty lines below. A migration
 * is one import, and the tree that came with it — nine packages including the transitive
 * ones — is gone (U5, R10).
 *
 * ora's model is the inverse of flagstaff's: the animation is the thing and non-TTY is a
 * fallback, where `hoist()` makes the static projection primary. That is why this file
 * does not sit on `loop.ts` — a façade that reinterpreted its host would fail the host's
 * own tests, which is the only claim we are making here. `hoist()` is the way forward for
 * a program that is choosing; this is the way in for a program that already has ora.
 */
import { Buffer } from 'node:buffer';
import process from 'node:process';

import { lineCount } from 'linegauge';
import chalk from 'roundel/chalk';

import { HIDE_CURSOR, restoreCursorOnExit, SHOW_CURSOR } from './cursor.js';
import spinnerCorpus from './spinners.json' with { type: 'json' };

// ───── the spinner corpus (cli-spinners) ─────

export interface SpinnerDefinition {
  interval?: number;
  frames: string[];
}

/** Every spinner cli-spinners ships, unedited — ora re-exports it and so do we. */
export const spinners: Record<string, SpinnerDefinition> = spinnerCorpus;

// ───── is-unicode-supported, is-interactive ─────

function isUnicodeSupported(): boolean {
  const { env } = process;
  const { TERM, TERM_PROGRAM } = env;
  if (process.platform !== 'win32') return TERM !== 'linux';
  return (
    Boolean(env['WT_SESSION']) ||
    Boolean(env['TERMINUS_SUBLIME']) ||
    env['ConEmuTask'] === '{cmd::Cmder}' ||
    TERM_PROGRAM === 'Terminus-Sublime' ||
    TERM_PROGRAM === 'vscode' ||
    TERM === 'xterm-256color' ||
    TERM === 'alacritty' ||
    TERM === 'rxvt-unicode' ||
    TERM === 'rxvt-unicode-256color' ||
    env['TERMINAL_EMULATOR'] === 'JetBrains-JediTerm'
  );
}

function isInteractive(stream: OraStream | undefined): boolean {
  return Boolean(stream?.isTTY) && process.env['TERM'] !== 'dumb' && !('CI' in process.env);
}

// ───── log-symbols ─────

const UNICODE = isUnicodeSupported();
const logSymbols = {
  info: chalk.blue(UNICODE ? 'ℹ' : 'i'),
  success: chalk.green(UNICODE ? '✔' : '√'),
  warning: chalk.yellow(UNICODE ? '⚠' : '‼'),
  error: chalk.red(UNICODE ? '✖' : '×'),
};

// ───── stdin-discarder ─────

/** Ctrl+C, which raw mode would otherwise swallow while a spinner owns the terminal. */
const ASCII_ETX_CODE = 0x03;

interface RawStdin {
  isTTY?: boolean;
  isRaw?: boolean;
  isPaused(): boolean;
  setRawMode?(raw: boolean): unknown;
  prependListener(event: string, listener: (chunk: unknown) => void): unknown;
  off(event: string, listener: (chunk: unknown) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

class StdinDiscarder {
  #activeCount = 0;
  #stdin: RawStdin | undefined;
  #stdinWasPaused = false;
  #stdinWasRaw = false;

  readonly #handleInput = (chunk: unknown): void => {
    const length = (chunk as { length?: number } | undefined)?.length;
    if (length === undefined || length === 0) return;
    const code = typeof chunk === 'string' ? chunk.codePointAt(0) : (chunk as Uint8Array)[0];
    // Re-signalled rather than emitted, because emitting `SIGINT` directly breaks normal
    // Ctrl+C termination for every library that installed a listener for cleanup.
    if (code === ASCII_ETX_CODE) process.kill(process.pid, 'SIGINT');
  };

  start(): void {
    this.#activeCount += 1;
    if (this.#activeCount === 1) this.#realStart();
  }

  stop(): void {
    if (this.#activeCount === 0) return;
    this.#activeCount -= 1;
    if (this.#activeCount === 0) this.#realStop();
  }

  #realStart(): void {
    const stdin = process.stdin as unknown as RawStdin | undefined;
    if (process.platform === 'win32' || stdin?.isTTY !== true || typeof stdin.setRawMode !== 'function') {
      this.#stdin = undefined;
      return;
    }
    this.#stdin = stdin;
    this.#stdinWasPaused = stdin.isPaused();
    this.#stdinWasRaw = Boolean(stdin.isRaw);
    stdin.setRawMode(true);
    stdin.prependListener('data', this.#handleInput);
    if (this.#stdinWasPaused) stdin.resume();
  }

  #realStop(): void {
    const stdin = this.#stdin;
    if (stdin === undefined) return;
    stdin.off('data', this.#handleInput);
    if (stdin.isTTY === true) stdin.setRawMode?.(this.#stdinWasRaw);
    if (this.#stdinWasPaused) stdin.pause();
    this.#stdin = undefined;
    this.#stdinWasPaused = false;
    this.#stdinWasRaw = false;
  }
}

const stdinDiscarder = new StdinDiscarder();

// ───── ora ─────

/** Milliseconds to wait before re-rendering after a partial chunk was written. */
const RENDER_DEFERRAL_TIMEOUT = 200;
const SYNCHRONIZED_OUTPUT_ENABLE = '\u001B[?2026h';
const SYNCHRONIZED_OUTPUT_DISABLE = '\u001B[?2026l';
/** A spinner with no interval of its own, and no `interval` option. */
const FALLBACK_INTERVAL = 100;
const DEFAULT_COLUMNS = 80;
/** One line of the viewport is kept for the truncation notice. */
const TRUNCATION_RESERVE = 1;

/** Which spinner owns which stream's `write`, so a second one can say so. */
const activeHooksPerStream = new Map<OraStream, Ora>();

const validColors = new Set(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray']);

export type Color = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';

/** What ora writes to: `process.stderr` by default, anything stream-shaped in a test. */
export interface OraStream {
  write(chunk: string, encoding?: unknown, callback?: unknown): boolean;
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  cursorTo?(x: number): unknown;
  moveCursor?(dx: number, dy: number): unknown;
  clearLine?(direction: number): unknown;
  once?(event: string, listener: () => void): unknown;
  removeListener?(event: string, listener: () => void): unknown;
}

/** A prefix or suffix, resolved on every frame when it is a function. */
export type Affix = string | (() => string);

export interface Options {
  text?: string;
  prefixText?: Affix;
  suffixText?: Affix;
  spinner?: SpinnerDefinition | string;
  color?: Color | false;
  hideCursor?: boolean;
  indent?: number;
  interval?: number | undefined;
  stream?: OraStream;
  isEnabled?: boolean;
  isSilent?: boolean;
  discardStdin?: boolean;
}

export interface PersistOptions {
  symbol?: string;
  text?: string;
  prefixText?: Affix;
  suffixText?: Affix;
}

export interface PromiseOptions<T> extends Options {
  successText?: string | ((result: T) => string);
  failText?: string | ((error: unknown) => string);
  successSymbol?: string;
  failSymbol?: string;
}

interface Resolved extends Options {
  color: Color | false;
  stream: OraStream;
  discardStdin: boolean;
  hideCursor: boolean;
  isEnabled: boolean;
  isSilent: boolean;
  indent: number;
}

type Write = OraStream['write'];

function paint(color: Color | false | undefined, text: string): string {
  if (color === undefined || color === false) return text;
  return (chalk as unknown as Record<string, (t: string) => string>)[color]?.(text) ?? text;
}

export class Ora {
  #linesToClear = 0;
  #frameIndex = -1;
  #lastFrameTime = 0;
  #options: Resolved;
  #spinner!: SpinnerDefinition;
  #stream: OraStream;
  #id: ReturnType<typeof setInterval> | undefined;
  #hookedStreams = new Map<OraStream, Write>();
  #isInternalWrite = false;
  #drainHandler: (() => void) | undefined;
  #deferRenderTimer: ReturnType<typeof setTimeout> | undefined;
  #isDiscardingStdin = false;
  #color: Color | false | undefined;

  constructor(options?: Options | string) {
    const given = typeof options === 'string' ? { text: options } : options;
    this.#options = { color: 'cyan', stream: process.stderr as unknown as OraStream, discardStdin: true, hideCursor: true, isEnabled: false, isSilent: false, indent: 0, ...given };

    this.color = this.#options.color;
    this.#stream = this.#options.stream;

    if (typeof given?.isEnabled !== 'boolean') this.#options.isEnabled = isInteractive(this.#stream);
    if (typeof given?.isSilent !== 'boolean') this.#options.isSilent = false;

    if (this.#options.interval !== undefined && !(Number.isInteger(this.#options.interval) && this.#options.interval > 0)) {
      throw new Error('The `interval` option must be a positive integer');
    }

    // Set *after* `this.#stream`, and through the public setters, so the validation in
    // them is the validation a caller gets. The spinner setter clears `interval`, so the
    // caller's own value is put back after it.
    const userInterval = this.#options.interval;
    this.spinner = this.#options.spinner;
    this.#options.interval = userInterval;
    this.text = this.#options.text;
    this.prefixText = this.#options.prefixText;
    this.suffixText = this.#options.suffixText;
    this.indent = this.#options.indent;

    if (process.env['NODE_ENV'] === 'test') this.#exposeTestProperties();
  }

  /**
   * ora's own suite reads its private state through these, and defines them only under
   * `NODE_ENV=test`. Ported because the suite is the grade (R6): without them every
   * assertion about frames or cleared lines reads `undefined`.
   */
  #exposeTestProperties(): void {
    const self = this as unknown as Record<string, unknown>;
    self['_stream'] = this.#stream;
    self['_isEnabled'] = this.#options.isEnabled;
    Object.defineProperty(this, '_linesToClear', {
      get: () => this.#linesToClear,
      set: (value: number) => {
        this.#linesToClear = value;
      },
    });
    Object.defineProperty(this, '_frameIndex', { get: () => this.#frameIndex });
    Object.defineProperty(this, '_lineCount', {
      get: () => {
        const columns = this.#stream.columns ?? DEFAULT_COLUMNS;
        const prefixText = typeof this.#options.prefixText === 'function' ? '' : this.#options.prefixText;
        const suffixText = typeof this.#options.suffixText === 'function' ? '' : this.#options.suffixText;
        const fullPrefixText = typeof prefixText === 'string' && prefixText !== '' ? `${prefixText} ` : '';
        const fullSuffixText = typeof suffixText === 'string' && suffixText !== '' ? ` ${suffixText}` : '';
        const text = typeof this.#options.text === 'string' ? ` ${this.#options.text}` : '';
        return lineCount(`${' '.repeat(this.#options.indent)}${fullPrefixText}-${text}${fullSuffixText}`, columns);
      },
    });
  }

  get indent(): number {
    return this.#options.indent;
  }

  set indent(indent: number | undefined) {
    // `undefined` only — ora's setters take their default through a parameter default, so
    // `null`, `0` and `false` reach the option untouched and its own suite asserts that.
    const value = indent === undefined ? 0 : indent;
    if (!(value >= 0 && Number.isInteger(value))) throw new Error('The `indent` option must be an integer from 0 and up');
    this.#options.indent = value;
  }

  get interval(): number {
    return this.#options.interval ?? this.#spinner.interval ?? FALLBACK_INTERVAL;
  }

  get spinner(): SpinnerDefinition {
    return this.#spinner;
  }

  set spinner(spinner: SpinnerDefinition | string | undefined) {
    this.#frameIndex = -1;
    this.#options.interval = undefined;

    if (typeof spinner === 'object') {
      if (!Array.isArray(spinner.frames) || spinner.frames.length === 0 || spinner.frames.some((frame) => typeof frame !== 'string')) {
        throw new Error('The given spinner must have a non-empty `frames` array of strings');
      }
      if (spinner.interval !== undefined && !(Number.isInteger(spinner.interval) && spinner.interval > 0)) {
        throw new Error('`spinner.interval` must be a positive integer if provided');
      }
      this.#spinner = spinner;
      return;
    }

    const named = spinner === undefined || spinner === 'default' ? undefined : spinners[spinner];
    if (!isUnicodeSupported()) this.#spinner = spinners['line'] as SpinnerDefinition;
    else if (spinner === undefined) this.#spinner = spinners['dots'] as SpinnerDefinition;
    else if (named !== undefined) this.#spinner = named;
    else throw new Error(`There is no built-in spinner named '${spinner}'. See https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json for a full list.`);
  }

  get text(): string {
    return this.#options.text as string;
  }

  set text(value: string | undefined) {
    this.#options.text = value === undefined ? '' : value;
  }

  get prefixText(): Affix {
    return this.#options.prefixText as Affix;
  }

  set prefixText(value: Affix | undefined) {
    this.#options.prefixText = value === undefined ? '' : value;
  }

  get suffixText(): Affix {
    return this.#options.suffixText as Affix;
  }

  set suffixText(value: Affix | undefined) {
    this.#options.suffixText = value === undefined ? '' : value;
  }

  get isSpinning(): boolean {
    return this.#id !== undefined;
  }

  get color(): Color | false | undefined {
    return this.#color;
  }

  set color(value: Color | false | undefined) {
    if (value !== undefined && value !== false && !validColors.has(value)) throw new Error('The `color` option must be a valid color or `false` to disable');
    this.#color = value;
  }

  get isEnabled(): boolean {
    return this.#options.isEnabled && !this.#options.isSilent;
  }

  set isEnabled(value: boolean) {
    if (typeof value !== 'boolean') throw new TypeError('The `isEnabled` option must be a boolean');
    this.#options.isEnabled = value;
  }

  get isSilent(): boolean {
    return this.#options.isSilent;
  }

  set isSilent(value: boolean) {
    if (typeof value !== 'boolean') throw new TypeError('The `isSilent` option must be a boolean');
    this.#options.isSilent = value;
  }

  frame(): string {
    // Throttled to the interval, so a render provoked by an external write does not
    // advance the animation faster than the clock does.
    const now = Date.now();
    if (this.#frameIndex === -1 || now - this.#lastFrameTime >= this.interval) {
      this.#frameIndex = (this.#frameIndex + 1) % this.#spinner.frames.length;
      this.#lastFrameTime = now;
    }

    const frame = paint(this.#color, this.#spinner.frames[this.#frameIndex] ?? '');
    const text = typeof this.#options.text === 'string' ? ` ${this.#options.text}` : '';
    return this.#fullPrefixText() + frame + text + this.#fullSuffixText();
  }

  clear(): this {
    if (!this.isEnabled || this.#stream.isTTY !== true) return this;

    // The cursor helpers call `stream.write` themselves, so the whole block is marked
    // internal or the hook would treat our own erasure as somebody else's output.
    this.#internalWrite(() => {
      this.#stream.cursorTo?.(0);
      for (let index = 0; index < this.#linesToClear; index += 1) {
        if (index > 0) this.#stream.moveCursor?.(0, -1);
        this.#stream.clearLine?.(1);
      }
      if (this.#options.indent) this.#stream.cursorTo?.(this.#options.indent);
      return undefined;
    });

    this.#linesToClear = 0;
    return this;
  }

  render(): this {
    if (!this.isEnabled || this.#drainHandler || this.#deferRenderTimer) return this;

    const useSynchronizedOutput = this.#stream.isTTY === true;
    let shouldDisableSynchronizedOutput = false;

    try {
      if (useSynchronizedOutput) {
        this.#internalWrite(() => this.#stream.write(SYNCHRONIZED_OUTPUT_ENABLE));
        shouldDisableSynchronizedOutput = true;
      }

      this.clear();

      let frameContent = this.frame();
      const columns = this.#stream.columns ?? DEFAULT_COLUMNS;
      const actualLineCount = lineCount(frameContent, columns);

      // Taller than the viewport repaints as garbage, because the erasure can only reach
      // the lines the terminal still holds.
      const consoleHeight = this.#stream.rows;
      if (consoleHeight !== undefined && consoleHeight > 1 && actualLineCount > consoleHeight) {
        const lines = frameContent.split('\n');
        frameContent = [...lines.slice(0, consoleHeight - TRUNCATION_RESERVE), '... (content truncated to fit terminal)'].join('\n');
      }

      const canContinue = this.#internalWrite(() => this.#stream.write(frameContent));

      // Backpressure: stop painting until the stream drains, or the buffer grows without
      // bound behind a slow terminal.
      if (canContinue === false && this.#stream.isTTY === true) {
        this.#drainHandler = () => {
          this.#drainHandler = undefined;
          this.#tryRender();
        };
        this.#stream.once?.('drain', this.#drainHandler);
      }

      this.#linesToClear = lineCount(frameContent, columns);
    } finally {
      if (shouldDisableSynchronizedOutput) this.#internalWrite(() => this.#stream.write(SYNCHRONIZED_OUTPUT_DISABLE));
    }

    return this;
  }

  start(text?: string): this {
    if (text !== undefined) this.text = text;
    if (this.isSilent) return this;

    if (!this.isEnabled) {
      const symbol = this.text ? '-' : '';
      const line = ' '.repeat(this.#options.indent) + this.#buildOutputLine(symbol, this.text, this.#options.prefixText, this.#options.suffixText);
      if (line.trim() !== '') this.#internalWrite(() => this.#stream.write(`${line}\n`));
      return this;
    }

    if (this.isSpinning) return this;

    if (this.#options.hideCursor) this.#hideCursor();
    if (this.#options.discardStdin && process.stdin.isTTY) {
      stdinDiscarder.start();
      this.#isDiscardingStdin = true;
    }

    this.#installHook();
    this.render();
    this.#id = setInterval(this.render.bind(this), this.interval);

    return this;
  }

  stop(): this {
    clearInterval(this.#id);
    this.#id = undefined;
    this.#frameIndex = -1;
    this.#lastFrameTime = 0;

    this.#clearRenderDeferral();
    this.#uninstallHook();

    if (this.#drainHandler) {
      this.#stream.removeListener?.('drain', this.#drainHandler);
      this.#drainHandler = undefined;
    }

    if (this.isEnabled) {
      this.clear();
      if (this.#options.hideCursor) this.#showCursor();
    }

    if (this.#isDiscardingStdin) {
      this.#isDiscardingStdin = false;
      stdinDiscarder.stop();
    }

    return this;
  }

  succeed(text?: string): this {
    return this.stopAndPersist({ symbol: logSymbols.success, ...(text === undefined ? {} : { text }) });
  }

  fail(text?: string): this {
    return this.stopAndPersist({ symbol: logSymbols.error, ...(text === undefined ? {} : { text }) });
  }

  warn(text?: string): this {
    return this.stopAndPersist({ symbol: logSymbols.warning, ...(text === undefined ? {} : { text }) });
  }

  info(text?: string): this {
    return this.stopAndPersist({ symbol: logSymbols.info, ...(text === undefined ? {} : { text }) });
  }

  stopAndPersist(options: PersistOptions = {}): this {
    if (this.isSilent) return this;

    const symbol = options.symbol ?? ' ';
    const text = options.text ?? this.text;
    const prefixText = options.prefixText ?? this.#options.prefixText;
    const suffixText = options.suffixText ?? this.#options.suffixText;
    const textToWrite = `${this.#buildOutputLine(symbol, text, prefixText, suffixText)}\n`;

    this.stop();
    this.#internalWrite(() => this.#stream.write(textToWrite));

    return this;
  }

  // ───── the private half ─────

  /** Run a write of our own with the hook standing aside, so it does not recurse. */
  #internalWrite<T>(fn: () => T): T {
    this.#isInternalWrite = true;
    try {
      return fn();
    } finally {
      this.#isInternalWrite = false;
    }
  }

  #tryRender(): void {
    if (this.isSpinning) this.render();
  }

  #hideCursor(): void {
    if (this.#stream.isTTY !== true) return;
    restoreCursorOnExit();
    this.#stream.write(HIDE_CURSOR);
  }

  #showCursor(): void {
    if (this.#stream.isTTY !== true) return;
    this.#stream.write(SHOW_CURSOR);
  }

  #formatAffix(value: Affix | undefined, separator: string, placeBefore: boolean): string {
    const resolved = typeof value === 'function' ? value() : value;
    if (typeof resolved === 'string' && resolved !== '') return placeBefore ? separator + resolved : resolved + separator;
    return '';
  }

  #fullPrefixText(prefixText: Affix | undefined = this.#options.prefixText, postfix = ' '): string {
    return this.#formatAffix(prefixText, postfix, false);
  }

  #fullSuffixText(suffixText: Affix | undefined = this.#options.suffixText, prefix = ' '): string {
    return this.#formatAffix(suffixText, prefix, true);
  }

  /** One persisted line: prefix, symbol, text, suffix — with no stray separators. */
  #buildOutputLine(symbol: string, text: string | undefined, prefixText: Affix | undefined, suffixText: Affix | undefined): string {
    const separator = symbol ? ' ' : '';
    const fullText = typeof text === 'string' ? separator + text : '';
    return this.#fullPrefixText(prefixText, ' ') + symbol + fullText + this.#fullSuffixText(suffixText, ' ');
  }

  #scheduleRenderDeferral(): void {
    // Already deferred: let the timer that is running finish rather than push it out.
    if (this.#deferRenderTimer) return;
    this.#deferRenderTimer = setTimeout(() => {
      this.#deferRenderTimer = undefined;
      if (this.isSpinning) this.#tryRender();
    }, RENDER_DEFERRAL_TIMEOUT);
    this.#deferRenderTimer.unref?.();
  }

  #clearRenderDeferral(): void {
    if (this.#deferRenderTimer) {
      clearTimeout(this.#deferRenderTimer);
      this.#deferRenderTimer = undefined;
    }
  }

  /**
   * Intercept a stream's writes while the spinner is up, so a `console.log` from anywhere
   * lands above the frame instead of through it. The spinner's own stream plus both
   * process stdio streams — the three a program actually writes to.
   */
  #installHook(): void {
    if (!this.isEnabled || this.#hookedStreams.size > 0) return;
    for (const stream of new Set<OraStream>([this.#stream, process.stdout as unknown as OraStream, process.stderr as unknown as OraStream])) this.#hookStream(stream);
  }

  #hookStream(stream: OraStream | undefined): void {
    if (!stream || this.#hookedStreams.has(stream) || stream.isTTY !== true || typeof stream.write !== 'function') return;

    if (activeHooksPerStream.has(stream)) {
      console.warn('[ora] Multiple concurrent spinners detected. This may cause visual corruption. Use one spinner at a time.');
    }

    const originalWrite = stream.write;
    this.#hookedStreams.set(stream, originalWrite);
    activeHooksPerStream.set(stream, this);
    stream.write = (chunk: string, encoding?: unknown, callback?: unknown): boolean => this.#hookedWrite(stream, originalWrite, chunk, encoding, callback);
  }

  #uninstallHook(): void {
    for (const [stream, originalWrite] of this.#hookedStreams) {
      stream.write = originalWrite;
      if (activeHooksPerStream.get(stream) === this) activeHooksPerStream.delete(stream);
    }
    this.#hookedStreams.clear();
  }

  #hookedWrite(stream: OraStream, originalWrite: Write, chunk: string, encoding?: unknown, callback?: unknown): boolean {
    // `write(chunk, callback)` as well as `write(chunk, encoding, callback)`.
    const [enc, cb] = typeof encoding === 'function' ? [undefined, encoding] : [encoding, callback];

    if (this.#isInternalWrite) return originalWrite.call(stream, chunk, enc, cb);

    // Somebody else's output: take the frame down, let it through, put the frame back.
    this.clear();
    const chunkString = stringifyChunk(chunk, enc);
    const terminatesLine = chunkString.endsWith('\n') || chunkString.endsWith('\r');
    const writeResult = originalWrite.call(stream, chunk, enc, cb);

    // A half-written line is somebody mid-sentence; repainting over it would interleave.
    if (terminatesLine) this.#clearRenderDeferral();
    else if (chunkString.length > 0) this.#scheduleRenderDeferral();

    if (this.isSpinning && !this.#deferRenderTimer) this.render();
    return writeResult;
  }
}

/** Whatever a caller wrote, as the string the hook has to reason about. */
function stringifyChunk(chunk: unknown, encoding: unknown): string {
  if (chunk === undefined || chunk === null) return '';
  if (typeof chunk === 'string') return chunk;
  if (Buffer.isBuffer(chunk) || ArrayBuffer.isView(chunk)) {
    const normalized = typeof encoding === 'string' && encoding !== '' && encoding !== 'buffer' ? encoding : 'utf8';
    return Buffer.from(chunk as Uint8Array).toString(normalized as BufferEncoding);
  }
  return String(chunk);
}

export default function ora(options?: Options | string): Ora {
  return new Ora(options);
}

/** Run an action under a spinner, and land on the right symbol whichever way it ends. */
export async function oraPromise<T>(action: Promise<T> | ((spinner: Ora) => Promise<T>), options?: PromiseOptions<T> | string): Promise<T> {
  const actionIsFunction = typeof action === 'function';
  const actionIsPromise = typeof (action as { then?: unknown } | undefined)?.then === 'function';
  if (!actionIsFunction && !actionIsPromise) throw new TypeError('Parameter `action` must be a Function or a Promise');

  const settings = typeof options === 'object' && options !== null ? options : ({} as PromiseOptions<T>);
  const { successText, failText, successSymbol, failSymbol } = settings;
  const spinner = ora(options).start();

  try {
    const result = await (actionIsFunction ? action(spinner) : action);
    const text = successText === undefined ? undefined : typeof successText === 'string' ? successText : successText(result);
    if (successSymbol === undefined) spinner.succeed(text);
    else spinner.stopAndPersist({ symbol: successSymbol, ...(text === undefined ? {} : { text }) });
    return result;
  } catch (error) {
    const text = failText === undefined ? undefined : typeof failText === 'string' ? failText : failText(error);
    if (failSymbol === undefined) spinner.fail(text);
    else spinner.stopAndPersist({ symbol: failSymbol, ...(text === undefined ? {} : { text }) });
    throw error;
  }
}
