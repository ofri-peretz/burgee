/**
 * controlroom R3 â the frame-writing seam. `frameWriter()` takes a whole frame and writes
 * only what changed, inside one synchronized-output block. Two things are graded: the bytes
 * (what was written, and â as important â what was *not*), and the screen those bytes leave,
 * read off a small terminal that implements exactly the sequences the seam may write. The
 * last case is a property: any sequence of frames, at any width, leaves the screen holding
 * the last frame and nothing else.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { frameWriter, type Writer } from './loop.js';

const ESC = '\u001B';
const BEGIN = `${ESC}[?2026h`;
const END = `${ESC}[?2026l`;

/**
 * Just enough of a terminal: autowrap with a pending wrap at the last column, `\n`, the CSI
 * forms `nG`, `nA`, `nB`, `0J`, `2K`, private modes (which move nothing), and DECSC/DECRC.
 * Rows are unbounded, so nothing scrolls off; the seam's own doc says a frame lives within
 * the terminal's height.
 */
class Terminal {
  readonly #columns: number;
  #rows: string[][] = [[]];
  #row = 0;
  #col = 0;
  #saved: [number, number] = [0, 0];

  constructor(columns: number) {
    this.#columns = columns;
  }

  feed(bytes: string): void {
    for (let i = 0; i < bytes.length; ) {
      const csi = /^\u001B\[(\??)(\d*)([A-Za-z])/.exec(bytes.slice(i));
      if (csi !== null) {
        const [whole, priv = '', arg = '', op = ''] = csi;
        if (priv === '') this.#csi(arg === '' ? 1 : Number(arg), op);
        i += whole.length;
      } else if (bytes.startsWith(`${ESC}7`, i)) {
        this.#saved = [this.#row, this.#col];
        i += 2;
      } else if (bytes.startsWith(`${ESC}8`, i)) {
        [this.#row, this.#col] = this.#saved;
        i += 2;
      } else {
        this.#print(bytes[i] as string);
        i += 1;
      }
    }
  }

  #csi(n: number, op: string): void {
    if (op === 'G') this.#col = n - 1;
    else if (op === 'A') this.#row = Math.max(0, this.#row - n);
    else if (op === 'B') this.#row = Math.min(this.#rows.length - 1, this.#row + n);
    else if (op === 'K') this.#rows[this.#row] = [];
    else if (op === 'J') {
      this.#rows[this.#row] = (this.#rows[this.#row] as string[]).slice(0, this.#col);
      this.#rows.length = this.#row + 1;
    } else throw new Error(`the seam wrote CSI ${op}, which this terminal does not know`);
  }

  #print(ch: string): void {
    if (ch === '\n' || this.#col >= this.#columns) {
      this.#row += 1;
      this.#col = 0;
      while (this.#rows.length <= this.#row) this.#rows.push([]);
      if (ch === '\n') return;
    }
    (this.#rows[this.#row] as string[])[this.#col] = ch;
    this.#col += 1;
  }

  get screen(): string[] {
    return this.#rows.map((r) => r.join(''));
  }

  get cursor(): [number, number] {
    return [this.#row, this.#col];
  }
}

/** A writer that records each write, and feeds a terminal as it goes. */
function sink(columns?: number) {
  const writes: string[] = [];
  const term = new Terminal(columns ?? 80);
  let width = columns;
  const out: Writer = {
    write: (s: string) => {
      writes.push(s);
      term.feed(s);
    },
    get columns() {
      return width;
    },
  };
  return { out, writes, term, resize: (to: number) => void (width = to) };
}

/** The rows a frame occupies `columns` wide, ASCII only â what the screen should read. */
const rowsOf = (frame: readonly string[], columns: number): string[] => (frame.length === 0 ? [''] : frame).flatMap((line) => (line === '' ? [''] : (line.match(new RegExp(`.{1,${columns}}`, 'g')) ?? [])));

describe('controlroom R3 Â· the frame-writing seam', () => {
  it('paints the first frame whole, inside one synchronized-output block', () => {
    const { out, writes, term } = sink();
    frameWriter(out).paint(['Status Â· Logs', 'â one', 'â two']);
    expect(writes).toEqual([`${BEGIN}Status Â· Logs\nâ one\nâ two${END}`]);
    expect(term.screen).toEqual(['Status Â· Logs', 'â one', 'â two']);
  });

  it('writes nothing at all for a frame identical to the last', () => {
    const { out, writes } = sink();
    const frame = frameWriter(out);
    frame.paint(['a', 'b']);
    frame.paint(['a', 'b']);
    expect(writes).toHaveLength(1);
  });

  it('rewrites a changed line in place and leaves every other line untouched', () => {
    const { out, writes, term } = sink();
    const frame = frameWriter(out);
    frame.paint(['top', 'middle', 'bottom']);
    const cursor = term.cursor;
    frame.paint(['top', 'MIDDLE', 'bottom']);
    // Up one row from the last, clear that line, write it, and put the cursor back.
    expect(writes[1]).toBe(`${BEGIN}${ESC}7${ESC}[1G${ESC}[1A${ESC}[2KMIDDLE${ESC}8${END}`);
    expect(writes[1]).not.toContain('top');
    expect(writes[1]).not.toContain('bottom');
    expect(term.screen).toEqual(['top', 'MIDDLE', 'bottom']);
    expect(term.cursor).toEqual(cursor);
  });

  it('moves down between two in-place edits rather than back to the bottom', () => {
    const { out, writes, term } = sink();
    const frame = frameWriter(out);
    frame.paint(['a', 'b', 'c', 'd']);
    frame.paint(['A', 'b', 'C', 'd']);
    expect(writes[1]).toBe(`${BEGIN}${ESC}7${ESC}[1G${ESC}[3A${ESC}[2KA${ESC}[1G${ESC}[2B${ESC}[2KC${ESC}8${END}`);
    expect(term.screen).toEqual(['A', 'b', 'C', 'd']);
  });

  it('a change on the last line clears from there, which is the old single-line repaint', () => {
    const { out, writes } = sink();
    const frame = frameWriter(out);
    frame.paint(['â  building']);
    frame.paint(['â  building']);
    expect(writes[1]).toBe(`${BEGIN}${ESC}[1G${ESC}[0Jâ  building${END}`);
  });

  it('a frame that grows or shrinks rewrites from the first line that moved', () => {
    const { out, writes, term } = sink();
    const frame = frameWriter(out);
    frame.paint(['a', 'b']);
    frame.paint(['a', 'b', 'c']);
    expect(writes[1]).toBe(`${BEGIN}${ESC}[1G${ESC}[0Jb\nc${END}`);
    expect(term.screen).toEqual(['a', 'b', 'c']);
    frame.paint(['a']);
    expect(term.screen).toEqual(['a']);
  });

  it('a line that wraps onto a new row rewrites from that line, at the width the writer reports', () => {
    const { out, term } = sink(10);
    const frame = frameWriter(out);
    frame.paint(['short', 'tail']);
    frame.paint(['x'.repeat(25), 'tail']);
    expect(term.screen).toEqual(['xxxxxxxxxx', 'xxxxxxxxxx', 'xxxxx', 'tail']);
    frame.paint(['short', 'tail']);
    expect(term.screen).toEqual(['short', 'tail']);
  });

  it('a new width repaints the whole frame from its first row', () => {
    const { out, writes, resize } = sink(30);
    const frame = frameWriter(out);
    frame.paint(['x'.repeat(40), 'same']);
    resize(20);
    frame.paint(['x'.repeat(40), 'same']);
    // Three rows at 30 were painted; the cursor goes up two and the whole frame is rewritten.
    expect(writes[1]).toBe(`${BEGIN}${ESC}[1G${ESC}[2A${ESC}[0J${'x'.repeat(40)}\nsame${END}`);
  });

  it('a writer that reports no width is taken to be 80 wide', () => {
    const { out, writes } = sink();
    const frame = frameWriter(out);
    frame.paint(['x'.repeat(100)]);
    frame.paint(['y']);
    expect(writes[1]).toBe(`${BEGIN}${ESC}[1G${ESC}[1A${ESC}[0Jy${END}`);
  });

  it('no lines is one empty line', () => {
    const { out, writes, term } = sink();
    const frame = frameWriter(out);
    frame.paint([]);
    // Nothing to draw on a fresh writer is nothing written — not an empty sync block.
    expect(writes).toEqual([]);
    frame.paint(['a']);
    frame.paint([]);
    expect(term.screen).toEqual(['']);
  });

  it('release leaves the frame on screen as scrollback, and the next paint starts below it', () => {
    const { out, writes, term } = sink();
    const frame = frameWriter(out);
    frame.paint(['kept']);
    frame.release();
    out.write('\n');
    frame.paint(['next']);
    expect(writes.at(-1)).toBe(`${BEGIN}next${END}`);
    expect(term.screen).toEqual(['kept', 'next']);
  });

  /**
   * Two shapes of sequence, because each path needs its own: frames of any length mostly take
   * the rewrite-from-here path, and frames of one fixed height whose last line never changes
   * take the in-place path, which is where a cursor left in the wrong row would hide — the
   * screen can be right after the edit and wrong only on the paint after it.
   */
  const line = fc.stringMatching(/^[a-c]{0,12}$/);
  const anyFrames = fc.array(fc.array(line, { maxLength: 6 }), { minLength: 1, maxLength: 8 });
  const steadyFrames = fc.array(fc.array(line, { minLength: 3, maxLength: 3 }).map((lines) => [...lines, 'end']), { minLength: 2, maxLength: 8 });

  it.each([
    ['of any height', anyFrames],
    ['of one height with a steady last line', steadyFrames],
  ])('any sequence of frames %s, at any width, leaves exactly the last frame on screen and the cursor at its end', (_, frames) => {
    fc.assert(
      fc.property(frames, fc.integer({ min: 3, max: 10 }), (sequence, columns) => {
        const { out, term } = sink(columns);
        const frame = frameWriter(out);
        for (const lines of sequence) {
          frame.paint(lines);
          const rows = rowsOf(lines, columns);
          expect(term.screen).toEqual(rows);
          expect(term.cursor).toEqual([rows.length - 1, (rows.at(-1) as string).length]);
        }
      }),
      { numRuns: 400 },
    );
  });
});
