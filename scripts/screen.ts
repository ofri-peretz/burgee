/**
 * What a terminal shows after a program wrote `bytes` to it: the bytes replayed onto a grid of
 * `columns` × `rows` cells, one string per row, trailing blanks trimmed.
 *
 * The gallery (`gallery-page.ts`) uses it to show a full-screen program's `tty` mode as the screen
 * a person sees, rather than as the escape stream that draws it — which for a whole screen is
 * kilobytes no reader can follow. It is a reader of the family's own output, so it knows the
 * sequences the family writes and no others: cursor up, down, left, right, to a column and to a
 * position, erase in line and in display, save and restore the cursor, and the alternate screen.
 * SGR and every other private mode are consumed and change nothing on the grid. A newline is a
 * carriage return and a line feed, as a terminal's output processing (`ONLCR`) makes it, and a
 * line feed on the last row scrolls.
 *
 * A character takes the cells its East Asian width gives it (`get-east-asian-width`, the table
 * linegauge measures with); a combining mark or a control character takes none.
 */
import { eastAsianWidth } from 'get-east-asian-width';

export interface Size {
  columns: number;
  rows: number;
}

const blank = (columns: number): string[] => Array.from({ length: columns }, () => ' ');
const grid = ({ columns, rows }: Size): string[][] => Array.from({ length: rows }, () => blank(columns));
const ZERO_WIDTH = /^[\p{M}\p{Cc}\p{Cf}]$/u;
const cellsOf = (ch: string): number => (ZERO_WIDTH.test(ch) ? 0 : eastAsianWidth(ch.codePointAt(0) as number));

/** One CSI sequence's numeric parameters, with `fallback` where a parameter is empty. */
const params = (raw: string, fallback: number): number[] => raw.split(';').map((p) => (p === '' ? fallback : Number(p)));

const erase = (line: string[], from: number, to: number): void => {
  for (let c = from; c < to; c += 1) line[c] = ' ';
};

/** The grid, the cursor on it, and the main screen kept aside while the alternate one is up. */
class Terminal {
  readonly #size: Size;
  #cells: string[][];
  #main: string[][] | undefined;
  #row = 0;
  #col = 0;
  #saved = { row: 0, col: 0 };
  #beforeAlternate = { row: 0, col: 0 };

  constructor(size: Size) {
    this.#size = size;
    this.#cells = grid(size);
  }

  get rows(): string[] {
    return this.#cells.map((r) => r.join('').trimEnd());
  }

  #line(row = this.#row): string[] {
    return this.#cells[row] as string[];
  }

  #clamp(): void {
    this.#row = Math.max(0, Math.min(this.#size.rows - 1, this.#row));
    this.#col = Math.max(0, Math.min(this.#size.columns - 1, this.#col));
  }

  newline(): void {
    this.#col = 0;
    this.#row += 1;
    if (this.#row < this.#size.rows) return;
    this.#cells.shift();
    this.#cells.push(blank(this.#size.columns));
    this.#row = this.#size.rows - 1;
  }

  carriageReturn(): void {
    this.#col = 0;
  }

  save(): void {
    this.#saved = { row: this.#row, col: this.#col };
  }

  restore(): void {
    ({ row: this.#row, col: this.#col } = this.#saved);
  }

  print(ch: string): void {
    const wide = cellsOf(ch);
    if (wide === 0) return;
    if (this.#col + wide > this.#size.columns) this.newline();
    const line = this.#line();
    line[this.#col] = ch;
    for (let c = 1; c < wide; c += 1) line[this.#col + c] = '';
    // A full row leaves the cursor past the margin until the next character wraps it.
    this.#col += wide;
  }

  /** One CSI sequence: its parameters and its final byte. */
  csi(body: string, final: string): void {
    const [n = 1, m = 1] = params(body, 1);
    const [mode = 0] = params(body, 0);
    const moves: Record<string, () => unknown> = {
      A: () => (this.#row -= n),
      B: () => (this.#row += n),
      C: () => (this.#col += n),
      D: () => (this.#col -= n),
      G: () => (this.#col = n - 1),
      H: () => ([this.#row, this.#col] = [n - 1, m - 1]),
      K: () => this.#eraseLine(mode),
      J: () => this.#eraseDisplay(mode),
      h: () => body === '?1049' && this.#enterAlternate(),
      l: () => body === '?1049' && this.#leaveAlternate(),
    };
    // SGR and the private modes the family toggles (cursor, synchronized output, paste): no cell changes.
    moves[final]?.();
    this.#clamp();
  }

  #eraseLine(mode: number): void {
    erase(this.#line(), mode === 0 ? this.#col : 0, mode === 1 ? this.#col + 1 : this.#size.columns);
  }

  #eraseDisplay(mode: number): void {
    const { columns, rows } = this.#size;
    if (mode === 2) for (const line of this.#cells) erase(line, 0, columns);
    else if (mode === 1) {
      for (let r = 0; r < this.#row; r += 1) erase(this.#line(r), 0, columns);
      erase(this.#line(), 0, this.#col + 1);
    } else {
      erase(this.#line(), this.#col, columns);
      for (let r = this.#row + 1; r < rows; r += 1) erase(this.#line(r), 0, columns);
    }
  }

  #enterAlternate(): void {
    this.#beforeAlternate = { row: this.#row, col: this.#col };
    this.#main ??= this.#cells;
    this.#cells = grid(this.#size);
    [this.#row, this.#col] = [0, 0];
  }

  #leaveAlternate(): void {
    if (this.#main === undefined) return;
    this.#cells = this.#main;
    this.#main = undefined;
    ({ row: this.#row, col: this.#col } = this.#beforeAlternate);
  }
}

/** One CSI, one two-byte escape (save or restore), or one character. */
const TOKEN = /\u001B\[([\d;?]*)([@-~])|\u001B([78])|([\s\S])/gu;

export function screenOf(bytes: string, size: Size): string[] {
  const t = new Terminal(size);
  for (const [, body, final, esc, ch] of bytes.matchAll(TOKEN)) {
    // `body` is `[\d;?]*`, so it is a string, if an empty one, whenever `final` matched; `ch` is
    // the last alternative, so it is set whenever nothing before it matched.
    if (final !== undefined) t.csi(body as string, final);
    else if (esc === '7') t.save();
    else if (esc === '8') t.restore();
    else if (ch === '\r') t.carriageReturn();
    else if (ch === '\n') t.newline();
    else t.print(ch as string);
  }
  return t.rows;
}
