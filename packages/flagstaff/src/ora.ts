/**
 * `flagstaff/ora` — ora 10's public API, ported method for method and graded by ora's own
 * suite through `compat-oracle` (R6, U11). Its eight dependencies come with it: the
 * spinner corpus is `spinners.json` beside this file, the display width is `width.ts`,
 * the colours are `roundel/chalk`, the cursor control is `closeout` (shared with
 * `flagstaff/log-update`, which ports the same chain), the unicode probe is
 * `roundel/terminal`'s, and the log symbols, the stdin discarder and the interactivity probe
 * are the lines below. A migration is one import, and the tree that came with it — nine
 * packages including the transitive ones — is gone (U5, R10).
 *
 * ora's model is the inverse of flagstaff's: the animation is the thing and non-TTY is a
 * fallback, where `hoist()` makes the static projection primary. That is why this file
 * does not sit on `loop.ts` — a façade that reinterpreted its host would fail the host's
 * own tests, which is the only claim we are making here. `hoist()` is the way forward for
 * a program that is choosing; this is the way in for a program that already has ora.
 */
import { Buffer } from 'node:buffer';

import { HIDE_CURSOR, type InputStream, rawMode, type Registrar, SHOW_CURSOR } from 'closeout/cursor';
import restoreCursor from 'closeout/restore-cursor';
import { strip } from 'linegauge';
import { width } from 'linegauge/v8';
import { beginSynchronizedOutput, endSynchronizedOutput } from 'paratext/csi';
import chalk from 'roundel/chalk';
import { unicode } from 'roundel/terminal';

import { processRuntime } from './runtime.js';
import spinnerCorpus from './spinners.json' with { type: 'json' };

/**
 * The process, through the seam (Y9). `processRuntime()` hands back the live process
 * narrowed to `Runtime`, so nothing below moved: `rt.env` is read when a probe runs,
 * `rt.stderr` when a spinner is constructed, `rt.stdout`/`rt.stderr` when the hook is
 * installed (ora mutates those two objects, and it must be those two), and `rt.kill` is
 * looked up when Ctrl+C is swallowed — which is the one ora's own suite swaps.
 */
const rt = processRuntime();

// ───── the spinner corpus (cli-spinners) ─────

export interface SpinnerDefinition {
  interval?: number;
  frames: string[];
}

/** Every spinner cli-spinners ships, unedited — ora re-exports it and so do we. */
export const spinners: Record<string, SpinnerDefinition> = spinnerCorpus;

// ───── is-interactive (is-unicode-supported is roundel's `unicode`) ─────

function isInteractive(stream: OraStream | undefined): boolean {
  return Boolean(stream?.isTTY) && rt.env['TERM'] !== 'dumb' && !('CI' in rt.env);
}

// ───── log-symbols ─────

const UNICODE = unicode(rt);
const logSymbols = {
  info: chalk.blue(UNICODE ? 'ℹ' : 'i'),
  success: chalk.green(UNICODE ? '✔' : '√'),
  warning: chalk.yellow(UNICODE ? '⚠' : '‼'),
  error: chalk.red(UNICODE ? '✖' : '×'),
};

// ───── stdin-discarder ─────

/** Ctrl+C, which raw mode would otherwise swallow while a spinner owns the terminal. */
const ASCII_ETX_CODE = 0x03;

interface RawStdin extends InputStream {
  isPaused(): boolean;
  prependListener(event: string, listener: (chunk: unknown) => void): unknown;
  off(event: string, listener: (chunk: unknown) => void): unknown;
  resume(): unknown;
  pause(): unknown;
}

/**
 * No exit handler, as stdin-discarder registers none: the process's own stdin is the only
 * stream this ever touches, and Node puts that back in cooked mode as it exits.
 */
const atExitNothing: Registrar = () => () => undefined;

/**
 * stdin-discarder's lifecycle, with raw mode through `closeout/cursor`'s `rawMode`. The pairing
 * is what the incumbent did by hand — note `isRaw` on the way in, write it back on the way out —
 * with the ownership rule stated once in closeout: a stream somebody else put into raw mode is
 * left in it.
 */
class StdinDiscarder {
  #activeCount = 0;
  #stdin: RawStdin | undefined;
  #stdinWasPaused = false;
  #unraw: () => void = () => undefined;

  readonly #handleInput = (chunk: unknown): void => {
    const length = (chunk as { length?: number } | undefined)?.length;
    if (length === undefined || length === 0) return;
    const code = typeof chunk === 'string' ? chunk.codePointAt(0) : (chunk as Uint8Array)[0];
    // Re-signalled rather than emitted, because emitting `SIGINT` directly breaks normal
    // Ctrl+C termination for every library that installed a listener for cleanup.
    if (code === ASCII_ETX_CODE) rt.kill(rt.pid, 'SIGINT');
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
    const stdin = rt.stdin as unknown as RawStdin | undefined;
    if (rt.platform === 'win32' || stdin?.isTTY !== true || typeof stdin.setRawMode !== 'function') {
      this.#stdin = undefined;
      return;
    }
    this.#stdin = stdin;
    this.#stdinWasPaused = stdin.isPaused();
    this.#unraw = rawMode(stdin, atExitNothing);
    stdin.prependListener('data', this.#handleInput);
    if (this.#stdinWasPaused) stdin.resume();
  }

  #realStop(): void {
    const stdin = this.#stdin;
    if (stdin === undefined) return;
    stdin.off('data', this.#handleInput);
    this.#unraw();
    if (this.#stdinWasPaused) stdin.pause();
    this.#stdin = undefined;
    this.#stdinWasPaused = false;
  }
}

const stdinDiscarder = new StdinDiscarder();

// ───── ora ─────

/** A spinner with no interval of its own, and no `interval` option. */
const FALLBACK_INTERVAL = 100;
/** What a stream that reports no columns, or `0` while its window is minimised, is laid out at. */
const DEFAULT_COLUMNS = 80;
const TRUNCATION_MESSAGE = '... (content truncated to fit terminal)';
/** Put before the truncation message, so a style a dropped line would have closed cannot colour it. */
const STYLE_RESET = '\u001B[0m';
/** Terminals advance a tab to the next multiple of this. */
const TAB_STOP = 8;

let graphemes: Intl.Segmenter | undefined;
/** Built on first use, so a program that only ever writes ASCII never constructs one. */
const segmenter = (): Intl.Segmenter => (graphemes ??= new Intl.Segmenter());

/** The segmenter joins CR and LF into one grapheme, so the three controls are split out first. */
const CONTROL_CHARACTER = /([\t\n\r])/u;
/** One cell per character, which skips the segmenter. */
const PRINTABLE_ASCII = /^[ -~]+$/u;

/** The cells a tab covers from `column`, stopping on the last cell of the row. */
const tabStopWidth = (column: number, columns: number): number => {
  const nextStop = Math.floor(column / TAB_STOP) * TAB_STOP + TAB_STOP;
  return Math.max(0, Math.min(nextStop, columns - 1) - column);
};

/** Text laid out the way a terminal shows it. */
interface Layout {
  /** One array of cells per row; a wide grapheme's further cells are `''`. */
  rows: string[][];
  /** The text with tabs expanded and escapes removed, to lay out again after a resize. */
  expandedText: string;
}

/**
 * ora 10's `layOut`, which replaced the line count ora 9 took from `string-width` per line.
 *
 * A line feed starts a new row at its start, because a terminal device writes it as CR LF even
 * in raw mode. A carriage return goes back to the start of the row without erasing it. A row
 * only ends when a grapheme no longer fits, and a tab moves to the next stop without erasing
 * what it passes over. The width of a grapheme is `linegauge`'s, graded level with
 * string-width, which is what ora measures with.
 */
function layOut(text: string, columns: number): Layout {
  const rows: string[][] = [];
  let cells: string[] = [];
  let column = 0;
  let expandedText = '';

  const startRow = (): void => {
    cells = [];
    column = 0;
    rows.push(cells);
  };

  const writeGrapheme = (grapheme: string, cellWidth: number): void => {
    // A grapheme without width, such as a bell, takes no cell.
    if (cellWidth === 0) return;
    if (column + cellWidth > columns) startRow();
    cells[column++] = grapheme;
    for (let index = 1; index < cellWidth; index += 1) cells[column++] = '';
  };

  const writeTab = (): void => {
    const end = column + tabStopWidth(column, columns);
    expandedText += ' '.repeat(end - column);
    for (; column < end; column += 1) cells[column] ??= ' ';
  };

  startRow();

  for (const part of strip(text).split(CONTROL_CHARACTER)) {
    if (part === '\t') {
      writeTab();
      continue;
    }
    expandedText += part;
    if (part === '\n') startRow();
    else if (part === '\r') column = 0;
    else if (PRINTABLE_ASCII.test(part)) for (const character of part) writeGrapheme(character, 1);
    else for (const { segment } of segmenter().segment(part)) writeGrapheme(segment, width(segment));
  }

  return { rows, expandedText };
}

const rowCount = (text: string, columns: number): number => layOut(text, columns).rows.length;

/** Which spinner owns which stream's `write`, so a second one can say so. */
const activeHooksPerStream = new Map<OraStream, Ora>();

/**
 * Every installed write hook: what it wrapped, and whether its spinner still runs.
 *
 * Spinners stop in any order, and a hook cannot be cut out of the middle of a chain — the one
 * above holds it as its "original". So a stopped hook becomes a pass-through, and whoever
 * stops unwinds every stopped hook off the top. Restoring "the write I found" instead put a
 * stopped spinner's wrapper back for good when A started, B started, A stopped, B stopped
 * (`.sdlc/models/save-restore.qnt`). ora 10 fixed the same bug its own way — it keeps the
 * stream's real `write` and restores it when the last spinner on the stream stops — and the
 * two leave `write` the same once every spinner has stopped, which is what its suite asserts.
 */
const writeHooks = new WeakMap<Write, { wrapped: Write; live: boolean }>();

const validColors = new Set(['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray']);

export type Color = 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray';

/** What ora writes to: the runtime's stderr by default, anything stream-shaped in a test. */
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

/** A stream whose cursor can be moved, which is what erasing a frame needs. */
type CursorStream = OraStream & Required<Pick<OraStream, 'cursorTo' | 'moveCursor' | 'clearLine'>>;

/** A prefix or suffix, resolved on every frame when it is a function. */
export type Affix = string | (() => string);

// ora's own type names, so a typed program migrates by its import alone — `burgee migrate`
// checks every imported name against this module and would otherwise leave the import on ora.
export type Spinner = SpinnerDefinition;
export type PrefixTextGenerator = () => string;
export type SuffixTextGenerator = () => string;

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

function formatAffix(value: Affix | undefined, separator: string, placeBefore: boolean): string {
  const resolved = typeof value === 'function' ? value() : value;
  if (typeof resolved === 'string' && resolved !== '') return placeBefore ? separator + resolved : resolved + separator;
  return '';
}

/**
 * One line — prefix, symbol, text, suffix. Each part is separated from what comes before it only
 * when there is something there, so nothing leaves a double space; an empty text still gets the
 * separator after the symbol, so the suffix does not add a second one.
 */
function buildOutputLine(symbol: string, text: string | undefined, prefixText: Affix | undefined, suffixText: Affix | undefined): string {
  const hasSymbol = symbol !== '';
  const hasText = typeof text === 'string' && text !== '';
  const fullPrefixText = formatAffix(prefixText, hasSymbol || hasText ? ' ' : '', false);
  const fullText = typeof text === 'string' ? (hasSymbol ? ' ' : '') + text : '';
  const bodyEndsWithSeparator = hasSymbol && text === '';
  return fullPrefixText + symbol + fullText + formatAffix(suffixText, bodyEndsWithSeparator ? '' : ' ', true);
}

export class Ora {
  #linesToClear = 0;
  #frameIndex = -1;
  #lastFrameTime = 0;
  #renderedFrame: string | undefined;
  #renderedColumns: number | undefined;
  #options: Resolved;
  #spinner!: SpinnerDefinition;
  #stream: OraStream;
  #id: ReturnType<typeof setInterval> | undefined;
  #hookedStreams = new Map<OraStream, Write>();
  #isInternalWrite = false;
  #drainHandler: (() => void) | undefined;
  #hasUnfinishedLine = false;
  #isDiscardingStdin = false;
  #color: Color | false | undefined;

  constructor(options?: Options | string) {
    const given = typeof options === 'string' ? { text: options } : options;
    this.#options = { color: 'cyan', stream: rt.stderr as unknown as OraStream, discardStdin: true, hideCursor: true, isEnabled: false, isSilent: false, indent: 0, ...given };

    this.color = this.#options.color;
    // Spreading the options over the defaults can set `stream` to `undefined`.
    this.#stream = this.#options.stream ?? (rt.stderr as unknown as OraStream);

    if (typeof given?.isEnabled !== 'boolean') this.#options.isEnabled = isInteractive(this.#stream);
    if (typeof given?.isSilent !== 'boolean') this.#options.isSilent = false;

    if (this.#options.interval !== undefined && !(Number.isSafeInteger(this.#options.interval) && this.#options.interval > 0)) {
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

    if (rt.env['NODE_ENV'] === 'test') this.#exposeTestProperties();
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
    Object.defineProperty(this, '_renderedFrame', { get: () => this.#renderedFrame });
    Object.defineProperty(this, '_renderedColumns', { get: () => this.#renderedColumns });
    Object.defineProperty(this, '_lineCount', {
      // The line `frame()` builds, without calling a function affix, so reading this has no side effect.
      get: () => {
        const { prefixText, suffixText } = this.#options;
        const line = buildOutputLine('-', this.#options.text, typeof prefixText === 'function' ? '' : prefixText, typeof suffixText === 'function' ? '' : suffixText);
        return rowCount(' '.repeat(this.#options.indent) + line, this.#columns);
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
    if (!(value >= 0 && Number.isSafeInteger(value))) throw new Error('The `indent` option must be an integer from 0 and up');
    this.#options.indent = value;
  }

  get interval(): number {
    return this.#options.interval ?? this.#spinner.interval ?? FALLBACK_INTERVAL;
  }

  get spinner(): SpinnerDefinition {
    return this.#spinner;
  }

  set spinner(spinner: SpinnerDefinition | string | undefined) {
    // `typeof null` is `'object'`, so null is kept out here and reaches the name check.
    if (typeof spinner === 'object' && spinner !== null) {
      if (!Array.isArray(spinner.frames) || spinner.frames.length === 0 || spinner.frames.some((frame) => typeof frame !== 'string')) {
        throw new Error('The given spinner must have a non-empty `frames` array of strings');
      }
      if (spinner.interval !== undefined && !(Number.isSafeInteger(spinner.interval) && spinner.interval > 0)) {
        throw new Error('`spinner.interval` must be a positive integer if provided');
      }
      this.#spinner = spinner;
    } else if (spinner !== undefined && (spinner === 'default' || !Object.hasOwn(spinners, spinner as string))) {
      // The name is checked before the terminal is, so a wrong name throws on every terminal.
      throw new Error(`There is no built-in spinner named '${String(spinner)}'. See https://github.com/sindresorhus/cli-spinners/blob/main/spinners.json for a full list.`);
    } else {
      this.#spinner = (unicode(rt) ? spinners[spinner ?? 'dots'] : spinners['line']) as SpinnerDefinition;
    }

    // Only touched once the new spinner is known to be valid.
    this.#frameIndex = -1;
    this.#options.interval = undefined;

    // The render interval comes from the spinner, so a running timer picks up the new one, and
    // the new spinner shows now rather than after a first tick that can be long.
    if (!this.isSpinning) return;
    this.#startRenderTimer();
    this.render();
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
    return ' '.repeat(this.#options.indent) + buildOutputLine(frame, this.text, this.#options.prefixText, this.#options.suffixText);
  }

  clear(): this {
    if (!this.isEnabled) return this;
    this.#clearDisplay();
    return this;
  }

  /**
   * A stream without the readline cursor methods — a CI log stream that reports a TTY — gets
   * the frame written where the cursor is. Unfinished external output is left alone until its
   * newline, with no timeout: resized rows cannot be counted reliably, and a replay would
   * duplicate rows already in scrollback.
   */
  render(): this {
    if (!this.isEnabled || this.#drainHandler || this.#hasUnfinishedLine) return this;

    // Built before anything is written, so a throwing affix function leaves the screen as it was.
    let frameContent = this.frame();
    const useSynchronizedOutput = this.#stream.isTTY === true;
    let shouldDisableSynchronizedOutput = false;

    try {
      if (useSynchronizedOutput) {
        this.#internalWrite(() => this.#stream.write(beginSynchronizedOutput));
        shouldDisableSynchronizedOutput = true;
      }

      // Erasing the previous frame leaves the cursor at the start of a row; otherwise it is moved there.
      if (this.#linesToClear > 0) this.#clearDisplay();
      else if (this.#canMoveCursor(this.#stream)) {
        const stream = this.#stream;
        this.#internalWrite(() => stream.cursorTo(0));
      }

      const columns = this.#columns;
      let layout = layOut(frameContent, columns);

      // A frame that scrolls cannot be erased, so it stays above the last row. A terminal cannot
      // report its cursor row, so the bound is the screen's, and earlier output can still scroll.
      const rows = this.#stream.rows;
      const maxRows = rows !== undefined && rows > 1 ? rows - 1 : undefined;
      if (maxRows !== undefined && layout.rows.length > maxRows) {
        frameContent = truncateFrame(frameContent, columns, maxRows);
        layout = layOut(frameContent, columns);
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

      this.#linesToClear = layout.rows.length;
      this.#renderedFrame = layout.expandedText;
      this.#renderedColumns = columns;
    } finally {
      if (shouldDisableSynchronizedOutput) this.#internalWrite(() => this.#stream.write(endSynchronizedOutput));
    }

    return this;
  }

  start(text?: string): this {
    if (text !== undefined) this.text = text;

    // A call while spinning or silent only updates the text, even if output was disabled while spinning.
    if (this.isSpinning || this.isSilent) return this;

    if (!this.isEnabled) {
      const symbol = this.text ? '-' : '';
      const line = ' '.repeat(this.#options.indent) + buildOutputLine(symbol, this.text, this.#options.prefixText, this.#options.suffixText);
      if (line.trim() !== '') this.#internalWrite(() => this.#stream.write(`${line}\n`));
      return this;
    }

    if (this.#options.hideCursor) this.#hideCursor();
    if (this.#options.discardStdin && rt.stdin.isTTY) {
      stdinDiscarder.start();
      this.#isDiscardingStdin = true;
    }

    this.#installHook();

    try {
      this.render();
    } catch (error) {
      // The hooks, stdin and the hidden cursor are given back before the error reaches the caller.
      this.#release();
      this.#showCursor();
      throw error;
    }

    this.#startRenderTimer();
    return this;
  }

  stop(): this {
    // The state from `start()`, as `isEnabled` and `isSilent` can change while spinning.
    const wasSpinning = this.isSpinning;
    this.#release();

    // Best effort: the stream may be what failed.
    try {
      this.#clearDisplay();
    } catch {
      // The teardown above is done; an erase that cannot be written is not the caller's error.
    }

    if (wasSpinning) this.#showCursor();
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

  stopAndPersist(options?: PersistOptions | null): this {
    // An unfinished external line is ended first, so the persisted one starts on a row of its own.
    const hasUnfinishedLine = this.#hasUnfinishedLine;
    this.stop();
    if (this.isSilent) return this;

    const symbolText = String(options?.symbol ?? ' ');
    // The log symbols are coloured for a terminal, so a stream that cannot render colour gets them plain.
    const symbol = this.isEnabled && this.#stream.isTTY === true ? symbolText : strip(symbolText);
    const text = options?.text ?? this.text;
    const prefixText = options?.prefixText ?? this.#options.prefixText;
    const suffixText = options?.suffixText ?? this.#options.suffixText;

    // The indent is part of the content, so the cursor is left at the start of the line.
    const textToWrite = `${hasUnfinishedLine ? '\n' : ''}${' '.repeat(this.#options.indent)}${buildOutputLine(symbol, text, prefixText, suffixText)}\n`;
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

  /**
   * A render with no caller to hand an error to — a timer tick, a drain, the render after an
   * external write — stops the spinner instead of throwing: a throwing affix function or a
   * broken stream would otherwise take the process down from a timer, or throw at the
   * program's own `write`. The frame stays counted for `stop()` to erase.
   */
  #tryRender(): void {
    if (!this.isSpinning) return;
    try {
      this.render();
    } catch {
      this.#release();
      this.#showCursor();
    }
  }

  /** Give back the timer, the stream hooks and stdin, without writing to a stream that may have failed. */
  #release(): void {
    clearInterval(this.#id);
    this.#id = undefined;
    this.#frameIndex = -1;
    this.#lastFrameTime = 0;

    this.#uninstallHook();

    if (this.#drainHandler) {
      this.#stream.removeListener?.('drain', this.#drainHandler);
      this.#drainHandler = undefined;
    }

    // The unfinished-line state belongs to this run, so a later run starts fresh.
    this.#hasUnfinishedLine = false;

    if (!this.#isDiscardingStdin) return;
    this.#isDiscardingStdin = false;
    stdinDiscarder.stop();
  }

  #startRenderTimer(): void {
    clearInterval(this.#id);
    this.#id = setInterval(this.#tryRender.bind(this), this.interval);
  }

  /** A terminal can report `0` columns, which would put every character on a row of its own. */
  get #columns(): number {
    return this.#stream.columns || DEFAULT_COLUMNS;
  }

  #canMoveCursor(stream: OraStream): stream is CursorStream {
    return stream.isTTY === true && typeof stream.cursorTo === 'function' && typeof stream.moveCursor === 'function' && typeof stream.clearLine === 'function';
  }

  /** Erase the frame that is on screen, when the stream can move the cursor. */
  #clearDisplay(): void {
    const stream = this.#stream;
    if (!this.#canMoveCursor(stream) || this.#linesToClear === 0) return;

    // Reflow varies by terminal, so a resize never raises the recorded erase count, which
    // could clear output above the frame.
    const columns = this.#columns;
    if (this.#renderedFrame !== undefined && this.#renderedColumns !== columns) {
      this.#linesToClear = Math.min(this.#linesToClear, rowCount(this.#renderedFrame, columns));
    }

    // The cursor helpers call `stream.write` themselves, so the whole block is marked
    // internal or the hook would treat our own erasure as somebody else's output.
    try {
      const count = this.#linesToClear;
      this.#internalWrite(() => {
        stream.cursorTo(0);
        for (let index = 0; index < count; index += 1) {
          if (index > 0) stream.moveCursor(0, -1);
          stream.clearLine(1);
        }
      });
    } finally {
      // Forgotten even if the erase failed, so a later call does not retry the same rows.
      this.#linesToClear = 0;
      this.#renderedFrame = undefined;
    }
  }

  #hideCursor(): void {
    if (this.#stream.isTTY !== true) return;
    restoreCursor();
    this.#stream.write(HIDE_CURSOR);
  }

  /** The stream may be what failed, so showing the cursor is best effort. */
  #showCursor(): void {
    if (!this.#options.hideCursor || this.#stream.isTTY !== true) return;
    try {
      this.#stream.write(SHOW_CURSOR);
    } catch {
      // Nothing left to give back to: the stream is gone.
    }
  }

  /**
   * Intercept a stream's writes while the spinner is up, so a `console.log` from anywhere
   * lands above the frame instead of through it. The spinner's own stream plus both
   * process stdio streams — the three a program actually writes to.
   */
  #installHook(): void {
    if (!this.isEnabled || this.#hookedStreams.size > 0) return;
    for (const stream of new Set<OraStream>([this.#stream, rt.stdout as unknown as OraStream, rt.stderr as unknown as OraStream])) this.#hookStream(stream);
  }

  #hookStream(stream: OraStream | undefined): void {
    if (!stream || this.#hookedStreams.has(stream) || stream.isTTY !== true || typeof stream.write !== 'function') return;

    if (activeHooksPerStream.has(stream)) {
      console.warn('[ora] Multiple concurrent spinners detected. This may cause visual corruption. Use one spinner at a time.');
    }

    const originalWrite = stream.write;
    const record = { wrapped: originalWrite, live: true };
    const hook: Write = (chunk: string, encoding?: unknown, callback?: unknown): boolean =>
      record.live ? this.#hookedWrite(stream, originalWrite, chunk, encoding, callback) : (originalWrite as (...args: unknown[]) => boolean).call(stream, chunk, encoding, callback);
    writeHooks.set(hook, record);
    this.#hookedStreams.set(stream, hook);
    activeHooksPerStream.set(stream, this);
    stream.write = hook;
  }

  #uninstallHook(): void {
    for (const [stream, hook] of this.#hookedStreams) {
      const record = writeHooks.get(hook);
      if (record) record.live = false;
      for (let top = writeHooks.get(stream.write); top && !top.live; top = writeHooks.get(stream.write)) stream.write = top.wrapped;
      if (activeHooksPerStream.get(stream) === this) activeHooksPerStream.delete(stream);
    }
    this.#hookedStreams.clear();
  }

  #hookedWrite(stream: OraStream, originalWrite: Write, chunk: string, encoding?: unknown, callback?: unknown): boolean {
    // `write(chunk, callback)` as well as `write(chunk, encoding, callback)`.
    const [enc, cb] = typeof encoding === 'function' ? [undefined, encoding] : [encoding, callback];

    if (this.#isInternalWrite) return originalWrite.call(stream, chunk, enc, cb);

    // Somebody else's output: take the frame down, let it through, put the frame back.
    this.#clearDisplay();

    // Decoded only to find the newline — the chunk itself is written as given, so a UTF-8
    // character split across two buffer writes is never replayed as a broken string. Styling
    // codes do not finish a line, and neither does a carriage return.
    const chunkString = strip(stringifyChunk(chunk, enc));
    if (chunkString !== '') this.#hasUnfinishedLine = !chunkString.endsWith('\n');

    const writeResult = originalWrite.call(stream, chunk, enc, cb);

    // The write already went through, so a render that fails stops the spinner rather than
    // throwing at the program's own write.
    this.#tryRender();
    return writeResult;
  }
}

/**
 * A frame taller than `maxRows`, cut to fit with the truncation message on its last rows. The
 * message is shortened until it fits; whole lines are kept as written, so they keep their
 * colours, and the line that does not fit is cut to the rows that are left, plain.
 */
function truncateFrame(frameContent: string, columns: number, maxRows: number): string {
  let message = TRUNCATION_MESSAGE;
  while (message.length > 1 && rowCount(message, columns) > maxRows) message = message.slice(0, -1);

  let rowBudget = maxRows - rowCount(message, columns);
  const keptLines: string[] = [];
  for (const line of frameContent.split('\n')) {
    const lineRows = layOut(line, columns).rows;
    if (lineRows.length > rowBudget) {
      keptLines.push(...lineRows.slice(0, rowBudget).map((cells) => cells.join('')));
      break;
    }
    keptLines.push(line);
    rowBudget -= lineRows.length;
  }

  return [...keptLines, STYLE_RESET + message].join('\n');
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

const resolveText = <A>(value: string | ((argument: A) => string) | undefined, argument: A): string | undefined => (typeof value === 'function' ? value(argument) : value);

/**
 * Run an action under a spinner, and land on the right symbol whichever way it ends. The
 * action's own outcome wins: a `failText` that throws, or a persist the stream cannot write,
 * never replaces the action's error, and a persist that fails never discards its result. A
 * `successText` that throws is the caller's error and is not drawn as a failure.
 */
export async function oraPromise<T>(action: Promise<T> | ((spinner: Ora) => Promise<T>), options?: PromiseOptions<T> | string | null): Promise<T> {
  const actionIsFunction = typeof action === 'function';
  const actionIsPromise = typeof (action as { then?: unknown } | undefined)?.then === 'function';
  if (!actionIsFunction && !actionIsPromise) throw new TypeError('Parameter `action` must be a Function or a Promise');

  const settings = typeof options === 'object' && options !== null ? options : ({} as PromiseOptions<T>);
  const { successText, failText, successSymbol, failSymbol } = settings;
  const spinner = ora(options ?? undefined).start();

  let result: T;
  try {
    result = await (actionIsFunction ? action(spinner) : action);
  } catch (error) {
    let text: string | undefined;
    try {
      text = resolveText(failText, error);
    } catch {
      // The action's error is more use to the caller than the one from `failText`.
    }
    try {
      spinner.stopAndPersist({ symbol: failSymbol ?? logSymbols.error, ...(text === undefined ? {} : { text }) });
    } catch {
      // The action's error is more use to the caller than a stream error from the persist.
    }
    throw error;
  }

  // Resolved outside the `try` above, so a throw here is not reported as the action failing.
  let text: string | undefined;
  try {
    text = resolveText(successText, result);
  } catch (error) {
    spinner.stop();
    throw error;
  }

  try {
    spinner.stopAndPersist({ symbol: successSymbol ?? logSymbols.success, ...(text === undefined ? {} : { text }) });
  } catch {
    // The action already succeeded, so a stream error from the persist must not discard its result.
  }
  return result;
}
