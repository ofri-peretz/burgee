/**
 * `flagstaff/boxen` — boxen 8.0.1 ported method for method, graded by boxen's own suite.
 *
 * **The drawing is the contract here, and that is the whole point.** boxen's suite is 84
 * `t.snapshot(box)` cases: every one asserts the exact characters it produces. A user
 * migrating off boxen cares about one thing — does my box still look the same — so matching
 * the drawing byte for byte *is* the compatibility claim, not a way of avoiding one. The
 * decision is recorded in `.sdlc/intents/output-stack-compat/design.md`.
 *
 * There is no U3 tension to resolve. `boxen()` takes a state and returns a string; that is
 * `static(state)` already, with no frame to project and no non-TTY caller to protect. U3's
 * tension is between an animation and a pipe, and a box does not animate.
 *
 * **Eight dependencies folded in.** boxen reaches `string-width`, `wrap-ansi`, `cli-boxes`,
 * `ansi-align`, `widest-line`, `camelcase`, `chalk` and `type-fest`. This file reaches
 * `width.js`, `wrap.js` and `roundel/chalk` — the first two already existed for `./ora` and
 * `./log-update`, and the rest are a few lines each, written below where they are used.
 *
 * **It carries the cli-boxes table itself** rather than reading flagstaff's plugin registry.
 * boxen has no plugin concept, `_borderStyles` is part of its public surface, and a façade
 * that resolved border names through our registry would draw differently once somebody
 * registered a plugin — which is exactly the reinterpretation a façade must not do. The
 * registry stays `./box`'s business; this subpath is a leaf.
 */
import chalk from 'roundel/chalk';

import { width as stringWidth } from './width.js';
import { wrap as wrapAnsi } from './wrap.js';

const NEWLINE = '\n';
const PAD = ' ';
const NONE = 'none';
const FALLBACK_COLUMNS = 80;
const DECIMAL = 10;
/** A border costs one cell on each side. */
const BORDERED = 2;
/** `margin: 2` means two rows but six columns — boxen's own ratio, kept exactly. */
const SIDE_MARGIN_RATIO = 3;
const HALF = 2;

export interface BoxenBorderStyle {
  topLeft: string;
  top: string;
  topRight: string;
  left: string;
  right: string;
  bottomLeft: string;
  bottom: string;
  bottomRight: string;
  /** Retro-compatibility: sets `left` and `right` together. */
  vertical?: string;
  /** Retro-compatibility: sets `top` and `bottom` together. */
  horizontal?: string;
}

export interface Spacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface BoxenOptions {
  borderStyle?: string | BoxenBorderStyle;
  borderColor?: string;
  backgroundColor?: string;
  dimBorder?: boolean;
  title?: string;
  titleAlignment?: 'left' | 'center' | 'right';
  textAlignment?: 'left' | 'center' | 'right';
  /** @deprecated boxen's own name for `textAlignment`, still honoured. */
  align?: 'left' | 'center' | 'right';
  padding?: number | Spacing;
  margin?: number | Spacing;
  width?: number;
  height?: number;
  float?: 'left' | 'center' | 'right';
  fullscreen?: boolean | ((columns: number, rows: number) => [number, number]);
}

/**
 * cli-boxes 4, as data. boxen re-exports this as `_borderStyles`, so it is part of the
 * surface a caller can reach and not an implementation detail to be hidden.
 */
const BOXES: Record<string, BoxenBorderStyle> = {
  single: { topLeft: '┌', top: '─', topRight: '┐', right: '│', bottomRight: '┘', bottom: '─', bottomLeft: '└', left: '│' },
  double: { topLeft: '╔', top: '═', topRight: '╗', right: '║', bottomRight: '╝', bottom: '═', bottomLeft: '╚', left: '║' },
  round: { topLeft: '╭', top: '─', topRight: '╮', right: '│', bottomRight: '╯', bottom: '─', bottomLeft: '╰', left: '│' },
  bold: { topLeft: '┏', top: '━', topRight: '┓', right: '┃', bottomRight: '┛', bottom: '━', bottomLeft: '┗', left: '┃' },
  singleDouble: { topLeft: '╓', top: '─', topRight: '╖', right: '║', bottomRight: '╜', bottom: '─', bottomLeft: '╙', left: '║' },
  doubleSingle: { topLeft: '╒', top: '═', topRight: '╕', right: '│', bottomRight: '╛', bottom: '═', bottomLeft: '╘', left: '│' },
  classic: { topLeft: '+', top: '-', topRight: '+', right: '|', bottomRight: '+', bottom: '-', bottomLeft: '+', left: '|' },
  arrow: { topLeft: '↘', top: '↓', topRight: '↙', right: '←', bottomRight: '↖', bottom: '↑', bottomLeft: '↗', left: '→' },
};

/**
 * The terminal's width, in boxen's order of preference: stdout, then stderr, then
 * `COLUMNS`, then 80. Read at call time rather than at import, because a box drawn after a
 * resize should use the new width.
 */
function terminalColumns(): number {
  const { env, stdout, stderr } = process;
  if (stdout?.columns) return stdout.columns;
  if (stderr?.columns) return stderr.columns;
  if (env['COLUMNS'] !== undefined) return Number.parseInt(env['COLUMNS'], DECIMAL);
  return FALLBACK_COLUMNS;
}

/** `padding: 2` is two rows and six columns; an object is taken as written. */
function getObject(detail: number | Spacing | undefined): Required<Spacing> {
  if (typeof detail === 'number') {
    return { top: detail, right: detail * SIDE_MARGIN_RATIO, bottom: detail, left: detail * SIDE_MARGIN_RATIO };
  }
  return { top: 0, right: 0, bottom: 0, left: 0, ...detail };
}

const getBorderWidth = (borderStyle: string | BoxenBorderStyle | undefined): number => (borderStyle === NONE ? 0 : BORDERED);

const SIDES = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft', 'left', 'right', 'top', 'bottom'] as const;

/** widest-line, which is one line: the widest row, measured. */
const widestLine = (text: string): number => Math.max(0, ...text.split(NEWLINE).map((line) => stringWidth(line)));

/** ansi-align, ported. `left` is a no-op; `center` pads by half the difference, floored. */
function ansiAlign(text: string, align: 'left' | 'center' | 'right'): string {
  if (text === '' || align === 'left') return text;
  const lines = text.split(NEWLINE).map((line) => ({ line, width: stringWidth(line) }));
  const maxWidth = Math.max(0, ...lines.map((l) => l.width));
  const diff = (w: number): number => (align === 'right' ? maxWidth - w : Math.floor((maxWidth - w) / HALF));
  return lines.map((l) => PAD.repeat(diff(l.width)) + l.line).join(NEWLINE);
}

/** Resolve a border style name or object to its eight characters, refusing anything else. */
function getBorderChars(borderStyle: string | BoxenBorderStyle | undefined): BoxenBorderStyle {
  if (borderStyle === NONE) {
    return { topLeft: '', top: '', topRight: '', left: '', right: '', bottomLeft: '', bottom: '', bottomRight: '' };
  }

  if (typeof borderStyle === 'string') {
    const characters = BOXES[borderStyle];
    if (!characters) throw new TypeError(`Invalid border style: ${borderStyle}`);
    return characters;
  }

  const style = { ...borderStyle } as BoxenBorderStyle;
  // Retro-compatibility, kept because boxen keeps it: `vertical`/`horizontal` set both sides.
  if (typeof style.vertical === 'string') {
    style.left = style.vertical;
    style.right = style.vertical;
  }
  if (typeof style.horizontal === 'string') {
    style.top = style.horizontal;
    style.bottom = style.horizontal;
  }
  for (const side of SIDES) {
    if (typeof style[side] !== 'string') throw new TypeError(`Invalid border style: ${side}`);
  }
  return style;
}

/** The title written into the top border, aligned within the horizontal run it replaces. */
function makeTitle(text: string, horizontalRun: string, alignment: BoxenOptions['titleAlignment']): string {
  const textWidth = stringWidth(text);
  if (alignment === 'left') return text + horizontalRun.slice(textWidth);
  if (alignment === 'right') return horizontalRun.slice(textWidth) + text;

  let horizontal = horizontalRun.slice(textWidth);
  if (horizontal.length % HALF === 1) {
    // An odd remainder cannot split evenly; boxen takes one character off the left so the
    // bar does not run past its own corner.
    horizontal = horizontal.slice(Math.floor(horizontal.length / HALF));
    return horizontal.slice(1) + text + horizontal;
  }
  horizontal = horizontal.slice(horizontal.length / HALF);
  return horizontal + text + horizontal;
}

interface Resolved extends Omit<BoxenOptions, 'padding' | 'margin'> {
  padding: Required<Spacing>;
  margin: Required<Spacing>;
  width: number;
}

/** One over-wide line, wrapped and re-aligned within the width the box actually has. */
function rewrap(line: string, max: number, align: 'left' | 'center' | 'right'): string[] {
  const alignedLines = ansiAlign(wrapAnsi(line, max, { hard: true }), align).split(NEWLINE);
  const longest = Math.max(0, ...alignedLines.map((s) => stringWidth(s)));
  if (align === 'center') return alignedLines.map((l) => PAD.repeat((max - longest) / HALF) + l);
  if (align === 'right') return alignedLines.map((l) => PAD.repeat(max - longest) + l);
  return alignedLines;
}

/** Pad every row to the box's width, then add the top and bottom padding rows. */
function padRows(lines: string[], padding: Required<Spacing>, width: number): string[] {
  const left = PAD.repeat(padding.left);
  const right = PAD.repeat(padding.right);
  const padded = lines.map((line) => {
    const newLine = left + line + right;
    return newLine + PAD.repeat(width - stringWidth(newLine));
  });
  return [
    ...Array.from({ length: padding.top }, () => PAD.repeat(width)),
    ...padded,
    ...Array.from({ length: padding.bottom }, () => PAD.repeat(width)),
  ];
}

/** Cut or grow to a fixed height. `height` of 0 or undefined leaves the rows alone. */
function fitHeight(lines: string[], height: number | undefined, width: number): string[] {
  if (height === undefined || height <= 0) return lines;
  if (lines.length > height) return lines.slice(0, height);
  return [...lines, ...Array.from({ length: height - lines.length }, () => PAD.repeat(width))];
}

/** Wrap and align the content, pad it, and cut or grow it to a fixed height. */
function makeContentText(text: string, { padding, width, textAlignment, height }: Resolved): string {
  const align = textAlignment ?? 'left';
  const aligned = ansiAlign(text, align);
  let lines = aligned.split(NEWLINE);
  const textWidth = widestLine(aligned);
  const max = width - padding.left - padding.right;

  if (textWidth > max) lines = lines.flatMap((line) => rewrap(line, max, align));

  if (align === 'center' && textWidth < max) lines = lines.map((line) => PAD.repeat((max - textWidth) / HALF) + line);
  else if (align === 'right' && textWidth < max) lines = lines.map((line) => PAD.repeat(max - textWidth) + line);

  return fitHeight(padRows(lines, padding, width), height, width).join(NEWLINE);
}

const isHex = (color: string): boolean => /^#(?:[0-f]{3}){1,2}$/i.test(color);
type ChalkFn = (s: string) => string;

/**
 * chalk, looked up by name. boxen resolves its colours as `chalk[color]` and
 * `chalk[bgRed]` — a string reaching a property — which is the one shape a typed façade
 * cannot express directly. Going through `Record<string, unknown>` and checking the result
 * is a function keeps the lookup honest: an unknown name yields `undefined` rather than
 * something that blows up at the call site, and `isColorValid()` refuses it before then.
 */
function named(name: string): ChalkFn | undefined {
  const value: unknown = Reflect.get(chalk, name);
  return typeof value === 'function' ? (value as ChalkFn) : undefined;
}

/** `bg` + `red` → `bgRed`; camelcase, for the one shape boxen asks of it. */
const bgName = (color: string): string => `bg${color.charAt(0).toUpperCase()}${color.slice(1)}`;

/** What an unknown colour would paint with. Unreachable: `isColorValid()` refuses one first. */
const asIs: ChalkFn = (text) => text;

const isColorValid = (color: unknown): boolean => typeof color === 'string' && (named(color) !== undefined || isHex(color));
const colorFunction = (color: string): ChalkFn => (isHex(color) ? chalk.hex(color) : (named(color) ?? asIs));
const bgColorFunction = (color: string): ChalkFn => (isHex(color) ? chalk.bgHex(color) : (named(bgName(color)) ?? asIs));

/** Draw the borders and the margins around content that is already the right size. */
function boxContent(content: string, contentWidth: number, options: Resolved): string {
  const colorizeBorder = (border: string): string => {
    const painted = options.borderColor === undefined ? border : colorFunction(options.borderColor)(border);
    return options.dimBorder === true ? chalk.dim(painted) : painted;
  };
  const colorizeContent = (line: string): string => (options.backgroundColor === undefined ? line : bgColorFunction(options.backgroundColor)(line));

  const chars = getBorderChars(options.borderStyle);
  const columns = terminalColumns();
  let marginLeft = PAD.repeat(options.margin.left);

  if (options.float === 'center') {
    marginLeft = PAD.repeat(Math.max((columns - contentWidth - getBorderWidth(options.borderStyle)) / HALF, 0));
  } else if (options.float === 'right') {
    marginLeft = PAD.repeat(Math.max(columns - contentWidth - options.margin.right - getBorderWidth(options.borderStyle), 0));
  }

  let result = '';
  if (options.margin.top) result += NEWLINE.repeat(options.margin.top);

  if (options.borderStyle !== NONE || options.title !== undefined) {
    const run = chars.top.repeat(contentWidth);
    const top = options.title === undefined ? run : makeTitle(options.title, run, options.titleAlignment);
    result += `${colorizeBorder(marginLeft + chars.topLeft + top + chars.topRight)}${NEWLINE}`;
  }

  result += content
    .split(NEWLINE)
    .map((line) => marginLeft + colorizeBorder(chars.left) + colorizeContent(line) + colorizeBorder(chars.right))
    .join(NEWLINE);

  if (options.borderStyle !== NONE) {
    result += NEWLINE + colorizeBorder(marginLeft + chars.bottomLeft + chars.bottom.repeat(contentWidth) + chars.bottomRight);
  }
  if (options.margin.bottom) result += NEWLINE.repeat(options.margin.bottom);
  return result;
}

/** `fullscreen` maxes out whichever of width/height was not given. */
function sanitizeOptions(options: Resolved & { fullscreen?: BoxenOptions['fullscreen'] }): Resolved {
  if (options.fullscreen !== undefined && options.fullscreen !== false && process.stdout) {
    let dimensions: [number, number] = [process.stdout.columns, process.stdout.rows];
    if (typeof options.fullscreen === 'function') dimensions = options.fullscreen(...dimensions);
    options.width ||= dimensions[0];
    options.height ||= dimensions[1];
  }
  // `&&=`, as boxen writes it: a width of 0 stays 0 rather than becoming 1.
  if (options.width) options.width = Math.max(1, options.width - getBorderWidth(options.borderStyle));
  if (options.height) options.height = Math.max(1, options.height - getBorderWidth(options.borderStyle));
  return options;
}

const formatTitle = (title: string, borderStyle: BoxenOptions['borderStyle']): string => (borderStyle === NONE ? title : ` ${title} `);

/**
 * Cut the title to what the box can hold, and — when the width was not fixed — let a title
 * wider than the content decide the box's width. Mutates, as boxen does.
 */
function sizeTitle(options: Resolved, { widthOverride, maxWidth, widest }: { widthOverride: boolean; maxWidth: number; widest: number }): void {
  if (options.title === undefined) return;
  if (widthOverride) {
    options.title = options.title.slice(0, Math.max(0, options.width - HALF));
    if (options.title) options.title = formatTitle(options.title, options.borderStyle);
    return;
  }
  options.title = options.title.slice(0, Math.max(0, maxWidth - HALF));
  if (!options.title) return;
  options.title = formatTitle(options.title, options.borderStyle);
  if (stringWidth(options.title) > widest) options.width = stringWidth(options.title);
}

/** Settle the box's width, the title's width, and how much the margins may keep. */
function determineDimensions(text: string, input: Resolved): Resolved {
  const options = sanitizeOptions(input);
  const widthOverride = options.width !== undefined && options.width !== 0;
  const columns = terminalColumns();
  const borderWidth = getBorderWidth(options.borderStyle);
  const maxWidth = columns - options.margin.left - options.margin.right - borderWidth;
  const widest = widestLine(wrapAnsi(text, columns - borderWidth, { hard: true, trim: false })) + options.padding.left + options.padding.right;

  sizeTitle(options, { widthOverride, maxWidth, widest });
  options.width ||= widest;

  if (!widthOverride) {
    if (options.margin.left && options.margin.right && options.width > maxWidth) {
      // Both margins shrink in proportion, so a box that cannot fit keeps their ratio.
      const spaceForMargins = columns - options.width - borderWidth;
      const multiplier = spaceForMargins / (options.margin.left + options.margin.right);
      options.margin.left = Math.max(0, Math.floor(options.margin.left * multiplier));
      options.margin.right = Math.max(0, Math.floor(options.margin.right * multiplier));
    }
    options.width = Math.min(options.width, columns - borderWidth - options.margin.left - options.margin.right);
  }

  if (options.width - (options.padding.left + options.padding.right) <= 0) {
    options.padding.left = 0;
    options.padding.right = 0;
  }
  if (options.height !== undefined && options.height - (options.padding.top + options.padding.bottom) <= 0) {
    options.padding.top = 0;
    options.padding.bottom = 0;
  }
  return options;
}

/**
 * Draw a box around `text`, exactly as boxen 8 draws it.
 *
 * An invalid `borderColor` or `backgroundColor` throws rather than drawing something
 * plausible, because boxen throws: a colour name that is not one is a typo, and a box drawn
 * in the wrong colour is a bug somebody ships.
 */
/** boxen re-exports cli-boxes under this name, so it is surface a caller can reach. */
export { BOXES as _borderStyles };

/**
 * `import boxen from 'boxen'` is the incumbent's surface. A named export here would break
 * every migration this file exists to serve, so the house rule yields to the host.
 */
// eslint-disable-next-line import-next/no-default-export -- see above
export default function boxen(text: string, options: BoxenOptions = {}): string {
  const merged: BoxenOptions = { borderStyle: 'single', dimBorder: false, textAlignment: 'left', float: 'left', titleAlignment: 'left', padding: 0, ...options };
  // `align` is boxen's deprecated name for `textAlignment`, and its suite still passes it.
  if (merged.align !== undefined) merged.textAlignment = merged.align;

  if (merged.borderColor !== undefined && !isColorValid(merged.borderColor)) throw new Error(`${merged.borderColor} is not a valid borderColor`);
  if (merged.backgroundColor !== undefined && !isColorValid(merged.backgroundColor)) throw new Error(`${merged.backgroundColor} is not a valid backgroundColor`);

  const resolved = {
    ...merged,
    padding: getObject(merged.padding),
    margin: getObject(merged.margin),
    width: merged.width ?? 0,
  } as Resolved;

  const dimensions = determineDimensions(text, resolved);
  return boxContent(makeContentText(text, dimensions), dimensions.width, dimensions);
}
