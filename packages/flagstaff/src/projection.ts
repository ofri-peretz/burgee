/**
 * The per-mode writers (R1). This is the only module in the package that emits a cursor
 * operation, and it does so only in `tty`; every other projection is text and a newline,
 * which is what R5 greps for. Streams and time come in as arguments — nothing here knows
 * `process` exists. The three sequences are written by hand rather than through
 * `node:readline`, whose helpers want a `Writable` where the loop only has a `Writer`.
 */
import { type Component } from './plugin.js';

export interface Writer {
  write(chunk: string): unknown;
}

/** Time as the loop sees it: burgee's `Runtime.clock` satisfies it, so does `manualClock()`. */
export interface Clock {
  now(): number;
  schedule(fn: () => void, ms: number): () => void;
}

/** One hoisted component's lifecycle, as a mode sees it. */
export interface Projection<S> {
  open(state: S): void;
  change(state: S): void;
  close(state: S): void;
}

export const DEFAULT_INTERVAL = 80;
const CSI = '\u001B[';
export const HIDE_CURSOR = `${CSI}?25l`;
export const SHOW_CURSOR = `${CSI}?25h`;

/** Column 1, up to the first of `lines`, and clear from there to the end of the screen. */
function erase(lines: number): string {
  if (lines === 0) return '';
  return `${CSI}1G${lines > 1 ? `${CSI}${lines - 1}A` : ''}${CSI}0J`;
}

/** A terminal: repaint in place on the clock, then leave the static line behind on close. */
class TtyProjection<S> implements Projection<S> {
  readonly #component: Component<S>;
  readonly #out: Writer;
  readonly #clock: Clock;
  readonly #interval: number;
  readonly #started: number;
  #current!: S;
  #lines = 0;
  #cancel: () => void = () => undefined;

  constructor(component: Component<S>, out: Writer, clock: Clock) {
    this.#component = component;
    this.#out = out;
    this.#clock = clock;
    this.#interval = component.interval ?? DEFAULT_INTERVAL;
    this.#started = clock.now();
  }

  open(state: S): void {
    this.#current = state;
    this.#out.write(HIDE_CURSOR);
    this.#paint();
    if (this.#component.frame !== undefined) this.#cancel = this.#clock.schedule(() => this.#repaint(), this.#interval);
  }

  change(state: S): void {
    this.#current = state;
    this.#paint();
  }

  close(state: S): void {
    this.#cancel();
    this.#out.write(`${erase(this.#lines)}${this.#component.static(state)}\n${SHOW_CURSOR}`);
    this.#lines = 0;
  }

  #paint(): void {
    const { frame } = this.#component;
    const text = frame === undefined ? this.#component.static(this.#current) : frame(this.#clock.now() - this.#started, this.#current);
    this.#out.write(erase(this.#lines) + text);
    this.#lines = text.split('\n').length;
  }

  #repaint(): void {
    this.#paint();
    this.#cancel = this.#clock.schedule(() => this.#repaint(), this.#interval);
  }
}

export function ttyProjection<S>(component: Component<S>, out: Writer, clock: Clock): Projection<S> {
  return new TtyProjection(component, out, clock);
}

/** A pipe, CI, or a screen reader: the static projection, once per change, and nothing else. */
export function staticProjection<S>(component: Component<S>, out: Writer): Projection<S> {
  let last: string | undefined;
  const emit = (state: S): void => {
    const text = component.static(state);
    if (text === last) return;
    last = text;
    out.write(`${text}\n`);
  };
  return { open: emit, change: emit, close: emit };
}

/** `--json`: one NDJSON event per transition on stderr, so stdout stays the envelope's (R1). */
export function jsonProjection<S>(component: Component<S>, err: Writer): Projection<S> {
  const emit = (state: S): void => {
    err.write(`${JSON.stringify({ event: component.name, state })}\n`);
  };
  return { open: emit, change: emit, close: emit };
}
