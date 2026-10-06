/**
 * The grid a frame is drawn into: writes at a cell, clipped to the intersection of every
 * enclosing `overflow: hidden` box, each line passed through the transforms of the components
 * around it, then serialized row by row with trailing blanks trimmed — ink 8's `Output`.
 * Strings in, a string out.
 */
import { serialize, type StyledChar, styledChars } from './ansi.js';
import { stringWidth, type Transformer } from './dom.js';

export interface Clip {
  x1: number | undefined;
  x2: number | undefined;
  y1: number | undefined;
  y2: number | undefined;
}

type Operation = { type: 'write'; x: number; y: number; text: string; transformers: Transformer[] } | { type: 'clip'; clip: Clip } | { type: 'unclip' };

/** A partially visible wide character's cell: a space that keeps its styles. */
const blankCell = (cell: StyledChar): StyledChar => ({ ...cell, value: ' ', fullWidth: false });

/** An undefined bound is unbounded on that edge, so intersecting keeps the tighter defined one. */
const intersectBound = (a: number | undefined, b: number | undefined, tighter: (a: number, b: number) => number): number | undefined => (a === undefined ? b : b === undefined ? a : tighter(a, b));

/** Bounds are half-open: an axis is empty once its lower bound reaches its upper one. */
const isClipEmpty = (clip: Clip): boolean => (clip.x1 !== undefined && clip.x2 !== undefined && clip.x1 >= clip.x2) || (clip.y1 !== undefined && clip.y2 !== undefined && clip.y1 >= clip.y2);

const intersectClips = (outer: Clip | undefined, inner: Clip): Clip =>
  outer === undefined
    ? inner
    : { x1: intersectBound(outer.x1, inner.x1, Math.max), x2: intersectBound(outer.x2, inner.x2, Math.min), y1: intersectBound(outer.y1, inner.y1, Math.max), y2: intersectBound(outer.y2, inner.y2, Math.min) };

const IGNORABLE = /^\p{Default_Ignorable_Code_Point}+$/u;

class Caches {
  readonly widths = new Map<string, number>();
  readonly blockWidths = new Map<string, number>();
  readonly chars = new Map<string, StyledChar[]>();

  styledChars(line: string): StyledChar[] {
    let cached = this.chars.get(line);
    if (cached === undefined) {
      // A standalone invisible character takes no cell.
      cached = styledChars(line).filter((character) => !IGNORABLE.test(character.value));
      this.chars.set(line, cached);
    }
    return cached;
  }

  width(text: string): number {
    let cached = this.widths.get(text);
    if (cached === undefined) {
      cached = stringWidth(text);
      this.widths.set(text, cached);
    }
    return cached;
  }

  widestLine(text: string): number {
    let cached = this.blockWidths.get(text);
    if (cached === undefined) {
      cached = 0;
      for (const line of text.split('\n')) cached = Math.max(cached, this.width(line));
      this.blockWidths.set(text, cached);
    }
    return cached;
  }
}

export class Output {
  readonly width: number;
  readonly height: number;
  readonly #operations: Operation[] = [];
  readonly #caches = new Caches();

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

  /** A line cut to columns `from`–`to`; a wide character the edge splits becomes a styled space. */
  sliceLineToColumns(line: string, from: number, to: number): string {
    if (from >= to) return '';
    const result: StyledChar[] = [];
    let column = 0;
    for (const character of this.#caches.styledChars(line)) {
      const width = this.#caches.width(character.value);
      const start = column;
      column += width;
      if (column <= from) continue;
      if (start >= to) break;
      result.push(width > 1 && (start < from || column > to) ? blankCell(character) : character);
    }
    return serialize(result);
  }

  get(): { output: string; height: number } {
    const rows: StyledChar[][] = Array.from({ length: this.height }, () => Array.from({ length: this.width }, () => ({ value: ' ', fullWidth: false, styles: [] })));
    const clips: Clip[] = [];
    for (const operation of this.#operations) {
      // Nested clips intersect, so an inner box cannot let content escape an outer one.
      if (operation.type === 'clip') clips.push(intersectClips(clips.at(-1), operation.clip));
      else if (operation.type === 'unclip') clips.pop();
      else this.#apply(rows, operation, clips.at(-1));
    }
    const output = rows.map((row) => serialize(row.filter((cell): cell is StyledChar => cell !== undefined)).trimEnd()).join('\n');
    return { output, height: rows.length };
  }

  #apply(rows: StyledChar[][], operation: { x: number; y: number; text: string; transformers: Transformer[] }, clip: Clip | undefined): void {
    const { text, transformers } = operation;
    let { x, y } = operation;
    // Styles carry across an explicit newline before any row is clipped.
    const characterLines: StyledChar[][] = [[]];
    for (const character of this.#caches.styledChars(text)) {
      if (character.value === '\n') characterLines.push([]);
      else characterLines.at(-1)!.push(character);
    }
    let lines = characterLines.map((line) => serialize(line));
    if (clip !== undefined) {
      if (isClipEmpty(clip)) return;
      const horizontally = typeof clip.x1 === 'number' && typeof clip.x2 === 'number';
      const vertically = typeof clip.y1 === 'number' && typeof clip.y2 === 'number';
      if (horizontally && (x + this.#caches.widestLine(text) < clip.x1! || x > clip.x2!)) return;
      if (vertically && (y + lines.length < clip.y1! || y > clip.y2!)) return;
      if (horizontally) {
        const { x1, x2 } = clip as { x1: number; x2: number };
        lines = lines.map((line) => {
          const from = x < x1 ? x1 - x : 0;
          const width = this.#caches.width(line);
          const to = x + width > x2 ? x2 - x : width;
          return this.sliceLineToColumns(line, from, to);
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
    for (let [index, line] of lines.entries()) {
      const row = rows[y + index];
      // Lines above or below the output area have no row.
      if (row === undefined) continue;
      for (const transform of transformers) line = transform(line, index + y - operation.y);
      const characters = this.#caches.styledChars(line);
      if (characters.length === 0) continue;
      let offsetX = x;
      // A write landing in the middle of a wide character blanks its leading half.
      if (row[offsetX]?.value === '' && offsetX > 0 && this.#caches.width(row[offsetX - 1]?.value ?? '') > 1) row[offsetX - 1] = blankCell(row[offsetX - 1]!);
      for (const character of characters) {
        row[offsetX] = character;
        const width = Math.max(1, this.#caches.width(character.value));
        // A wide character covers the cells after it; one whose lead is off the grid leaves them visible.
        for (let offset = 1; offset < width; offset += 1) row[offsetX + offset] = { value: offsetX < 0 ? ' ' : '', fullWidth: false, styles: character.styles };
        offsetX += width;
      }
      if (row[offsetX]?.value === '') row[offsetX] = blankCell(row[offsetX]!);
    }
  }
}
