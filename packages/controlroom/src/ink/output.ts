/**
 * The grid a frame is drawn into: writes at a cell, clipped to the innermost `overflow:
 * hidden` box, each line passed through the transforms of the components around it, then
 * serialized row by row with trailing blanks trimmed. Strings in, a string out.
 */
import { slice } from 'linegauge';

import { serialize, type StyledChar, styledChars } from './ansi.js';
import { stringWidth, type Transformer, widestLine } from './dom.js';

export interface Clip {
  x1: number | undefined;
  x2: number | undefined;
  y1: number | undefined;
  y2: number | undefined;
}

type Operation = { type: 'write'; x: number; y: number; text: string; transformers: Transformer[] } | { type: 'clip'; clip: Clip } | { type: 'unclip' };

const BLANK: StyledChar = { value: ' ', width: 1, styles: [] };

export class Output {
  readonly width: number;
  readonly height: number;
  readonly #operations: Operation[] = [];

  constructor({ width, height }: { width: number; height: number }) {
    this.width = width;
    this.height = height;
  }

  draw(x: number, y: number, text: string, { transformers }: { transformers: Transformer[] }): void {
    if (text === '') return;
    this.#operations.push({ type: 'write', x, y, text, transformers });
  }

  clip(clip: Clip): void {
    this.#operations.push({ type: 'clip', clip });
  }

  unclip(): void {
    this.#operations.push({ type: 'unclip' });
  }

  get(): { output: string; height: number } {
    const rows: (StyledChar | undefined)[][] = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => BLANK));
    const clips: Clip[] = [];
    for (const operation of this.#operations) {
      if (operation.type === 'clip') clips.push(operation.clip);
      else if (operation.type === 'unclip') clips.pop();
      else this.#apply(rows, operation, clips.at(-1));
    }
    const output = rows.map((row) => serialize(row.filter((cell): cell is StyledChar => cell !== undefined)).trimEnd()).join('\n');
    return { output, height: rows.length };
  }

  #apply(rows: (StyledChar | undefined)[][], { text, transformers, x: atX, y: atY }: { x: number; y: number; text: string; transformers: Transformer[] }, clip: Clip | undefined): void {
    let x = atX;
    let y = atY;
    let lines = text.split('\n');
    if (clip !== undefined) {
      const horizontally = typeof clip.x1 === 'number' && typeof clip.x2 === 'number';
      const vertically = typeof clip.y1 === 'number' && typeof clip.y2 === 'number';
      if (horizontally && (x + widestLine(text) < clip.x1! || x > clip.x2!)) return;
      if (vertically && (y + lines.length < clip.y1! || y > clip.y2!)) return;
      if (horizontally) {
        const { x1, x2 } = clip as { x1: number; x2: number };
        lines = lines.map((line) => {
          const from = x < x1 ? x1 - x : 0;
          const w = stringWidth(line);
          const to = x + w > x2 ? x2 - x : w;
          return slice(line, from, to);
        });
        if (x < x1) x = x1;
      }
      if (vertically) {
        const { y1, y2 } = clip as { y1: number; y2: number };
        const from = y < y1 ? y1 - y : 0;
        const to = y + lines.length > y2 ? y2 - y : lines.length;
        lines = lines.slice(from, to);
        if (y < y1) y = y1;
      }
    }
    let offsetY = 0;
    for (let [index, line] of lines.entries()) {
      const row = rows[y + offsetY];
      if (row === undefined) continue;
      for (const transform of transformers) line = transform(line, index);
      let offsetX = x;
      for (const char of styledChars(line)) {
        row[offsetX] = char;
        for (let i = 1; i < char.width; i += 1) row[offsetX + i] = { value: '', width: 0, styles: char.styles };
        offsetX += char.width;
      }
      offsetY += 1;
    }
  }
}
