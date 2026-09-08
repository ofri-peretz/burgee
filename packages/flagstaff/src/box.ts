/**
 * A box around text (R7) — boxen's job, as a string function.
 *
 * **There is no layout engine here and there will not be one** (U8). This measures with
 * `width()`, wraps with `wrap()` and joins strings; it does not lay anything out, and the
 * day someone needs flexbox is the day they reach for a different package. A box is a
 * border, padding and an optional title, and every one of those is arithmetic.
 *
 * Off a terminal the border is noise a screen reader reads character by character, so the
 * component's static projection is the text with its title, and only `frame()` draws.
 * `box()` itself is exported for the many callers who just want the string.
 */
import { muted } from 'roundel/tokens';

import { type Component } from './plugin.js';
import { width } from './width.js';
import { wrap } from './wrap.js';

export interface BorderStyle {
  topLeft: string;
  top: string;
  topRight: string;
  left: string;
  right: string;
  bottomLeft: string;
  bottom: string;
  bottomRight: string;
}

/** The border sets boxen ships, by the names it ships them under. */
export const borders: Record<string, BorderStyle> = {
  round: { topLeft: '╭', top: '─', topRight: '╮', left: '│', right: '│', bottomLeft: '╰', bottom: '─', bottomRight: '╯' },
  single: { topLeft: '┌', top: '─', topRight: '┐', left: '│', right: '│', bottomLeft: '└', bottom: '─', bottomRight: '┘' },
  double: { topLeft: '╔', top: '═', topRight: '╗', left: '║', right: '║', bottomLeft: '╚', bottom: '═', bottomRight: '╝' },
  bold: { topLeft: '┏', top: '━', topRight: '┓', left: '┃', right: '┃', bottomLeft: '┗', bottom: '━', bottomRight: '┛' },
  classic: { topLeft: '+', top: '-', topRight: '+', left: '|', right: '|', bottomLeft: '+', bottom: '-', bottomRight: '+' },
  none: { topLeft: '', top: '', topRight: '', left: '', right: '', bottomLeft: '', bottom: '', bottomRight: '' },
};

export interface BoxOptions {
  /** A key of `borders`, or a style of your own. Default `round`. */
  border?: string | BorderStyle;
  /** Cells of padding left and right of the text, and rows above and below. Default 1 / 0. */
  padding?: { x?: number; y?: number };
  /** A title written into the top border. Truncated with `…` if the box is too narrow. */
  title?: string;
  /** Columns the whole box may occupy, borders included. Text wraps to fit. Default 80. */
  width?: number;
}

const DEFAULT_WIDTH = 80;
const DEFAULT_PAD_X = 1;
const DEFAULT_PAD_Y = 0;
/** Two border cells, one each side. */
const BORDER_CELLS = 2;
const ELLIPSIS = '…';

const resolve = (border: string | BorderStyle): BorderStyle => (typeof border === 'string' ? (borders[border] ?? borders['round'] as BorderStyle) : border);

/** Pad a line to `cells` columns — measured, so a wide character counts as two. */
const padEnd = (line: string, cells: number): string => line + ' '.repeat(Math.max(0, cells - width(line)));

/** The title, cut to what the top border can hold, with an ellipsis when it was cut. */
function fitTitle(title: string, cells: number): string {
  if (width(title) <= cells) return title;
  if (cells <= 1) return '';
  let out = '';
  for (const character of title) {
    if (width(out + character) > cells - 1) break;
    out += character;
  }
  return out + ELLIPSIS;
}

/** The top border, with the title set into it when there is one and room for it. */
function topBorder(style: BorderStyle, inner: number, title: string | undefined): string {
  if (style.top === '') return '';
  if (title === undefined || title === '') return style.topLeft + style.top.repeat(inner) + style.topRight;
  // A space each side of the title, so it reads as a label rather than as border.
  const fitted = fitTitle(title, Math.max(0, inner - BORDER_CELLS - BORDER_CELLS));
  if (fitted === '') return style.topLeft + style.top.repeat(inner) + style.topRight;
  const label = ` ${fitted} `;
  const rest = Math.max(0, inner - width(label) - 1);
  return `${style.topLeft}${style.top}${label}${style.top.repeat(rest)}${style.topRight}`;
}

/** Draw `text` in a box, as a string. The many callers who want only this want only this. */
export function box(text: string, options: BoxOptions = {}): string {
  const style = resolve(options.border ?? 'round');
  const padX = options.padding?.x ?? DEFAULT_PAD_X;
  const padY = options.padding?.y ?? DEFAULT_PAD_Y;
  const total = options.width ?? DEFAULT_WIDTH;
  const borderCells = style.left === '' ? 0 : BORDER_CELLS;
  const inner = Math.max(1, total - borderCells);
  const content = Math.max(1, inner - padX * BORDER_CELLS);

  const wrapped = wrap(text, content, { hard: true, trim: false }).split('\n');
  const blank = Array.from({ length: padY }, () => '');
  const pad = ' '.repeat(padX);
  const rows = [...blank, ...wrapped, ...blank].map((line) => `${style.left}${pad}${padEnd(line, content)}${pad}${style.right}`);

  const top = topBorder(style, inner, options.title);
  const bottom = style.bottom === '' ? '' : style.bottomLeft + style.bottom.repeat(inner) + style.bottomRight;
  return [top, ...rows, bottom].filter((row) => row !== '').join('\n');
}

export interface BoxState {
  text: string;
  title?: string;
}

/** A box as a component: the text off a terminal, the drawing on one (R1). */
export function boxComponent(options: BoxOptions = {}): Component<BoxState> {
  return {
    name: 'box',
    // A border is noise to a screen reader and to a log; the title is not.
    static: (state) => (state.title === undefined || state.title === '' ? state.text : `${state.title}: ${state.text}`),
    frame: (_t, state) => muted(box(state.text, state.title === undefined ? options : { ...options, title: state.title })),
  };
}
